// Vercel serverless function: POST /api/scan-coi
// req/res are typed loosely so this builds on Vercel without requiring the
// @vercel/node types to be installed locally. Vercel provides the Express-like
// helpers (req.body, res.status, res.json) at runtime.
import { scanCoi } from "./_scan.js";

// Allow up to 60s for a real multimodal Gemini scan (default is short on Vercel).
export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await scanCoi(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error("Scanning Error:", err);
    return res.status(500).json({ error: err?.message || "COI document scanning failed." });
  }
}
