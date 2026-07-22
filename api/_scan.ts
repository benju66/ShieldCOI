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

// ---------------------------------------------------------------------------
// Sandbox demo fixtures
//
// The built-in "Instant Sandbox Simulator" buttons post these exact filenames.
// They return canned data BY DESIGN so the sandbox works without a Gemini key —
// they are the ONLY inputs that ever receive simulated data. A real upload never
// matches these names, so it can never silently receive fabricated results.
// ---------------------------------------------------------------------------

const SAMPLE_COI_FILES = new Set([
  "titan_steel_coi_2026.png",
  "apex_plumbing_coi_short.pdf",
  "solid_ground_compliance.jpg",
]);

const SAMPLE_CONTRACT_FILES = new Set([
  "Aurora_Luxury_Suites_Phase_2_Exhibit.pdf",
  "Skyline_Apartments_Exhibit_Section_A3.pdf",
]);

// Canonical trade names the app models (mirrors settingsService.DEFAULT_TRADES).
// Passed into the contract-scan prompt so any per-trade table maps onto them.
const CANONICAL_TRADES = [
  "Environmental",
  "Surveying",
  "Earthwork",
  "Concrete (Precast)",
  "Concrete (with Crane)",
  "Concrete (Standard)",
  "Masonry",
  "Rough Carpentry (with Crane)",
  "Rough Carpentry (Standard)",
  "Siding",
  "Roofing",
  "Windows",
  "Drywall",
  "Pool",
  "Elevators",
  "Fire Sprinkler",
  "Plumbing",
  "HVAC",
  "Electrical",
  "Other Trades",
];

function isSampleCoi(fileName?: string): boolean {
  return !!fileName && SAMPLE_COI_FILES.has(fileName);
}

function isSampleContract(fileName?: string): boolean {
  return !!fileName && SAMPLE_CONTRACT_FILES.has(fileName);
}

/** Deterministic canned COI extraction for the sandbox sample files. */
function buildSampleCoiData(fileName: string, custom_requirements?: any, additional_insured_names?: any) {
  // Realistic mock extraction based on the sample construction vendor names.
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

  return {
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
    gl_form: "Occurrence",
    endorsement_facts: {
      waiver_of_subrogation: true,
      primary_noncontributory: true,
      project_aggregate: false,
      completed_ops_ai: true,
    },
  };
}

/** Deterministic canned contract-baseline extraction for the sandbox exhibits. */
function buildSampleContractData(fileName: string) {
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
  }

  return {
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
    pollution_liability: 0, // conditional here — carried per-trade, not as a universal baseline
    professional_liability: 0,
    additional_insured_required: true,
    additional_insured_names: [pName],
    endorsements: {
      waiver_of_subrogation: true,
      primary_noncontributory: true,
      project_aggregate: true,
      completed_ops_ai: true,
    },
    conditional_notes:
      "Pollution Liability ($2M) required only for scopes involving pollutants or building enclosure, plumbing, HVAC, drywall, or foundations (Section A.5) — captured per-trade, not as a universal baseline.",
    trade_rules: [
      { trade: "Earthwork", umbrella: 5000000, professional_liability: 2000000, pollution_liability: 2000000 },
      { trade: "Concrete (with Crane)", umbrella: 10000000, professional_liability: 0, pollution_liability: 2000000 },
      { trade: "Roofing", umbrella: 5000000, professional_liability: 0, pollution_liability: 2000000 },
      { trade: "Elevators", umbrella: 10000000, professional_liability: 0, pollution_liability: 0 },
      { trade: "Fire Sprinkler", umbrella: 5000000, professional_liability: 2000000, pollution_liability: 0 },
      { trade: "Plumbing", umbrella: 5000000, professional_liability: 2000000, pollution_liability: 2000000 },
      { trade: "HVAC", umbrella: 5000000, professional_liability: 2000000, pollution_liability: 2000000 },
      { trade: "Electrical", umbrella: 5000000, professional_liability: 2000000, pollution_liability: 0 },
      { trade: "Other Trades", umbrella: 1000000, professional_liability: 0, pollution_liability: 0 },
    ],
  };
}

/**
 * Scan a Certificate of Insurance (ACORD 25) and extract policy limits.
 *
 * Fails CLOSED: a configuration problem or an extraction error returns an error,
 * never fabricated data — a false "compliant" is the one outcome we must never
 * produce. Only the built-in sandbox sample files receive simulated data.
 */
