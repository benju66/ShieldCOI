import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, FileWarning, ZoomIn, ZoomOut, Maximize } from "lucide-react";
// Vite bundles this as a real web worker and gives us a constructor. Using a worker
// instance (?worker) is far more reliable than a worker URL (?url) across the dev
// Express-middleware server and the Vercel static build.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// A bounding box for one extracted field, so the matrix can be tied back to the
// document. Coordinates follow Gemini's convention: [ymin, xmin, ymax, xmax]
// normalized to 0–1000, relative to the given (1-based) page.
export interface FieldLocation {
  field: string;
  page?: number;
  box_2d: number[]; // [ymin, xmin, ymax, xmax]
}

// Deterministic field positions for the standard ACORD 25 (2016/03) layout, normalized
// 0–1000 as [ymin, xmin, ymax, xmax] on page 1. The form is standardized, so these land
// "very close" on native ACORD 25 certificates without any AI coordinate guessing.
// Positions are tunable — nudge these values to refine alignment.
export const ACORD25_FIELD_TEMPLATE: FieldLocation[] = [
  // INSURED box sits below PRODUCER, ~27–31% down the page.
  { field: "insured_name", page: 1, box_2d: [268, 22, 316, 470] },
  // POLICY EXP column, GL row.
  { field: "policy_expiration_date", page: 1, box_2d: [423, 555, 450, 655] },
  // LIMITS column (right side), one row per coverage line.
  { field: "gl_each_occurrence", page: 1, box_2d: [419, 700, 446, 905] },
  { field: "gl_general_aggregate", page: 1, box_2d: [486, 700, 513, 905] },
  { field: "gl_products_completed", page: 1, box_2d: [504, 700, 531, 905] },
  { field: "auto_combined_single_limit", page: 1, box_2d: [534, 700, 561, 905] },
  { field: "umbrella_limit", page: 1, box_2d: [607, 700, 634, 905] },
  { field: "employers_liability_accident", page: 1, box_2d: [699, 700, 724, 905] },
  { field: "employers_liability_disease_person", page: 1, box_2d: [723, 700, 748, 905] },
  { field: "employers_liability_disease_limit", page: 1, box_2d: [746, 700, 772, 905] },
  // DESCRIPTION OF OPERATIONS box (additional insured wording).
  { field: "additional_insured", page: 1, box_2d: [793, 22, 872, 978] },
];

interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
}

interface DocumentViewerProps {
  fileData: string; // base64, no data: prefix
  fileMime: string;
  locations?: FieldLocation[];
  fieldStatus?: Record<string, "pass" | "fail" | "neutral">;
  fieldLabels?: Record<string, string>;
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const BOX_CLASS: Record<string, string> = {
  pass: "border-emerald-500 bg-emerald-400/10",
  fail: "border-red-500 bg-red-500/15",
  neutral: "border-blue-500 bg-blue-400/10",
};
const LABEL_CLASS: Record<string, string> = {
  pass: "bg-emerald-600 text-white",
  fail: "bg-red-600 text-white",
  neutral: "bg-blue-600 text-white",
};
// Stronger fill + border when a box is hovered, so it pops without a permanent label.
const BOX_HOVER: Record<string, string> = {
  pass: "hover:bg-emerald-400/30 hover:border-emerald-600",
  fail: "hover:bg-red-500/35 hover:border-red-600",
  neutral: "hover:bg-blue-400/30 hover:border-blue-600",
};

// pdf.js worker as a lazily-created singleton — reused across documents, no leak.
let sharedWorker: Worker | null = null;
function getPdfWorker(): Worker {
  if (!sharedWorker) sharedWorker = new PdfWorker();
  return sharedWorker;
}

// Guard against malformed model output (e.g. corrupt exponent numbers): a box is only
// usable if it's four finite values within the 0–1000 normalized range.
const isValidBox = (l: FieldLocation) =>
  Array.isArray(l.box_2d) &&
  l.box_2d.length === 4 &&
  l.box_2d.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000);

function pageOf(l: FieldLocation): number {
  const p = Math.round(Number(l.page));
  return Number.isFinite(p) && p >= 1 && p <= 50 ? p : 1;
}

// --- Text-layer field snapping -------------------------------------------------
// ACORD 25 is a standardized form: the coverage labels ("EACH OCCURRENCE", etc.)
// are fixed text, and each value sits on the same row in the LIMITS column. We anchor
// on those labels and snap the highlight onto the actual value text — exact per cert,
// regardless of insurer. `items` are pdf.js text items; `vp` is the scale-1 viewport.
function boxOf(it: any, vp: { width: number; height: number }): number[] {
  const e = it.transform[4];
  const f = it.transform[5];
  const w = it.width || 0;
  const h = it.height || Math.hypot(it.transform[2] || 0, it.transform[3] || 0) || 8;
  return [
    ((vp.height - (f + h)) / vp.height) * 1000, // ymin (top)
    (e / vp.width) * 1000, // xmin
    ((vp.height - f) / vp.height) * 1000, // ymax (bottom)
    ((e + w) / vp.width) * 1000, // xmax
  ];
}
const padBox = (b: number[], dy: number, dx: number): number[] => [
  Math.max(0, b[0] - dy),
  Math.max(0, b[1] - dx),
  Math.min(1000, b[2] + dy),
  Math.min(1000, b[3] + dx),
];

