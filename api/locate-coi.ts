// Vercel serverless function: POST /api/locate-coi
//
// Where each extracted value sits on the certificate, for the highlight
// overlay. Deliberately a SEPARATE endpoint from /api/scan-coi: bounding boxes
// need visual grounding, which is slow, and folding them into the main scan
// pushed that call past its budget and returned 504s on a multi-page scan.
// Split out, each call gets its own duration budget, and a slow or failed
// locate costs nothing — the reviewer still has every compliance value.
import { locateCoiFields } from "./_scan.js";

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await locateCoiFields(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    // Highlights are optional; never surface this as a failure.
    console.warn("Locate route error:", err?.message || err);
    return res.status(200).json({ field_locations: [] });
  }
}
