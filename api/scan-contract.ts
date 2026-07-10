// Vercel serverless function: POST /api/scan-contract
import { scanContract } from "./_scan.js";

// Allow up to 60s for a real multimodal Gemini scan (default is short on Vercel).
export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await scanContract(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error("Contract Scanning Route Error:", err);
    return res.status(500).json({ error: err?.message || "Contract parsing failed." });
  }
}