export function deriveLocationsFromText(items: any[], vp: { width: number; height: number }, page: number): FieldLocation[] {
  const norm = items
    .filter((it) => it && Array.isArray(it.transform) && (it.str || "").trim())
    .map((it) => ({
      str: (it.str as string).trim(),
      x: (it.transform[4] / vp.width) * 1000,
      y: ((vp.height - it.transform[5]) / vp.height) * 1000,
      box: boxOf(it, vp),
    }));
  const isMoney = (s: string) => /^\$?\s*\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
  const money = norm.filter((o) => isMoney(o.str));
  const labels = (re: RegExp) => norm.filter((o) => re.test(o.str)).sort((a, b) => a.y - b.y);
  const valueRightOf = (lab: { x: number; y: number }, tol = 12) =>
    money.filter((m) => Math.abs(m.y - lab.y) < tol && m.x > lab.x).sort((a, b) => a.x - b.x)[0];

  const out: FieldLocation[] = [];
  const push = (field: string, box?: number[]) => {
    if (box) out.push({ field, page, box_2d: padBox(box, 3, 4) });
  };

  // "EACH OCCURRENCE" appears twice: GL (upper) and Umbrella (lower).
  const eaOcc = labels(/^each occurrence$/i);
  if (eaOcc[0]) push("gl_each_occurrence", valueRightOf(eaOcc[0])?.box);
  if (eaOcc[1]) push("umbrella_limit", valueRightOf(eaOcc[1])?.box);

  const simple: [string, RegExp][] = [
    ["gl_general_aggregate", /^general aggregate$/i],
    ["gl_products_completed", /products\s*-?\s*comp/i],
    ["auto_combined_single_limit", /combined single limit/i],
    ["employers_liability_accident", /e\.?l\.?\s*each accident/i],
    ["employers_liability_disease_person", /e\.?l\.?\s*disease\s*-?\s*ea employee/i],
    ["employers_liability_disease_limit", /e\.?l\.?\s*disease\s*-?\s*policy limit/i],
  ];
  for (const [field, re] of simple) {
    const lab = labels(re)[0];
    if (lab) push(field, valueRightOf(lab)?.box);
  }

  // INSURED name: box the block just below the standalone "INSURED" label (left column).
  const insuredLab = norm.filter((o) => /^insured$/i.test(o.str) && o.x < 250).sort((a, b) => a.y - b.y)[0];
  if (insuredLab) {
    out.push({ field: "insured_name", page, box_2d: [insuredLab.y + 8, Math.max(2, insuredLab.x - 4), Math.min(1000, insuredLab.y + 62), 480] });
  }

  // Policy expiration: date in the POLICY EXP column on the GL row.
  const polExp = labels(/policy\s*exp/i)[0];
  if (polExp && eaOcc[0]) {
    const glY = eaOcc[0].y;
    const dateItem = norm
      .filter((o) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(o.str) && Math.abs(o.y - glY) < 14 && Math.abs(o.x - polExp.x) < 90)
      .sort((a, b) => Math.abs(a.x - polExp.x) - Math.abs(b.x - polExp.x))[0];
    if (dateItem) push("policy_expiration_date", dateItem.box);
    else out.push({ field: "policy_expiration_date", page, box_2d: [glY - 8, Math.max(0, polExp.x - 6), glY + 12, polExp.x + 84] });
  }

  // Additional insured: the DESCRIPTION OF OPERATIONS block.
  const desc = labels(/description of operations\s*\/\s*locations/i)[0];
  if (desc) out.push({ field: "additional_insured", page, box_2d: [Math.min(985, desc.y + 14), 20, Math.min(998, desc.y + 120), 980] });

  return out;
}

