// Shared Gemini scanning logic used by both the local Express dev server
// (server.ts) and the Vercel serverless functions (api/scan-coi.ts,
// api/scan-contract.ts). Files prefixed with "_" are ignored as routes by Vercel.
import { GoogleGenAI, Type } from "@google/genai";

export interface ScanResult {
  status: number;
  body: any;
}

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

/**
 * Scan a Certificate of Insurance (ACORD 25) and extract policy limits.
 * Falls back to a deterministic simulator when Gemini is unavailable.
 */
export async function scanCoi(payload: any): Promise<ScanResult> {
  const { fileData, mimeType, fileName, custom_requirements, additional_insured_names } = payload || {};

  if (!fileData) {
    return { status: 400, body: { error: "No file content provided" } };
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

    const customObjProperties: Record<string, any> = {};
    let customPromptText = "";
    if (custom_requirements && Array.isArray(custom_requirements) && custom_requirements.length > 0) {
      customPromptText = `\n\nAdditionally, we have the following custom insurance coverages to evaluate. For each, extract the numerical limit (integer only, or null if not found on the certificate). Deliver them inside a "custom_extractions" record mapping each of these exact key-label names to their numerical extracted limit values:
${custom_requirements.map((req: any) => `- "${req.label}"`).join("\n")}`;

      custom_requirements.forEach((req: any) => {
        if (req.label) {
          customObjProperties[req.label] = {
            type: Type.NUMBER,
            description: `Extracted policy limit for ${req.label} in USD. Must be a number or null if missing/not found.`,
          };
        }
      });
    }

    let aiPromptText = "";
    if (additional_insured_names && Array.isArray(additional_insured_names) && additional_insured_names.length > 0) {
      aiPromptText = `\n\nThe project requires these specific entities to be listed as Additional Insured. When populating "additional_insured_named", include any that appear on the certificate even if the wording differs slightly (punctuation, "LLC"/"Inc.", "and its affiliates/officers/agents", etc.):\n${additional_insured_names.map((n: any) => `- "${n}"`).join("\n")}`;
    }

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
14. "additional_insured_named": An array of the exact company/entity names listed as Additional Insured on the certificate — look in the "DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES" box and any coverage row where the "ADDL INSD" column is checked. Return [] if none are named.
15. "additional_insured_blanket": true if the certificate uses BLANKET additional insured language such as "as required by written contract", "where required by written contract", "per blanket endorsement", or references blanket endorsement forms (e.g. CG 20 33, CG 20 38). Otherwise false.
16. "additional_insured_text": The exact additional-insured wording copied from the Description of Operations box (empty string if none).
17. "gl_addl_insd": true if the "ADDL INSD" column is checked / marked "Y" on the General Liability (Commercial General Liability) row.${customPromptText}${aiPromptText}

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
            additional_insured_named: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Entities explicitly named as Additional Insured on the certificate." },
            additional_insured_blanket: { type: Type.BOOLEAN, description: "True if blanket 'as required by written contract' additional insured language is present." },
            additional_insured_text: { type: Type.STRING, description: "Raw additional insured wording from the Description of Operations box." },
            gl_addl_insd: { type: Type.BOOLEAN, description: "True if the ADDL INSD column is checked on the General Liability row." },
            custom_extractions: {
              type: Type.OBJECT,
              properties: customObjProperties,
              description: "Key-value map of custom extractions mapping target label names to their parsed numeric limit values.",
            },
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
            "additional_insured_named",
            "additional_insured_blanket",
            "additional_insured_text",
            "gl_addl_insd",
          ],
        },
      },
    });

    const textResponse = response.text;
    if (textResponse) {
      console.log("Raw Gemini Output:", textResponse);
      const parsedData = JSON.parse(textResponse.trim());
      return { status: 200, body: { success: true, data: parsedData, simulated: false } };
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

    const customExtractions: Record<string, number | null> = {};
    if (custom_requirements && Array.isArray(custom_requirements)) {
      custom_requirements.forEach((req: any) => {
        if (req.label) {
          const reqLimit = Number(req.limit) || 0;
          if (nameLower.includes("apex") || nameLower.includes("plumbing")) {
            customExtractions[req.label] = reqLimit > 0 ? Math.round(reqLimit * 0.5) : null;
          } else if (nameLower.includes("titan") || nameLower.includes("steel")) {
            customExtractions[req.label] = null;
          } else {
            customExtractions[req.label] = reqLimit;
          }
        }
      });
    }

    // Additional Insured mock: echo the required names as "named" by default;
    // apex/plumbing → blanket-only (conditional pass); titan/steel → none (fail).
    const reqAiNames: string[] = Array.isArray(additional_insured_names) ? additional_insured_names : [];
    let aiNamedMock: string[] = reqAiNames.length > 0 ? [...reqAiNames] : ["Owner / General Contractor (per attached endorsement)"];
    let aiBlanketMock = true;
    let aiTextMock = "Certificate holder and owner are additional insureds as required by written contract per attached endorsement.";
    let aiGlAddlMock = true;
    if (nameLower.includes("apex") || nameLower.includes("plumbing")) {
      aiNamedMock = [];
      aiBlanketMock = true;
      aiTextMock = "Additional insured status applies where required by written contract.";
      aiGlAddlMock = true;
    } else if (nameLower.includes("titan") || nameLower.includes("steel") || nameLower.includes("frame")) {
      aiNamedMock = [];
      aiBlanketMock = false;
      aiTextMock = "";
      aiGlAddlMock = false;
    }

    // Simulate network/processing latency
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      status: 200,
      body: {
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
          custom_extractions: customExtractions,
          additional_insured_named: aiNamedMock,
          additional_insured_blanket: aiBlanketMock,
          additional_insured_text: aiTextMock,
          gl_addl_insd: aiGlAddlMock,
        },
        simulated: true,
        warning: gemError.message.includes("is not configured")
          ? "Using simulated AI extraction because GEMINI_API_KEY is not set in environment variables."
          : `AI Simulator engaged: ${gemError.message}`,
      },
    };
  }
}

