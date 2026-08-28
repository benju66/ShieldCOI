import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, FileWarning, ZoomIn, ZoomOut, Maximize } from "lucide-react";
// Vite bundles this as a real web worker and gives us a constructor. Using a worker
// instance (?worker) is far more reliable than a worker URL (?url) across the dev
// Express-middleware server and the Vercel static build.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// The text-layer parser and the FieldLocation shape live in coiTextParse.ts —
// they are also the second source for the extraction cross-check, so they are
// shared rather than owned by this component. Re-exported for existing importers.
import type { FieldLocation } from "../coiTextParse";
import { deriveLocationsFromText } from "../coiTextParse";
export type { FieldLocation };
export { deriveLocationsFromText };

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
        // Rasterize well above display size: the viewer's CSS zoom goes to 5x, so a
        // low-res raster turns blurry the moment the reviewer zooms in on a limit.
        // 2x the device pixel ratio (min 3, max 4) keeps text crisp through typical
        // zoom levels without the canvas memory of a full 5x render; 0.92 JPEG
        // avoids compression fuzz on form text while staying far smaller than PNG
        // for scanned (photographic) certificates.
        const renderScale = Math.min(4, Math.max(3, 2 * (window.devicePixelRatio || 1)));
        for (let i = 1; i <= total; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          out.push({ pageNumber: i, dataUrl: canvas.toDataURL("image/jpeg", 0.92) });
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
