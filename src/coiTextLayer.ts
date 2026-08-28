// Vite bundles this as a real web worker and gives us a constructor. Using a
// worker instance (?worker) is far more reliable than a worker URL (?url) across
// the dev Express-middleware server and the Vercel static build.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { deriveFieldsFromText, textLayerValues, TextLayerValues } from "./coiTextParse";

/**
 * Browser-side loader for the certificate's text layer — the second source in
 * the extraction cross-check.
 *
 * Kept apart from coiTextParse.ts on purpose: that module is pure and unit
 * tested, while this one pulls in pdf.js and a Vite worker import that cannot
 * resolve under the Node test runner.
 *
 * Every failure path returns {} rather than throwing. A missing second opinion
 * must degrade to "unverified" — it must never block or fail an upload that the
 * AI extraction already handled.
 */

let sharedWorker: Worker | null = null;
function getPdfWorker(): Worker {
  if (!sharedWorker) sharedWorker = new PdfWorker();
  return sharedWorker;
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Certificates are short; reading beyond this is wasted work. */
const MAX_PAGES = 4;

/**
 * Read the ACORD 25 values out of a PDF's text layer.
 *
 * Returns {} for anything without one — photos, scans, and faxed certificates
 * are a large share of what subcontractors actually send, and for those the
 * cross-check simply is not available. Callers must present that as "single
 * source", never as agreement.
 */
export async function readTextLayerValues(fileDataBase64: string, fileMime: string): Promise<TextLayerValues> {
  if (!fileDataBase64 || !/pdf/i.test(fileMime || "")) return {};
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerPort = getPdfWorker();
    const loadingTask = pdfjsLib.getDocument({ data: base64ToUint8(fileDataBase64) });
    // Never hang the upload waiting on a second opinion.
    const pdf: any = await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("pdf text-layer timeout")), 9000)),
    ]);

    const found = [];
    const total = Math.min(pdf.numPages, MAX_PAGES);
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      found.push(...deriveFieldsFromText(tc.items as any[], vp1, i));
    }
    return textLayerValues(found);
  } catch (err) {
    // A scanned certificate lands here routinely — not worth alarming the user.
    console.info("Text-layer cross-check unavailable for this document:", err);
    return {};
  }
}