/**
 * Scan a prime contract exhibit and extract the required baseline insurance
 * thresholds. Falls back to a deterministic simulator when Gemini is unavailable.
 */
export async function scanContract(payload: any): Promise<ScanResult> {
  const { fileData, mimeType, fileName } = payload || {};

  if (!fileData) {
    return { status: 400, body: { error: "No contract document data provided for AI scan" } };
  }

  console.log(`Analyzing Prime Contract Exhibit "${fileName}" with mimeType "${mimeType}"...`);

  try {
    const ai = getGeminiClient();

    const documentPart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: fileData,
      },
    };

    const systemInstruction = `You are an expert construction insurance risk auditor. Your task is to extract required contractor baseline liability insurance limits from an owner-contractor legal agreement exhibit (typically an AIA Document Exhibit A).
CRITICAL INSTRUCTION: You must ignore Article A.2 'Owner's Insurance' entirely. Do not extract property, builder's risk, or owner liability values. You must focus exclusively on Article A.3 'Contractor's Required Insurance Coverage'. Extract the exact numeric dollar thresholds for Each Occurrence, General Aggregate, Products-Completed Operations, Automobile Combined Single Limit, Umbrella/Excess Liability, and the three Employers' Liability limits. If a field cannot be found or is marked as statutory/standard, default to the closest logical corporate baseline or return null.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [documentPart, { text: "Scan the attached draft contract agreement and populate the insurance baseline thresholds schedule." }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            gl_occurrence: { type: Type.NUMBER },
            gl_aggregate: { type: Type.NUMBER },
            gl_products_completed: { type: Type.NUMBER },
            auto_limit: { type: Type.NUMBER },
            umbrella_limit: { type: Type.NUMBER },
            employers_liability_accident: { type: Type.NUMBER },
            employers_liability_disease_person: { type: Type.NUMBER },
            employers_liability_disease_limit: { type: Type.NUMBER },
            workers_comp: { type: Type.BOOLEAN },
          },
          required: [
            "projectName",
            "gl_occurrence",
            "gl_aggregate",
            "gl_products_completed",
            "auto_limit",
            "umbrella_limit",
            "employers_liability_accident",
            "employers_liability_disease_person",
            "employers_liability_disease_limit",
            "workers_comp",
          ],
        },
      },
    });

    const textResponse = response.text;
    if (textResponse) {
      console.log("Raw Gemini Contract Scan Output:", textResponse);
      const parsedData = JSON.parse(textResponse.trim());
      return { status: 200, body: { success: true, data: parsedData, simulated: false } };
    } else {
      throw new Error("Empty response text from Gemini during contract analysis");
    }
  } catch (gemError: any) {
    console.warn("Real Gemini Contract Scanning failed or unconfigured. Fallback to AI Simulator...", gemError.message);

    // Simulated responses for experimental/demonstration scenarios
    let pName = "Evergreen Commercial Complex";
    let glOccVal = 2000000;
    let glAggVal = 4000000;
    let glProdVal = 2000000;
    let autoLimitVal = 1000000;
    let umbrellaLimitVal = 5000000;
    let elAccidentVal = 1000000;
    let elDiseasePersonVal = 1000000;
    let elDiseaseLimitVal = 1000000;
    let wcRequiredVal = true;

    const nameLower = (fileName || "").toLowerCase();
    if (nameLower.includes("aurora") || nameLower.includes("luxury")) {
      pName = "Aurora Luxury Suites Phase II";
      glOccVal = 2500000;
      glAggVal = 5000000;
      glProdVal = 2500000;
      autoLimitVal = 1500000;
      umbrellaLimitVal = 2000000;
      elAccidentVal = 1000000;
      elDiseasePersonVal = 1000000;
      elDiseaseLimitVal = 1000000;
      wcRequiredVal = true;
    } else if (nameLower.includes("skyline") || nameLower.includes("apartments")) {
      pName = "Skyline Apartments Masterplan";
      glOccVal = 5000000;
      glAggVal = 10000000;
      glProdVal = 5000000;
      autoLimitVal = 2000000;
      umbrellaLimitVal = 10000000;
      elAccidentVal = 2000000;
      elDiseasePersonVal = 2000000;
      elDiseaseLimitVal = 2000000;
      wcRequiredVal = true;
    } else if (nameLower.includes("minimal") || nameLower.includes("low")) {
      pName = "Summit Warehouse Canopy Setup";
      glOccVal = 1000000;
      glAggVal = 2000000;
      glProdVal = 1000000;
      autoLimitVal = 1000000;
      umbrellaLimitVal = 0;
      elAccidentVal = 500000;
      elDiseasePersonVal = 500000;
      elDiseaseLimitVal = 500000;
      wcRequiredVal = false;
    }

    // Simulate reading & analysis processing lag
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      status: 200,
      body: {
        success: true,
        data: {
          projectName: pName,
          gl_occurrence: glOccVal,
          gl_aggregate: glAggVal,
          gl_products_completed: glProdVal,
          auto_limit: autoLimitVal,
          umbrella_limit: umbrellaLimitVal,
          employers_liability_accident: elAccidentVal,
          employers_liability_disease_person: elDiseasePersonVal,
          employers_liability_disease_limit: elDiseaseLimitVal,
          workers_comp: wcRequiredVal,
        },
        simulated: true,
        warning: gemError.message.includes("is not configured")
          ? "Using simulated AI extraction because GEMINI_API_KEY is not set in environment variables."
          : `AI Simulator engaged: ${gemError.message}`,
      },
    };
  }
}
