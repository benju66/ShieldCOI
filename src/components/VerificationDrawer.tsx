import React, { useState, useEffect } from "react";
import { X, Check, ShieldCheck, ShieldAlert, FileWarning, Eye } from "lucide-react";
import { Project } from "../types";
import { verifyCompliance, isNamedAdditionalInsured } from "../complianceEngine";
import { formatUSD } from "../utils/currency";
import DocumentViewer, { ACORD25_FIELD_TEMPLATE } from "./DocumentViewer";
import CurrencyInput from "./CurrencyInput";

interface VerificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  subContractorId: string;
  subContractorName: string;
  subContractorTrade?: string;
  /** The date compliance is evaluated against ("today", or a configured override). */
  evaluationDate: string;
  extractedData: {
    insured_name: string;
    gl_each_occurrence: number;
    gl_general_aggregate: number;
    auto_combined_single_limit: number;
    workers_comp_statutory: boolean;
    policy_expiration_date: string;
    gl_products_completed?: number;
    umbrella_limit?: number;
    employers_liability_accident?: number;
    employers_liability_disease_person?: number;
    employers_liability_disease_limit?: number;
    professional_liability?: number;
    pollution_liability?: number;
    file_name: string;
    simulated: boolean;
    warning?: string;
    extraction_method?: "AI_Scan" | "Manual_Entry";
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    file_data?: string;
    file_mime?: string;
    field_locations?: { field: string; page?: number; box_2d: number[] }[];
  } | null;
  onSave: (
    manualOverride: boolean,
    notes: string,
    status: "Compliant" | "Insufficient Coverage" | "Expired" | "Approved Exception",
    waiverReasonType: "Low Contract Value" | "Low-Risk Scope" | "Executive Discretion" | "Temporary Extension" | null,
    waiverAuthorizedBy: string | null,
    waiverExpirationDate: string | null,
    updatedPayload?: any
  ) => Promise<void>;
}