export async function scanCoi(payload: any): Promise<ScanResult> {
  const { fileData, mimeType, fileName, custom_requirements, additional_insured_names } = payload || {};

  if (!fileData) {
    return { status: 400, body: { error: "No file content provided" } };
  }

  console.log(`Analyzing file "${fileName}" with mimeType "${mimeType}"...`);

  // Sandbox sample → canned demo data (works without a Gemini key).
  if (isSampleCoi(fileName)) {
    return {
      status: 200,
      body: {
        success: true,
        data: buildSampleCoiData(fileName, custom_requirements, additional_insured_names),
        simulated: true,
        warning: "Sandbox sample — simulated extraction (not a real certificate).",
      },
    };
  }

  // Real extraction. If the extractor isn't configured, fail closed (503) rather
  // than fall back to a simulator that could report a non-compliant cert as OK.
  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (configError: any) {
    return {
      status: 503,
      body: {
        error:
          "AI extraction is unavailable (GEMINI_API_KEY is not configured). Enter the certificate details manually, or try a sandbox sample.",
        code: "extraction_unconfigured",
      },
    };
  }

  try {
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
17. "gl_addl_insd": true if the "ADDL INSD" column is checked / marked "Y" on the General Liability (Commercial General Liability) row.
18. "gl_form": Which basis is the Commercial General Liability written on? Read the FORM checkboxes in the CGL section — "OCCUR" vs "CLAIMS-MADE". Return exactly "Occurrence", "Claims-Made", or "Unknown" if it cannot be determined.
19. "endorsement_facts": An object of booleans. Set each true only if the certificate clearly indicates it (a checkbox / "Y", or explicit wording in the Description of Operations box), otherwise false: "waiver_of_subrogation" (a Waiver of Subrogation in favor of others, e.g. CG 24 04), "primary_noncontributory" (coverage stated to be Primary and Non-Contributory, e.g. CG 20 01), "project_aggregate" (a dedicated per-project General Aggregate applies, e.g. CG 25 03/04), "completed_ops_ai" (Additional Insured for COMPLETED operations / products-completed operations, e.g. CG 20 37).${customPromptText}${aiPromptText}

Strictly return ONLY the requested JSON schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, { text: promptText }],
      config: {
        temperature: 0, // deterministic extraction
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
            gl_form: { type: Type.STRING, description: "Commercial General Liability coverage basis: 'Occurrence', 'Claims-Made', or 'Unknown'." },
            endorsement_facts: {
              type: Type.OBJECT,
              description: "Booleans for endorsements indicated on the certificate: WOS / P&NC / per-project aggregate / completed-ops additional insured.",
              properties: {
                waiver_of_subrogation: { type: Type.BOOLEAN },
                primary_noncontributory: { type: Type.BOOLEAN },
                project_aggregate: { type: Type.BOOLEAN },
                completed_ops_ai: { type: Type.BOOLEAN },
              },
            },
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
            "gl_form",
            "endorsement_facts",
          ],
        },
      },
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("Empty response from the extraction model.");
    console.log("Raw Gemini Output:", textResponse);
    const parsedData = JSON.parse(textResponse.trim());
    return { status: 200, body: { success: true, data: parsedData, simulated: false } };
  } catch (extractionError: any) {
    // FAIL CLOSED — surface the failure instead of inventing certificate values.
    console.error("COI extraction failed:", extractionError?.message || extractionError);
    return {
      status: 502,
      body: {
        error:
          "Couldn't reliably read this certificate. Re-upload a clearer scan, or enter the details manually.",
        code: "extraction_failed",
      },
    };
  }
}

/** Parse a newline + pipe-delimited trade table into structured rows. */
function parseTradeRulesText(text: unknown): any[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const num = (s: string) => {
    const d = (s || "").replace(/[^0-9]/g, "").slice(0, 10);
    return d ? parseInt(d, 10) : 0;
  };
  const rows: any[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 2 || !cells[0]) continue;
    rows.push({
      trade: cells[0],
      umbrella: num(cells[1]),
      professional_liability: num(cells[2] ?? ""),
      pollution_liability: num(cells[3] ?? ""),
    });
  }
  return rows;
}