export default function DocumentViewer({ fileData, fileMime, locations = [], fieldStatus = {}, fieldLabels = {} }: DocumentViewerProps) {
  const isPdf = /pdf/i.test(fileMime);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [derived, setDerived] = useState<FieldLocation[]>([]);

  // Zoom + pan state (applied as a single transform so overlay boxes scale in lockstep).
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const zoomBy = (f: number) => setScale((s) => Math.min(5, Math.max(0.4, +(s * f).toFixed(3))));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 0.89);
    } else {
      // Plain wheel scrolls the document vertically (and horizontally with shift).
      setOffset((o) => ({ x: o.x - (e.shiftKey ? e.deltaY : 0), y: o.y - (e.shiftKey ? 0 : e.deltaY) }));
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.sx), y: dragRef.current.oy + (e.clientY - dragRef.current.sy) });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    resetView();
    setDerived([]);

    if (!fileData) {
      setStatus("error");
      return;
    }

    // Images need no rasterization — display them directly.
    if (!isPdf) {
      setPages([{ pageNumber: 1, dataUrl: `data:${fileMime || "image/png"};base64,${fileData}` }]);
      setStatus("done");
      return;
    }

    // PDFs are rasterized page-by-page so we can overlay highlight boxes on them.
    setStatus("loading");
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerPort = getPdfWorker();
        const loadingTask = pdfjsLib.getDocument({ data: base64ToUint8(fileData) });
        // Never hang: if the worker never answers, bail to the native embed fallback.
        const pdf: any = await Promise.race([
          loadingTask.promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("pdf render timeout")), 9000)),
        ]);
        const total = Math.min(pdf.numPages, 6);
        const out: RenderedPage[] = [];
        const derivedAll: FieldLocation[] = [];
        for (let i = 1; i <= total; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          out.push({ pageNumber: i, dataUrl: canvas.toDataURL("image/jpeg", 0.85) });
          try {
            const vp1 = page.getViewport({ scale: 1 });
            const tc = await page.getTextContent();
            derivedAll.push(...deriveLocationsFromText(tc.items as any[], vp1, i));
          } catch {
            /* text layer is optional — fall back to the template */
          }
        }
        if (!cancelled) {
          setPages(out);
          setDerived(derivedAll);
          setStatus(out.length > 0 ? "done" : "error");
        }
      } catch (err) {
        console.error("PDF render failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileData, fileMime, isPdf]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <RefreshCw className="h-6 w-6 animate-spin mb-2" />
        <p className="text-[11px] font-semibold">Rendering document…</p>
      </div>
    );
  }

  if (status === "error") {
    // Fall back to a native embed so the reviewer can still read the doc (no overlays).
    if (isPdf && fileData) {
      return <iframe title="COI document" src={`data:application/pdf;base64,${fileData}`} className="w-full h-full border-0" />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4 text-center">
        <FileWarning className="h-6 w-6 mb-2 text-amber-500" />
        <p className="text-[11px] font-semibold">Preview unavailable for this document.</p>
      </div>
    );
  }

  const effectiveLocations = derived.length > 0 ? derived : locations;
  const locatedCount = effectiveLocations.filter(isValidBox).length;

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-[10px] text-slate-500">
          {locatedCount > 0 ? (
            <span className="font-semibold text-slate-600">{locatedCount} field{locatedCount === 1 ? "" : "s"} highlighted</span>
          ) : (
            <span className="text-amber-600">No highlights returned</span>
          )}
        </span>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md shadow-sm p-0.5">
          <button type="button" onClick={() => zoomBy(0.83)} title="Zoom out" className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-mono text-slate-500 w-9 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.2)} title="Zoom in" className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={resetView} title="Reset view" className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Pan/zoom viewport */}
      <div
        className="flex-1 overflow-hidden rounded-md bg-slate-200/40 cursor-grab active:cursor-grabbing touch-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="space-y-3 p-1 origin-top-left will-change-transform"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {pages.map((pg) => {
            const pageBoxes = effectiveLocations.filter((l) => isValidBox(l) && pageOf(l) === pg.pageNumber);
            return (
              <div key={pg.pageNumber} className="relative border border-slate-200 rounded-md overflow-hidden bg-white shadow-sm">
                <img src={pg.dataUrl} alt={`COI page ${pg.pageNumber}`} className="block w-full select-none pointer-events-none" draggable={false} />
                {pageBoxes.map((loc, idx) => {
                  const [ymin, xmin, ymax, xmax] = loc.box_2d;
                  const s = fieldStatus[loc.field] || "neutral";
                  return (
                    <div
                      key={`${loc.field}-${idx}`}
                      className={`group absolute border-2 rounded-sm pointer-events-auto cursor-help transition-colors hover:z-20 hover:ring-2 hover:ring-white/70 ${BOX_CLASS[s]} ${BOX_HOVER[s]}`}
                      style={{
                        top: `${ymin / 10}%`,
                        left: `${xmin / 10}%`,
                        width: `${Math.max(0, (xmax - xmin) / 10)}%`,
                        height: `${Math.max(0, (ymax - ymin) / 10)}%`,
                      }}
                    >
                      {/* Label appears only on hover, so it never covers a neighbouring value. */}
                      <span className={`hidden group-hover:block absolute bottom-full left-0 mb-0.5 px-1 rounded text-[8px] font-bold leading-[13px] whitespace-nowrap shadow-md z-30 ${LABEL_CLASS[s]}`}>
                        {fieldLabels[loc.field] || loc.field}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
