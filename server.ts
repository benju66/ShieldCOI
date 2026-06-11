import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.includes("MY_GEMINI_API_KEY") || key.trim() === "") {
      throw new Error("GEMINI_API_KEY is not configured or is a placeholder.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // AI Scan Endpoint
  app.post("/api/scan-coi", async (req, res) => {
    try {
      const { fileData, mimeType, fileName } = req.body;

      if (!fileData) {
        return res.status(400).json({ error: "No file content provided" });
      }

      console.log(`Analyzing file "${fileName}" with mimeType "${mimeType}"...`);

      // Attempt real scan if API Key is configured
      try {
        const ai = getGeminiClient();

        const imagePart = {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: fileData,
          },
        };

        const promptText = `You are an expert insurance auditor. Extract values solely from the standard ACORD 25 Certificate of Liability Insurance form layout. 
Differentiate between the Commercial General Liability, Automobile Liability, and Workers Compensation sections. 

Extract:
1. "insured_name": Look under 'INSURED' box at the top of the form.
2. "gl_each_occurrence": General Liability - EACH OCCURRENCE limit ($). Set to 0 if not found.
3. "gl_general_aggregate": General Liability - GENERAL AGGREGATE limit ($). Set to 0 if not found.
4. "auto_combined_single_limit": AUTOMOBILE LIABILITY - COMBINED SINGLE LIMIT (each accident) ($). Set to 0 if not found.
5. "workers_comp_statutory": WORKERS COMPENSATION - are limits statutory (usually marked as WC EXEMPT or checkboxes Yes/No)? Set to true if STATUTORY is checked or indicated, else false.
6. "policy_expiration_date": Look for the General Liability, Automobile, or main policy EXPIRATION DATE. Format as 'YYYY-MM-DD'.
7. "gl_products_completed": PRODUCTS - COMP/OP AGG limit ($). Set to 0 if not found.
8. "umbrella_limit": UMBRELLA/EXCESS EACH OCCURRENCE limit ($). Set to 0 if not found.
9. "employers_liability_accident": Employers' Liability: E.L. EACH ACCIDENT limit ($). Set to 0 if not found.
10. "employers_liability_disease_person": Employers' Liability: E.L. DISEASE - EA EMPLOYEE limit ($). Set to 0 if not found.
11. "employers_liability_disease_limit": Employers' Liability: E.L. DISEASE - POLICY LIMIT ($). Set to 0 if not found.
12. "professional_liability": Professional Liability (usually under other/additional lines) ($). Set to 0 if not found.
13. "pollution_liability": Pollution Liability (usually under other/additional lines or endorsements) ($). Set to 0 if not found.

Strictly return ONLY the requested JSON schema.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [imagePart, { text: promptText }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                insured_name: { type: Type.STRING },
                gl_each_occurrence: { type: Type.NUMBER },
                gl_general_aggregate: { type: Type.NUMBER },
                auto_combined_single_limit: { type: Type.NUMBER },
                workers_comp_statutory: { type: Type.BOOLEAN },
                policy_expiration_date: { type: Type.STRING, description: "YYYY-MM-DD form" },
                gl_products_completed: { type: Type.NUMBER },
                umbrella_limit: { type: Type.NUMBER },
                employers_liability_accident: { type: Type.NUMBER },
                employers_liability_disease_person: { type: Type.NUMBER },
                employers_liability_disease_limit: { type: Type.NUMBER },
                professional_liability: { type: Type.NUMBER },
                pollution_liability: { type: Type.NUMBER },
              },
              required: [
                "insured_name",
                "gl_each_occurrence",
                "gl_general_aggregate",
                "auto_combined_single_limit",
                "workers_comp_statutory",
                "policy_expiration_date",
                "gl_products_completed",
                "umbrella_limit",
                "employers_liability_accident",
                "employers_liability_disease_person",
                "employers_liability_disease_limit",
                "professional_liability",
                "pollution_liability",
              ],
            },
          },
        });

        const textResponse = response.text;
        if (textResponse) {
          console.log("Raw Gemini Output:", textResponse);
          const parsedData = JSON.parse(textResponse.trim());
          return res.json({ success: true, data: parsedData, simulated: false });
        } else {
          throw new Error("Empty response text from Gemini");
        }
      } catch (gemError: any) {
        // Log Gemini error but fallback gracefully to mock parser so UI works perfectly during testing
        console.warn("Real Gemini Scanning failed or is unconfigured. Fallback to AI Simulator...", gemError.message);
        
        // Let's create realistic mock extraction based on standard construction sample names
        let insuredName = "ACME Electrical Solutions LLC";
        let glOcc = 2000000;
        let glAgg = 4000000;
        let autoLimit = 1000000;
        let wcStat = true;
        let expireDate = "2026-09-15"; // Future date (Compliant)
        let glProd = 2000000;
        let umbrellaVal = 5000000; // meets $5M for Electrical
        let elAcc = 1000000;
        let elDisePer = 1000000;
        let elDiseLim = 1000000;
        let profLiabVal = 2000000; // meets $2M professional
        let pollLiabVal = 0;

        const nameLower = (fileName || "").toLowerCase();
        if (nameLower.includes("apex") || nameLower.includes("plumbing")) {
          insuredName = "Apex Plumbing & Piping Co.";
          glOcc = 1000000; // Will fail if requirement is $2M
          glAgg = 2000000;
          autoLimit = 500000; // Insufficient Auto
          wcStat = false;
          expireDate = "2026-11-20";
          glProd = 2000000;
          umbrellaVal = 5000000;
          elAcc = 1000000;
          elDisePer = 1000000;
          elDiseLim = 1000000;
          profLiabVal = 2000000;
          pollLiabVal = 2000000;
        } else if (nameLower.includes("titan") || nameLower.includes("steel") || nameLower.includes("frame")) {
          insuredName = "Titan Structural Steel Corp";
          glOcc = 5000000;
          glAgg = 10000000;
          autoLimit = 2000000;
          wcStat = true;
          expireDate = "2026-05-10"; // Already expired (Relative to June 2026 current time)
          glProd = 4000000;
          umbrellaVal = 10000000; // meets $10M for crane/steel
          elAcc = 2000000;
          elDisePer = 2000000;
          elDiseLim = 2000000;
          profLiabVal = 0;
          pollLiabVal = 0;
        } else if (nameLower.includes("vortex") || nameLower.includes("hvac") || nameLower.includes("mechanical")) {
          insuredName = "Vortex Mechanical Services";
          glOcc = 1500000;
          glAgg = 3000000;
          autoLimit = 1000000;
          wcStat = true;
          expireDate = "2026-07-01"; // Expiring soon
          glProd = 1500000;
          umbrellaVal = 1000000; // short of trade required umbrella
          elAcc = 1000000;
          elDisePer = 1000000;
          elDiseLim = 1000000;
          profLiabVal = 2000000;
          pollLiabVal = 2000000;
        } else if (nameLower.includes("solid") || nameLower.includes("concrete")) {
          insuredName = "Solid Ground Concrete Works";
          glOcc = 2000000;
          glAgg = 4000000;
          autoLimit = 1000000;
          wcStat = true;
          expireDate = "2027-01-15";
          glProd = 2000000;
          umbrellaVal = 5000000;
          elAcc = 1000000;
          elDisePer = 1000000;
          elDiseLim = 1000000;
          profLiabVal = 0;
          pollLiabVal = 2000000;
        }

        // Simulate network/processing latency
        await new Promise((resolve) => setTimeout(resolve, 2000));

        return res.json({
          success: true,
          data: {
            insured_name: insuredName,
            gl_each_occurrence: glOcc,
            gl_general_aggregate: glAgg,
            auto_combined_single_limit: autoLimit,
            workers_comp_statutory: wcStat,
            policy_expiration_date: expireDate,
            gl_products_completed: glProd,
            umbrella_limit: umbrellaVal,
            employers_liability_accident: elAcc,
            employers_liability_disease_person: elDisePer,
            employers_liability_disease_limit: elDiseLim,
            professional_liability: profLiabVal,
            pollution_liability: pollLiabVal,
          },
          simulated: true,
          warning: gemError.message.includes("is not configured") 
            ? "Using simulated AI extraction because GEMINI_API_KEY is not set in Secrets." 
            : `AI Simulator engaged: ${gemError.message}`,
        });
      }
    } catch (err: any) {
      console.error("Scanning Error:", err);
      res.status(500).json({ error: err.message || "COI document scanning failed." });
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
