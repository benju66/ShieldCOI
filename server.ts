import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { scanCoi, scanContract } from "./api/_scan";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3020;

  app.use(express.json({ limit: "50mb" }));

  // AI Scan Endpoint (shares logic with the Vercel serverless function)
  app.post("/api/scan-coi", async (req, res) => {
    try {
      const result = await scanCoi(req.body);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error("Scanning Error:", err);
      res.status(500).json({ error: err.message || "COI document scanning failed." });
    }
  });

  // Prime Contract Exhibit Setup Extraction Endpoint (🧪 Experimental Feature)
  app.post("/api/scan-contract", async (req, res) => {
    try {
      const result = await scanContract(req.body);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error("Contract Scanning Route Error:", err);
      res.status(500).json({ error: err.message || "Contract parsing failed." });
    }
  });

  // Serve static files / integration with Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