/**
 * Best-effort second pass for the per-trade escalation table. It returns the
 * table as FREE TEXT (LLMs are stable at that, unlike being forced into dozens
 * of nested numeric JSON slots, which can trigger a digit-repetition loop that
 * truncates the whole response), then parses it deterministically. Any failure
 * degrades to [] so the proven-stable baseline extraction still succeeds.
 */
async function extractTradeTable(ai: GoogleGenAI, documentPart: any, tradeList: string[]): Promise<any[]> {
  try {
    const prompt = `Read the attached exhibit and return, in "trade_rules_text", the per-trade coverage requirements as ONE LINE PER TRADE that carries ANY non-baseline requirement (higher excess/umbrella, professional, or conditional pollution). Pipe-delimited:

<trade> | <excess/umbrella whole dollars or 0> | <professional whole dollars or 0> | <pollution whole dollars or 0>

Excess & Professional: read these from any "Scopes Required to Provide Additional Coverage"-style table.

Pollution: if the exhibit requires Pollution Liability only for CERTAIN scopes/trades (e.g. work involving pollutants, or building enclosure — roofing, siding, windows, curtainwall, stucco/masonry; plumbing; HVAC; drywall/insulation; foundations, concrete, earthwork), put the required pollution limit on the trades whose typical scope matches those conditions, and 0 on trades that clearly do NOT (e.g. Surveying, Electrical, Elevators). If pollution is a universal baseline (required of everyone) or not required at all, leave pollution 0 here.

Rules: amounts are plain digits only (e.g. 5000000), 0 where blank, and set <trade> to EXACTLY one of these canonical names (closest match; "Other Trades" for an "all other trades" row). If there are no per-trade requirements at all, return an empty string.
Canonical trades:
${tradeList.map((t) => `- ${t}`).join("\n")}`;
    const res = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [documentPart, { text: prompt }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        // Generous cap: the model spends part of this budget on internal
        // reasoning, so a tight limit truncates the table mid-string. Still
        // bounded so a digit-repetition loop can't run away.
        maxOutputTokens: 16384,
        responseSchema: {
          type: Type.OBJECT,
          properties: { trade_rules_text: { type: Type.STRING } },
          required: ["trade_rules_text"],
        },
      },
    });
    const t = res.text;
    if (!t) return [];
    return parseTradeRulesText(JSON.parse(t.trim()).trade_rules_text);
  } catch (err: any) {
    console.warn("Trade-table extraction skipped:", err?.message || err);
    return [];
  }
}

/**
 * Scan a prime contract exhibit and extract the required baseline insurance
 * thresholds. Fails CLOSED like scanCoi; only the sandbox exhibits are simulated.
 */