export default function VerificationDrawer({
  isOpen,
  onClose,
  project,
  subContractorId,
  subContractorName,
  subContractorTrade = "Other Trades",
  evaluationDate,
  extractedData,
  onSave,
}: VerificationDrawerProps) {
  const [override, setOverride] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [waiverReasonType, setWaiverReasonType] = useState<"Low Contract Value" | "Low-Risk Scope" | "Executive Discretion" | "Temporary Extension" | "">("");
  const [waiverAuthorizedBy, setWaiverAuthorizedBy] = useState("");
  const [waiverExpirationDate, setWaiverExpirationDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Maintain local state representing editable payload if Manual Mode is active or during edit
  const [formData, setFormData] = useState<{
    insured_name: string;
    gl_each_occurrence: number;
    gl_general_aggregate: number;
    auto_combined_single_limit: number;
    workers_comp_statutory: boolean;
    policy_expiration_date: string;
    gl_products_completed?: number;
    umbrella_limit?: number;
    employers_liability_accident?: number;
    employers_liability_disease_person?: number;
    employers_liability_disease_limit?: number;
    professional_liability?: number;
    pollution_liability?: number;
    file_name: string;
    simulated: boolean;
    warning?: string;
    extraction_method?: "AI_Scan" | "Manual_Entry";
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    file_data?: string;
    file_mime?: string;
    field_locations?: { field: string; page?: number; box_2d: number[] }[];
  } | null>(null);

  // Auto reset state on open
  useEffect(() => {
    if (isOpen && extractedData) {
      setOverride(false);
      setOverrideNotes("");
      setWaiverReasonType("");
      setWaiverAuthorizedBy("");
      setWaiverExpirationDate("");

      setFormData({
        insured_name: extractedData.insured_name || "",
        gl_each_occurrence: extractedData.gl_each_occurrence || 0,
        gl_general_aggregate: extractedData.gl_general_aggregate || 0,
        auto_combined_single_limit: extractedData.auto_combined_single_limit || 0,
        workers_comp_statutory: !!extractedData.workers_comp_statutory,
        policy_expiration_date: extractedData.policy_expiration_date || evaluationDate,
        gl_products_completed: extractedData.gl_products_completed || 0,
        umbrella_limit: extractedData.umbrella_limit || 0,
        employers_liability_accident: extractedData.employers_liability_accident || 0,
        employers_liability_disease_person: extractedData.employers_liability_disease_person || 0,
        employers_liability_disease_limit: extractedData.employers_liability_disease_limit || 0,
        professional_liability: extractedData.professional_liability || 0,
        pollution_liability: extractedData.pollution_liability || 0,
        file_name: extractedData.file_name || "",
        simulated: !!extractedData.simulated,
        warning: extractedData.warning,
        extraction_method: extractedData.extraction_method || "AI_Scan",
        custom_extractions: extractedData.custom_extractions || {},
        additional_insured_named: extractedData.additional_insured_named || [],
        additional_insured_blanket: !!extractedData.additional_insured_blanket,
        additional_insured_text: extractedData.additional_insured_text || "",
        gl_addl_insd: !!extractedData.gl_addl_insd,
        file_data: extractedData.file_data,
        file_mime: extractedData.file_mime,
        field_locations: extractedData.field_locations,
      });
    }
  }, [isOpen, extractedData]);

  if (!isOpen || !extractedData || !formData) return null;

  // Use the reactive formData as the principal activeData
  const activeData = formData;

  // Run compliance analysis engine Reactively
  const req = project.requirements;
  const trade = subContractorTrade || "Other Trades";
  const analysis = verifyCompliance(project, activeData, trade, evaluationDate);

  // Compare each field to see if it meets threshold reactively
  const isGlOccPassed = activeData.gl_each_occurrence >= req.gl_occurrence;
  const isGlAggPassed = activeData.gl_general_aggregate >= req.gl_aggregate;
  const isAutoPassed = activeData.auto_combined_single_limit >= req.auto_limit;
  const isWcPassed = !req.workers_comp || activeData.workers_comp_statutory;

  const isGlProdPassed = (activeData.gl_products_completed ?? 0) >= (req.gl_products_completed ?? 2000000);

  // Umbrella variable trade-specific calculation
  let requiredUmbrella = req.umbrella_limit ?? 1000000;
  if (["Concrete (Precast)", "Concrete (with Crane)", "Rough Carpentry (with Crane)", "Elevators"].includes(trade)) {
    requiredUmbrella = 10000000;
  } else if ([
    "Environmental", "Earthwork", "Concrete (Standard)", "Masonry", "Rough Carpentry (Standard)",
    "Siding", "Roofing", "Windows", "Drywall", "Fire Sprinkler", "Plumbing", "HVAC", "Electrical"
  ].includes(trade)) {
    requiredUmbrella = 5000000;
  } else if (["Surveying", "Pool", "Other Trades"].includes(trade)) {
    requiredUmbrella = 1000000;
  }
  const isUmbrellaPassed = (activeData.umbrella_limit ?? 0) >= requiredUmbrella;

  const isElAccidentPassed = (activeData.employers_liability_accident ?? 0) >= (req.employers_liability_accident ?? 1000000);
  const isElDiseasePersonPassed = (activeData.employers_liability_disease_person ?? 0) >= (req.employers_liability_disease_person ?? 1000000);
  const isElDiseaseLimitPassed = (activeData.employers_liability_disease_limit ?? 0) >= (req.employers_liability_disease_limit ?? 1000000);

  const professionalTrades = ["Environmental", "Surveying", "Earthwork", "Pool", "Fire Sprinkler", "Plumbing", "HVAC", "Electrical"];
  const isProfessionalRequired = professionalTrades.includes(trade);
  const isProfessionalPassed = (activeData.professional_liability ?? 0) >= 2000000;

  const pollutionTrades = [
    "Environmental", "Earthwork", "Concrete (Precast)", "Concrete (Standard)", "Masonry",
    "Rough Carpentry (Standard)", "Siding", "Roofing", "Windows", "Drywall", "Plumbing", "HVAC"
  ];
  const isPollutionRequired = pollutionTrades.includes(trade);
  const isPollutionPassed = (activeData.pollution_liability ?? 0) >= 2000000;

  const isNotExpired = new Date(activeData.policy_expiration_date) > new Date(evaluationDate);

  const finalStatus = override 
    ? "Approved Exception" 
    : analysis.status === "Pending Upload" ? "Insufficient Coverage" : analysis.status;

  const handleApplyResolution = async () => {
    try {
      setSubmitting(true);
      await onSave(
        override,
        override ? overrideNotes : "",
        finalStatus as any,
        override ? (waiverReasonType || null) : null,
        override ? (waiverAuthorizedBy || null) : null,
        override ? (waiverExpirationDate || null) : null,
        activeData
      );
      onClose();
    } catch (err) {
      alert("Failed to apply compliance update.");
    } finally {
      setSubmitting(false);
    }
  };

  const isManualMode = activeData.extraction_method === "Manual_Entry";

  // Document-highlight metadata: map each extracted-field key to pass/fail + a short label
  // so the source-document viewer can color and label the overlay boxes.
  const aiRequiredNames = (project.additional_insured_names || []).map((n) => (n || "").trim()).filter(Boolean);
  const aiBlanketOk = !!activeData.additional_insured_blanket && project.accept_blanket_ai !== false;
  const aiAllOk = !project.additional_insured_required
    ? true
    : aiRequiredNames.length > 0
    ? aiRequiredNames.every((n) => isNamedAdditionalInsured(n, activeData.additional_insured_named || []) || aiBlanketOk)
    : (activeData.additional_insured_named || []).length > 0 || aiBlanketOk || !!activeData.gl_addl_insd;

  const fieldStatus: Record<string, "pass" | "fail" | "neutral"> = {
    insured_name: "neutral",
    gl_each_occurrence: isGlOccPassed ? "pass" : "fail",
    gl_general_aggregate: isGlAggPassed ? "pass" : "fail",
    auto_combined_single_limit: isAutoPassed ? "pass" : "fail",
    workers_comp_statutory: isWcPassed ? "pass" : "fail",
    policy_expiration_date: isNotExpired ? "pass" : "fail",
    gl_products_completed: isGlProdPassed ? "pass" : "fail",
    umbrella_limit: isUmbrellaPassed ? "pass" : "fail",
    employers_liability_accident: isElAccidentPassed ? "pass" : "fail",
    employers_liability_disease_person: isElDiseasePersonPassed ? "pass" : "fail",
    employers_liability_disease_limit: isElDiseaseLimitPassed ? "pass" : "fail",
    professional_liability: isProfessionalRequired ? (isProfessionalPassed ? "pass" : "fail") : "neutral",
    pollution_liability: isPollutionRequired ? (isPollutionPassed ? "pass" : "fail") : "neutral",
    additional_insured: aiAllOk ? "pass" : "fail",
  };
  const fieldLabels: Record<string, string> = {
    insured_name: "Insured",
    gl_each_occurrence: "GL Occurrence",
    gl_general_aggregate: "GL Aggregate",
    auto_combined_single_limit: "Auto CSL",
    workers_comp_statutory: "Workers' Comp",
    policy_expiration_date: "Expiration",
    gl_products_completed: "Products-Comp",
    umbrella_limit: "Umbrella",
    employers_liability_accident: "EL Accident",
    employers_liability_disease_person: "EL Disease (Person)",
    employers_liability_disease_limit: "EL Disease (Limit)",
    professional_liability: "Professional",
    pollution_liability: "Pollution",
    additional_insured: "Additional Insured",
  };
  const hasDocument = !!activeData.file_data;

  return (
    <div id="verification-overlay-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end transition-all select-none">

      {/* Source document pane (side-by-side with the matrix; large screens only) */}
      {hasDocument && (
        <div id="document-viewer-pane" className="hidden lg:flex flex-col w-[46vw] max-w-3xl h-full bg-slate-100 border-l border-slate-300 shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <span className="text-[9px] bg-slate-200 text-slate-700 border border-slate-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Source Document
            </span>
            <span className="text-[10px] text-slate-500 truncate max-w-[55%]" title={activeData.file_name}>{activeData.file_name}</span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <DocumentViewer
              fileData={activeData.file_data || ""}
              fileMime={activeData.file_mime || "image/png"}
              locations={ACORD25_FIELD_TEMPLATE}
              fieldStatus={fieldStatus}
              fieldLabels={fieldLabels}
            />
          </div>
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[9px] text-slate-400 flex-shrink-0">
            Highlights are AI-estimated — verify against the certificate.
          </div>
        </div>
      )}

      <div id="verification-drawer-container" className="w-full max-w-2xl bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div id="verification-header" className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Certificate review
            </span>
            <h2 id="verification-title" className="text-xs font-bold text-slate-900 tracking-tight font-display mt-1.5 uppercase">
              Reviewing COI: {subContractorName} {isManualMode && "(Manual entry)"}
            </h2>
            <p className="text-[11px] text-slate-500">
              {isManualMode
                ? "Input details manually from your subcontractor insurance documentation."
                : `Comparing extracted facts from standard ACORD 25 for ${project.name}.`}
            </p>
          </div>
          <button
            onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
            onClick={onClose}
            className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div id="verification-body" className="p-4 flex-1 overflow-y-auto space-y-4">
          
          {/* Manual Entry Distinctive Visual Banner */}
          {isManualMode && (
            <div id="manual-entry-banner" className="text-slate-800 bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start space-x-2 text-xs">
              <span className="text-base flex-shrink-0">📝</span>
              <div className="font-semibold">
                Manual Entry Mode Active — Cross-reference your hardcopy certificate to populate the fields below.
              </div>
            </div>
          )}

          {/* Simulation warnings if no real API key is running (Only in AI Scan mode) */}
          {!isManualMode && activeData.simulated && (
            <div id="simulation-banner" className="bg-amber-50 border border-amber-200 text-amber-850 p-3 rounded-lg flex items-start space-x-2 text-xs">
              <FileWarning className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-amber-900">Sandbox AI Model Simulation</span>
                <span className="text-slate-650 font-medium">Using built-in OCR fallback patterns. To run live extractions, configure process.env.GEMINI_API_KEY in the Secrets panel.</span>
              </div>
            </div>
          )}

          {/* Side-by-Side Comparison Grid */}
          <div id="comparison-grid" className="space-y-3">
            <h3 id="comparison-heading" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
              Parameter Evaluation Breakdown
            </h3>

            {/* Matrix Columns */}
            <div className="grid grid-cols-12 gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2">
              <div className="col-span-5">Insurance Line Item</div>
              <div className="col-span-3 text-right">Extracted Values (COI)</div>
              <div className="col-span-3 text-right">Required (Project)</div>
              <div className="col-span-1 text-center font-bold">Status</div>
            </div>

            {/* Line items */}
            <div className="space-y-1.5">
              
              {/* Insured Name */}
              <div id="match-row-insured" className="grid grid-cols-12 gap-2 items-center p-2.5 rounded bg-slate-50 border border-slate-200">
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Insured Company Name</p>
                  <p className="text-[10px] text-slate-500">Must match registered trade vendor</p>
                </div>
                <div className="col-span-6 text-right break-all">
                  {isManualMode ? (
                    <input
                      type="text"
                      id="input-insured-name"
                      placeholder="Enter Insured Company Name"
                      value={activeData.insured_name}
                      onChange={(e) => setFormData({ ...activeData, insured_name: e.target.value })}
                      className="w-full text-xs font-mono font-bold text-blue-600 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <>
                      <p className="text-xs font-mono font-bold text-blue-600">{activeData.insured_name}</p>
                      <p className="text-[10px] text-slate-400">Registry name: {subContractorName}</p>
                    </>
                  )}
                </div>
                <div className="col-span-1 flex justify-center">
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
              </div>

              {/* Each Occurrence */}
              <div
                id="match-row-gl-occurrence"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isGlOccPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">GL Each Occurrence Limit</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-gl-occurrence"
                      value={activeData.gl_each_occurrence}
                      onChange={(v) => setFormData({ ...activeData, gl_each_occurrence: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isGlOccPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.gl_each_occurrence)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.gl_occurrence)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isGlOccPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* General Aggregate */}
              <div
                id="match-row-gl-aggregate"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isGlAggPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">GL General Aggregate Limit</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-gl-aggregate"
                      value={activeData.gl_general_aggregate}
                      onChange={(v) => setFormData({ ...activeData, gl_general_aggregate: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isGlAggPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.gl_general_aggregate)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.gl_aggregate)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isGlAggPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-650 text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Automobile Liability */}
              <div
                id="match-row-auto-limit"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isAutoPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Automobile combined Limit</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-auto-limit"
                      value={activeData.auto_combined_single_limit}
                      onChange={(v) => setFormData({ ...activeData, auto_combined_single_limit: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isAutoPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.auto_combined_single_limit)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.auto_limit)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isAutoPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Workers Comp */}
              <div
                id="match-row-workers-comp"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isWcPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Workers Comp Statutory</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <label id="checkbox-wc-label" className="inline-flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeData.workers_comp_statutory}
                        onChange={(e) => setFormData({ ...activeData, workers_comp_statutory: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-xs font-bold text-slate-700">Statutory</span>
                    </label>
                  ) : (
                    <p className={`text-xs font-bold ${isWcPassed ? "text-emerald-700 animate-pulse" : "text-red-700 font-bold"}`}>
                      {activeData.workers_comp_statutory ? "Statutory Limits" : "Not Provided"}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs text-slate-500">{req.workers_comp ? "Statutory" : "Not Required"}</p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isWcPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Policy Expiration Date */}
              <div
                id="match-row-expiration"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isNotExpired ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Policy Expiration Date</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <input
                      type="date"
                      id="input-expiration-date"
                      value={activeData.policy_expiration_date}
                      onChange={(e) => setFormData({ ...activeData, policy_expiration_date: e.target.value })}
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold ${isNotExpired ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {activeData.policy_expiration_date}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs text-slate-500">Not Expired</p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isNotExpired ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* GL Products-Completed Aggregate */}
              <div
                id="match-row-gl-products-completed"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isGlProdPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">GL Products-Completed Aggregate</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-gl-products-completed"
                      value={activeData.gl_products_completed}
                      onChange={(v) => setFormData({ ...activeData, gl_products_completed: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isGlProdPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.gl_products_completed)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.gl_products_completed ?? 2000000)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isGlProdPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Umbrella Limit */}
              <div
                id="match-row-umbrella-limit"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isUmbrellaPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Umbrella / Excess Liability</p>
                  <p className="text-[10px] text-slate-500">Calculated for trade: {trade}</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-umbrella"
                      value={activeData.umbrella_limit}
                      onChange={(v) => setFormData({ ...activeData, umbrella_limit: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isUmbrellaPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.umbrella_limit)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(requiredUmbrella)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isUmbrellaPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Employers' Liability Accident */}
              <div
                id="match-row-el-accident"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isElAccidentPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Employers' Liability: Accident</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-el-accident"
                      value={activeData.employers_liability_accident}
                      onChange={(v) => setFormData({ ...activeData, employers_liability_accident: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isElAccidentPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.employers_liability_accident)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.employers_liability_accident ?? 1000000)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isElAccidentPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Employers' Liability Disease Per Person */}
              <div
                id="match-row-el-disease-person"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isElDiseasePersonPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Employers' Liability: Disease (Per Person)</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-el-disease-person"
                      value={activeData.employers_liability_disease_person}
                      onChange={(v) => setFormData({ ...activeData, employers_liability_disease_person: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isElDiseasePersonPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.employers_liability_disease_person)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.employers_liability_disease_person ?? 1000000)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isElDiseasePersonPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Employers' Liability Disease Policy Limit */}
              <div
                id="match-row-el-disease-limit"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isElDiseaseLimitPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Employers' Liability: Disease (Policy Limit)</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <CurrencyInput
                      id="input-el-disease-limit"
                      value={activeData.employers_liability_disease_limit}
                      onChange={(v) => setFormData({ ...activeData, employers_liability_disease_limit: v ?? 0 })}
                      placeholder="$0"
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isElDiseaseLimitPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                      {formatUSD(activeData.employers_liability_disease_limit)}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                    {formatUSD(req.employers_liability_disease_limit ?? 1000000)}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isElDiseaseLimitPassed ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Professional Liability (Conditional) */}
              {isProfessionalRequired && (
                <div
                  id="match-row-professional-liability"
                  className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                    isProfessionalPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                  }`}
                >
                  <div className="col-span-5">
                    <p className="text-xs font-bold text-slate-800">Professional Liability</p>
                    <p className="text-[10px] text-slate-500">Required for trade: {trade}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    {isManualMode ? (
                      <CurrencyInput
                        id="input-professional-liability"
                        value={activeData.professional_liability}
                        onChange={(v) => setFormData({ ...activeData, professional_liability: v ?? 0 })}
                        placeholder="$0"
                        className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    ) : (
                      <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isProfessionalPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                        {formatUSD(activeData.professional_liability)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                      {formatUSD(2000000)}
                    </p>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {isProfessionalPassed ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                    )}
                  </div>
                </div>
              )}

              {/* Pollution Liability (Conditional) */}
              {isPollutionRequired && (
                <div
                  id="match-row-pollution-liability"
                  className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                    isPollutionPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                  }`}
                >
                  <div className="col-span-5">
                    <p className="text-xs font-bold text-slate-800">Pollution Liability</p>
                    <p className="text-[10px] text-slate-500">Required for trade: {trade}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    {isManualMode ? (
                      <CurrencyInput
                        id="input-pollution-liability"
                        value={activeData.pollution_liability}
                        onChange={(v) => setFormData({ ...activeData, pollution_liability: v ?? 0 })}
                        placeholder="$0"
                        className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    ) : (
                      <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isPollutionPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                        {formatUSD(activeData.pollution_liability)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                      {formatUSD(2000000)}
                    </p>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {isPollutionPassed ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Custom Coverage Requirements specified in parent project */}
              {project.custom_requirements && project.custom_requirements.length > 0 && (
                <div id="drawer-custom-requirements-group" className="pt-2.5 border-t border-slate-200 mt-2 space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">
                    Custom Project Coverages
                  </p>
                  {project.custom_requirements.map((customReq) => {
                    const label = customReq.label;
                    const requiredLimit = customReq.limit;
                    if (!label || requiredLimit <= 0) return null;

                    // Extracted fact
                    const customEx = activeData.custom_extractions || {};
                    const extractedValue = customEx[label] !== undefined && customEx[label] !== null ? Number(customEx[label]) : null;
                    const isPassed = extractedValue !== null && extractedValue >= requiredLimit;

                    return (
                      <div
                        key={customReq.id}
                        data-testid={`match-row-custom-${customReq.id}`}
                        className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                          isPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                        }`}
                      >
                        <div className="col-span-5">
                          <p className="text-xs font-bold text-slate-800">{label}</p>
                          <p className="text-[10px] text-slate-500">Custom Project Mandate</p>
                        </div>
                        <div className="col-span-3 text-right">
                          {isManualMode ? (
                            <CurrencyInput
                              value={extractedValue}
                              blankValue={null}
                              onChange={(val) => {
                                const updatedEx = { ...customEx, [label]: val };
                                setFormData({ ...activeData, custom_extractions: updatedEx });
                              }}
                              placeholder="Not Found"
                              className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${isPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                              {extractedValue !== null ? formatUSD(extractedValue) : "Not Found"}
                            </p>
                          )}
                        </div>
                        <div className="col-span-3 text-right">
                          <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                            {formatUSD(requiredLimit)}
                          </p>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {isPassed ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Additional Insured verification */}
              {project.additional_insured_required && (
                <div id="drawer-additional-insured-group" className="pt-2.5 border-t border-slate-200 mt-2 space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">
                    Additional Insured
                  </p>

                  {(project.additional_insured_names || []).filter((n) => (n || "").trim()).length > 0 ? (
                    (project.additional_insured_names || [])
                      .filter((n) => (n || "").trim())
                      .map((reqName, idx) => {
                        const named = isNamedAdditionalInsured(reqName, activeData.additional_insured_named || []);
                        const blanketOk = !named && !!activeData.additional_insured_blanket && project.accept_blanket_ai !== false;
                        const status = named ? "named" : blanketOk ? "blanket" : "missing";
                        return (
                          <div
                            key={`ai-${idx}`}
                            data-testid={`match-row-ai-${idx}`}
                            className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                              status === "named"
                                ? "bg-slate-50 border-slate-200"
                                : status === "blanket"
                                ? "bg-amber-50 border-amber-200 text-amber-950"
                                : "bg-red-50 border-red-200 text-red-950"
                            }`}
                          >
                            <div className="col-span-7">
                              <p className="text-xs font-bold text-slate-800">{reqName}</p>
                              <p className="text-[10px] text-slate-500">Must be named as Additional Insured</p>
                            </div>
                            <div className="col-span-4 text-right">
                              <p
                                className={`text-[11px] font-bold ${
                                  status === "named" ? "text-emerald-700" : status === "blanket" ? "text-amber-700" : "text-red-700"
                                }`}
                              >
                                {status === "named" ? "Named" : status === "blanket" ? "Blanket — verify endorsement" : "Not listed"}
                              </p>
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {status === "named" ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : status === "blanket" ? (
                                <span className="text-[10px] text-amber-600 font-bold uppercase" title="Blanket 'as required by written contract' — verify endorsement">⚠</span>
                              ) : (
                                <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="p-2.5 rounded border bg-slate-50 border-slate-200">
                      <p className="text-[11px] text-slate-600">
                        {activeData.additional_insured_named && activeData.additional_insured_named.length > 0
                          ? `Named on certificate: ${activeData.additional_insured_named.join(", ")}`
                          : activeData.additional_insured_blanket
                          ? `Blanket "as required by written contract" language present — verify endorsement.`
                          : "No additional insured status found on this certificate."}
                      </p>
                    </div>
                  )}

                  {/* Extracted evidence + manual correction */}
                  <div className="px-1 pt-1 space-y-1.5">
                    <p className="text-[10px] text-slate-500 leading-snug">
                      <span className="font-bold">Cert AI language:</span>{" "}
                      {activeData.additional_insured_text ? `“${activeData.additional_insured_text}”` : "— none extracted —"}
                    </p>
                    {isManualMode && (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={(activeData.additional_insured_named || []).join(", ")}
                          onChange={(e) =>
                            setFormData({
                              ...activeData,
                              additional_insured_named: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Named additional insureds (comma-separated)"
                          className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <label className="flex items-center space-x-2 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!activeData.additional_insured_blanket}
                            onChange={(e) => setFormData({ ...activeData, additional_insured_blanket: e.target.checked })}
                          />
                          <span>Blanket "as required by written contract" language present</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Validation Warnings List */}
          {analysis.errors.length > 0 && !override && (
            <div id="validation-errors-output" className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
              <span className="text-xs font-bold text-red-700 flex items-center mb-1">
                <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Overarching Policy Infractions:
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-800 font-medium">
                {analysis.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Policy Waiver & Risk Exception Form */}
          <div id="policy-waiver-section" className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4 mt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-900">Policy Waiver & Risk Exception Form</p>
                <p className="text-[10px] text-slate-500">
                  Grant a formal, temporary audit dispensation for outstanding compliance infractions.
                </p>
              </div>
              <label id="override-toggle-label" className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-450 after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {override && (
              <div id="override-fields-grid" className="space-y-3 pt-1 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Dropdown Reason */}
                  <div className="space-y-1">
                    <label htmlFor="waiver-reason-selector" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      Waiver Reason Category *
                    </label>
                    <select
                      id="waiver-reason-selector"
                      value={waiverReasonType}
                      onChange={(e) => setWaiverReasonType(e.target.value as any)}
                      className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:outline-none rounded p-2 text-slate-800"
                    >
                      <option value="">-- Select Standardized Reason --</option>
                      <option value="Low Contract Value">Low Contract Value</option>
                      <option value="Low-Risk Scope">Low-Risk Scope</option>
                      <option value="Executive Discretion">Executive Discretion</option>
                      <option value="Temporary Extension">Temporary Extension</option>
                    </select>
                  </div>

                  {/* Date Picker */}
                  <div className="space-y-1">
                    <label htmlFor="waiver-expiration-picker" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      Waiver Expiration Date (Optional)
                    </label>
                    <input
                      type="date"
                      id="waiver-expiration-picker"
                      value={waiverExpirationDate}
                      onChange={(e) => setWaiverExpirationDate(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:outline-none rounded p-2 text-slate-800"
                    />
                  </div>
                </div>

                {/* Authorizer */}
                <div className="space-y-1">
                  <label htmlFor="waiver-authorizer-input" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Authorized By (Name or Email) *
                  </label>
                  <input
                    type="text"
                    id="waiver-authorizer-input"
                    value={waiverAuthorizedBy}
                    onChange={(e) => setWaiverAuthorizedBy(e.target.value)}
                    placeholder="e.g. executive@shieldcoi.com"
                    className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:outline-none rounded p-2 text-slate-800"
                  />
                </div>

                {/* Justification Log notes */}
                <div className="space-y-1">
                  <label htmlFor="compliance-exception-notes" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Justification Context & Commercial Logic *
                  </label>
                  <textarea
                    id="compliance-exception-notes"
                    rows={3}
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    placeholder="Provide detailed contextual notes explaining the commercial logic for this exception."
                    className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:outline-none rounded p-2 text-slate-800"
                  ></textarea>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div id="verification-footer" className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 pb-2.5 py-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evaluation Status:</span>
            {finalStatus === "Compliant" ? (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center shadow-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Compliant
              </span>
            ) : finalStatus === "Approved Exception" ? (
              <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded flex items-center shadow-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1 text-indigo-600" /> Approved Exception
              </span>
            ) : (
              <span className="text-[10px] font-bold text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded flex items-center shadow-xs uppercase tracking-wide">
                <ShieldAlert className="h-3.5 w-3.5 mr-1 text-red-600" /> Out Of Compliance
              </span>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              type="button"
              className="px-3.5 py-1.5 bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md font-bold text-[11px] cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyResolution}
              type="button"
              disabled={(override && (!overrideNotes.trim() || !waiverAuthorizedBy.trim() || !waiverReasonType)) || submitting}
              className={`px-4 py-1.5 rounded-md text-[11px] font-bold tracking-wide uppercase transition-all shadow-xs cursor-pointer ${
                override && (!overrideNotes.trim() || !waiverAuthorizedBy.trim() || !waiverReasonType)
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {submitting ? "Applying..." : "Post Audit Outcome"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