export async function scanContract(payload: any): Promise<ScanResult> {
  const { fileData, mimeType, fileName, trades } = payload || {};
  const tradeList: string[] = Array.isArray(trades) && trades.length > 0 ? trades : CANONICAL_TRADES;

  if (!fileData) {
    return { status: 400, body: { error: "No contract document data provided for AI scan" } };
  }

  console.log(`Analyzing Prime Contract Exhibit "${fileName}" with mimeType "${mimeType}"...`);

  // Sandbox exhibit → canned demo data (works without a Gemini key).
  if (isSampleContract(fileName)) {
    return {
      status: 200,
      body: {
        success: true,
        data: buildSampleContractData(fileName),
        simulated: true,
        warning: "Sandbox exhibit — simulated extraction (not a real contract).",
      },
    };
  }

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (configError: any) {
    return {
      status: 503,
      body: {
        error:
          "AI extraction is unavailable (GEMINI_API_KEY is not configured). Enter the project requirements manually, or try a sandbox exhibit.",
        code: "extraction_unconfigured",
      },
    };
  }

  try {
    const documentPart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: fileData,
      },
    };

    const systemInstruction = `You are an expert construction insurance auditor. Extract the insurance the CONTRACTOR/SUBCONTRACTOR is required to carry from an owner-contractor or subcontract agreement exhibit. These appear in several formats (an AIA Exhibit A "Contractor's Required Insurance", a "Subcontractor's Insurance Requirements" exhibit with lettered sections A-L, and/or a summary limits table).

IGNORE any coverage the OWNER or CONTRACTOR carries (e.g. Builder's Risk, "Owner's Insurance"). Extract ONLY what the subcontractor must provide.

Extract these as exact numeric USD limits. Distinguish UNIVERSAL baselines (required of EVERY subcontractor) from CONDITIONAL coverages (required only for certain scopes or trades).

Universal coverages — General Liability (each-occurrence, general aggregate, products-completed), Automobile combined single limit, Umbrella/Excess each-occurrence, the three Employers' Liability limits, and Workers' Compensation — take their limits from a "Standard Coverage Requirements" / minimum summary table when present. Use 0 only if truly not required.

Pollution and Professional liability are frequently CONDITIONAL. If the exhibit conditions them on scope or trade (e.g. "if the work involves pollutants"; building enclosure, plumbing, HVAC, drywall, foundations/concrete/masonry; or "design-build" services), set their BASELINE (pollution_liability / professional_liability) to 0 and capture the required amounts PER-TRADE in the trade table instead — even if a summary table lists them. Set a pollution/professional BASELINE only when the coverage is required of every subcontractor unconditionally.

In "conditional_notes", briefly summarize any such conditions you found (e.g. which scopes trigger pollution), or "" if none.

Also extract:
- additional_insured_required (boolean) and additional_insured_names: the entities the subcontractor must name as additional insured (e.g. the general contractor). Return [] if none named.
- endorsements the subcontractor must carry (booleans): waiver_of_subrogation; primary_noncontributory (coverage is primary and non-contributory); project_aggregate (a dedicated per-project aggregate applies); completed_ops_ai (additional insured for COMPLETED operations, e.g. CG 20 37).`;

    const basePromptText =
      "Scan the attached contract / subcontract insurance exhibit and populate the schedule of the subcontractor's required insurance.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [documentPart, { text: basePromptText }],
      config: {
        systemInstruction,
        temperature: 0, // deterministic extraction — avoids run-to-run flip-flops on ambiguous fields
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            gl_occurrence: { type: Type.INTEGER },
            gl_aggregate: { type: Type.INTEGER },
            gl_products_completed: { type: Type.INTEGER },
            auto_limit: { type: Type.INTEGER },
            umbrella_limit: { type: Type.INTEGER },
            employers_liability_accident: { type: Type.INTEGER },
            employers_liability_disease_person: { type: Type.INTEGER },
            employers_liability_disease_limit: { type: Type.INTEGER },
            workers_comp: { type: Type.BOOLEAN },
            pollution_liability: { type: Type.INTEGER, description: "Baseline pollution liability required of every sub (0 if none / conditional-only)." },
            professional_liability: { type: Type.INTEGER, description: "Baseline professional liability required of every sub (0 if only trade-specific)." },
            additional_insured_required: { type: Type.BOOLEAN },
            additional_insured_names: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Entities the sub must name as additional insured." },
            endorsements: {
              type: Type.OBJECT,
              description: "Endorsements the subcontractor is required to carry.",
              properties: {
                waiver_of_subrogation: { type: Type.BOOLEAN },
                primary_noncontributory: { type: Type.BOOLEAN },
                project_aggregate: { type: Type.BOOLEAN },
                completed_ops_ai: { type: Type.BOOLEAN },
              },
            },
            conditional_notes: { type: Type.STRING, description: "Brief note of any conditional-coverage triggers (e.g. which scopes require pollution), or empty string if none." },
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
            "pollution_liability",
            "professional_liability",
            "additional_insured_required",
            "additional_insured_names",
            "endorsements",
            "conditional_notes",
          ],
        },
      },
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("Empty response from the extraction model during contract analysis.");
    console.log("Raw Gemini Contract Scan Output:", textResponse);
    const parsedData = JSON.parse(textResponse.trim());
    // Best-effort second pass for the per-trade table, kept separate so a glitch
    // there can't sink the (proven-stable) baseline extraction.
    parsedData.trade_rules = await extractTradeTable(ai, documentPart, tradeList);
    return { status: 200, body: { success: true, data: parsedData, simulated: false } };
  } catch (extractionError: any) {
    // FAIL CLOSED — surface the failure instead of inventing contract baselines.
    console.error("Contract extraction failed:", extractionError?.message || extractionError);
    return {
      status: 502,
      body: {
        error:
          "Couldn't reliably read this contract exhibit. Re-upload a clearer copy, or set the project requirements manually.",
        code: "extraction_failed",
      },
    };
  }
}
