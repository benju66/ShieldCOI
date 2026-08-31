import React, { useState, useEffect } from "react";
import { X, Check, ShieldCheck, ShieldAlert, FileWarning, Eye, HelpCircle } from "lucide-react";
import { Project, EndorsementFacts, PolicyLine } from "../types";
import { verifyCompliance, isNamedAdditionalInsured, matchEntityNames, isReviewNote } from "../complianceEngine";
import { CrossCheck } from "../coiTextParse";
import { formatUSD } from "../utils/currency";
import DocumentViewer, { ACORD25_FIELD_TEMPLATE } from "./DocumentViewer";
import CurrencyInput from "./CurrencyInput";
import { resolveRequiredCoverage } from "../tradeRules";
import { useSettings } from "../SettingsContext";

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
    // Nullable since the extraction overhaul: null means absent from the
    // certificate or unreadable. unreadable_fields separates the two.
    insured_name: string | null;
    gl_each_occurrence: number | null;
    gl_general_aggregate: number | null;
    auto_combined_single_limit: number | null;
    workers_comp_statutory: boolean;
    policy_expiration_date: string | null;
    gl_products_completed?: number | null;
    umbrella_limit?: number | null;
    employers_liability_accident?: number | null;
    employers_liability_disease_person?: number | null;
    employers_liability_disease_limit?: number | null;
    professional_liability?: number | null;
    pollution_liability?: number | null;
    unreadable_fields?: string[];
    /** Comparison of the AI reading against the PDF text layer. */
    cross_check?: CrossCheck;
    /** Per-coverage policy periods; the earliest required expiration governs. */
    policy_lines?: PolicyLine[];
    /** 1-based page holding the ACORD 25 (packets often lead with a cover letter). */
    certificate_page?: number | null;
    file_name: string;
    simulated: boolean;
    warning?: string;
    extraction_method?: "AI_Scan" | "Manual_Entry";
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    gl_form?: "Occurrence" | "Claims-Made" | "Unknown";
    endorsement_facts?: EndorsementFacts;
    file_data?: string;
    file_mime?: string;
    field_locations?: { field: string; page?: number; box_2d: number[] }[];
  } | null;
  onSave: (
    manualOverride: boolean,
    notes: string,
    // Widened ahead of the engine emitting it, so the review flow accepts a
    // "Needs Review" outcome the moment extraction can produce one.
    status: "Compliant" | "Insufficient Coverage" | "Needs Review" | "Expired" | "Approved Exception",
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
  const { settings } = useSettings();
  const [override, setOverride] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [waiverReasonType, setWaiverReasonType] = useState<"Low Contract Value" | "Low-Risk Scope" | "Executive Discretion" | "Temporary Extension" | "">("");
  const [waiverAuthorizedBy, setWaiverAuthorizedBy] = useState("");
  const [waiverExpirationDate, setWaiverExpirationDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Whole-certificate attestation. Reset per open, like every other control.
  const [attested, setAttested] = useState(false);

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
    /**
     * Fields the extractor could not read. Carried through the null -> 0
     * coercion above so the review UI can still tell "certificate says $0" from
     * "we could not read this box".
     */
    unreadable_fields?: string[];
    /** Comparison of the AI reading against the PDF text layer. */
    cross_check?: CrossCheck;
    /** Per-coverage policy periods; the earliest required expiration governs. */
    policy_lines?: PolicyLine[];
    /** 1-based page holding the ACORD 25 (packets often lead with a cover letter). */
    certificate_page?: number | null;
    file_name: string;
    simulated: boolean;
    warning?: string;
    extraction_method?: "AI_Scan" | "Manual_Entry";
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    gl_form?: "Occurrence" | "Claims-Made" | "Unknown";
    endorsement_facts?: EndorsementFacts;
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
      setAttested(false);

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
        unreadable_fields: extractedData.unreadable_fields || [],
        cross_check: extractedData.cross_check,
        policy_lines: extractedData.policy_lines || [],
        certificate_page: extractedData.certificate_page ?? null,
        file_name: extractedData.file_name || "",
        simulated: !!extractedData.simulated,
        warning: extractedData.warning,
        extraction_method: extractedData.extraction_method || "AI_Scan",
        custom_extractions: extractedData.custom_extractions || {},
        additional_insured_named: extractedData.additional_insured_named || [],
        additional_insured_blanket: !!extractedData.additional_insured_blanket,
        additional_insured_text: extractedData.additional_insured_text || "",
        gl_addl_insd: !!extractedData.gl_addl_insd,
        gl_form: extractedData.gl_form || "Occurrence",
        endorsement_facts: extractedData.endorsement_facts || {},
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
  const tradeRules = settings.trade_rules;
  const required = resolveRequiredCoverage(req, trade, tradeRules);

  // In manual entry the reviewer authors every value themselves, so nothing is
  // "unreadable" any more — a human has stated it. Without this a certificate
  // would stay stuck in Needs Review even after someone keyed the values in.
  const isManualEntry = activeData.extraction_method === "Manual_Entry";
  const crossCheck = activeData.cross_check;
  const analysisInput = isManualEntry
    ? { ...activeData, unreadable_fields: [], disputed_fields: [] }
    : { ...activeData, disputed_fields: crossCheck?.disputed ?? [] };
  const analysis = verifyCompliance(project, analysisInput, trade, evaluationDate, tradeRules, subContractorName);

  // Reviewer-facing notes. Reusing the engine's own messages and predicate keeps
  // one source of truth for both the field labels and what counts as a note.
  const reviewNotes = analysis.errors.filter(isReviewNote);

  // Rows needing a human: unreadable or disputed. Both render as the third
  // state — neither is a shortfall we are in a position to assert.
  const unreadableSet = new Set([
    ...(analysisInput.unreadable_fields ?? []),
    ...(analysisInput.disputed_fields ?? []),
  ]);

  /**
   * Row styling with a third state. A value we could not read is neither a pass
   * nor a shortfall, so it must not wear the red "below requirement" treatment —
   * that is the false claim this wave exists to remove.
   */
  const rowClass = (passed: boolean, field?: string) =>
    field && unreadableSet.has(field)
      ? "bg-violet-50 border-violet-200 text-violet-950"
      : passed
      ? "bg-slate-50 border-slate-200"
      : "bg-red-50 border-red-200 text-red-950";

  const valueClass = (passed: boolean, field?: string) =>
    field && unreadableSet.has(field)
      ? "text-violet-800"
      : passed
      ? "text-slate-800"
      : "text-red-700 font-extrabold";

  /** Never render an unread box as "$0" — that states a limit the certificate does not. */
  const valueText = (field: string, value: number | null | undefined) =>
    unreadableSet.has(field) ? "Not readable" : formatUSD(value);

  // Insured-name identity: does the certificate's insured fuzzy-match the enrolled
  // vendor? Reuses the same normalization/inclusion logic as the engine advisory.
  // Neutral (treated as a match) when either name is blank.
  const insuredNameProvided = !!(activeData.insured_name || "").trim() && !!(subContractorName || "").trim();
  const isInsuredNameMatch = !insuredNameProvided || isNamedAdditionalInsured(subContractorName, [activeData.insured_name || ""]);

  // Compare each field to see if it meets threshold reactively
  const isGlOccPassed = activeData.gl_each_occurrence >= req.gl_occurrence;
  const isGlAggPassed = activeData.gl_general_aggregate >= req.gl_aggregate;
  const isAutoPassed = activeData.auto_combined_single_limit >= req.auto_limit;
  const isWcPassed = !req.workers_comp || activeData.workers_comp_statutory;

  const isGlProdPassed = (activeData.gl_products_completed ?? 0) >= (req.gl_products_completed ?? 2000000);

  // Umbrella: project baseline, raised by any trade rule (see tradeRules.ts)
  const requiredUmbrella = required.umbrella;
  const isUmbrellaPassed = (activeData.umbrella_limit ?? 0) >= requiredUmbrella;

  const isElAccidentPassed = (activeData.employers_liability_accident ?? 0) >= (req.employers_liability_accident ?? 1000000);
  const isElDiseasePersonPassed = (activeData.employers_liability_disease_person ?? 0) >= (req.employers_liability_disease_person ?? 1000000);
  const isElDiseaseLimitPassed = (activeData.employers_liability_disease_limit ?? 0) >= (req.employers_liability_disease_limit ?? 1000000);

  const isProfessionalRequired = required.professionalLiability > 0;
  const isProfessionalPassed = (activeData.professional_liability ?? 0) >= required.professionalLiability;

  const isPollutionRequired = required.pollutionLiability > 0;
  const isPollutionPassed = (activeData.pollution_liability ?? 0) >= required.pollutionLiability;

  const isNotExpired = new Date(activeData.policy_expiration_date) > new Date(evaluationDate);

  // GL coverage form: only an explicit claims-made basis fails; Occurrence/Unknown pass.
  const isGlFormOk = activeData.gl_form !== "Claims-Made";

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
        { ...activeData, reviewed: attested }
      );
      onClose();
    } catch (err: any) {
      // Surface the real reason (e.g. document archiving failed) so the
      // reviewer knows whether to retry or fall back to manual entry.
      alert(err?.message || "Failed to apply compliance update.");
    } finally {
      setSubmitting(false);
    }
  };

  const isManualMode = isManualEntry;

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
    insured_name: isInsuredNameMatch ? "neutral" : "fail",
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
              templatePage={activeData.certificate_page}
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

          {/* Fields the extractor could not read — the reviewer must confirm these
              against the certificate itself. Deliberately NOT styled as a failure:
              nothing here says the coverage is short, only that it is unverified. */}
          {reviewNotes.length > 0 && (
            <div id="needs-review-banner" className="bg-violet-50 border border-violet-200 text-violet-950 p-3 rounded-lg flex items-start space-x-2 text-xs">
              <HelpCircle className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-violet-900">
                  {reviewNotes.length === 1 ? "1 value could not be read" : `${reviewNotes.length} values could not be read`}
                </span>
                <span className="text-slate-650 font-medium block mb-1.5">
                  Shown as &ldquo;Not readable&rdquo; below rather than $0 — nothing was extracted, which is not the same as the certificate saying zero. Check them against the document, then switch to manual entry to record the real figures.
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-violet-900 font-medium">
                  {reviewNotes.map((note) => (
                    <li key={note}>{note.split(":")[0]}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* How much verification actually happened. Deliberately explicit about
              the negative case: photos, scans, and faxes carry no text layer, so
              the app must not let a single reading look like a confirmed one. */}
          {!isManualMode && !activeData.simulated && crossCheck && (
            <div
              id="cross-check-banner"
              className={`p-3 rounded-lg flex items-start space-x-2 text-xs border ${
                crossCheck.hadTextLayer
                  ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              {crossCheck.hadTextLayer ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <FileWarning className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
              )}
              <div>
                {crossCheck.hadTextLayer ? (
                  <>
                    <span className="font-bold block text-emerald-900">
                      {crossCheck.agreed.length} value{crossCheck.agreed.length === 1 ? "" : "s"} confirmed by two independent readings
                    </span>
                    <span className="text-slate-650 font-medium">
                      The AI reading was checked against the document&rsquo;s own text layer.
                      {crossCheck.disputed.length > 0 && ` ${crossCheck.disputed.length} disagreed and ${crossCheck.disputed.length === 1 ? "is" : "are"} flagged below.`}
                      {crossCheck.unverified.length > 0 && ` ${crossCheck.unverified.length} could only be read by one source.`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold block text-slate-900">Single source — no second reading available</span>
                    <span className="text-slate-650 font-medium">
                      This document has no text layer (it is a photo, scan, or fax), so the extracted values could not be independently confirmed. Check them against the certificate before relying on them.
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Per-coverage policy periods. A single expiration date with no
              explanation of where it came from is exactly the opacity this wave
              is removing: show every row, and mark the one that governs. */}
          {(activeData.policy_lines?.length ?? 0) > 0 && (
            <div id="policy-periods" className="bg-white border border-slate-200 rounded-lg p-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Policy periods
              </h4>
              <div className="space-y-1">
                {activeData.policy_lines!.map((pl, i) => {
                  const governs = !!pl.expiration && pl.expiration === activeData.policy_expiration_date;
                  return (
                    <div
                      key={`${pl.line}-${i}`}
                      className={`flex items-center justify-between text-[11px] px-2 py-1 rounded border ${
                        governs ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <span className="font-semibold text-slate-800">
                        {pl.line}
                        {pl.policy_number && <span className="ml-1.5 font-mono text-[10px] text-slate-500">{pl.policy_number}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-slate-700">{pl.expiration || "—"}</span>
                        {governs && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-800" title="Earliest required coverage to lapse — compliance is evaluated against this date">
                            Governs
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Coverage rows expire independently. Compliance runs against the earliest required coverage to lapse; unrelated &ldquo;Other&rdquo; rows are excluded.
              </p>
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
              <div
                id="match-row-insured"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  isInsuredNameMatch ? "bg-slate-50 border-slate-200" : "bg-amber-50 border-amber-200"
                }`}
              >
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
                      <p className={`text-[10px] ${isInsuredNameMatch ? "text-slate-400" : "text-amber-700 font-semibold"}`}>
                        Registry name: {subContractorName}
                      </p>
                    </>
                  )}
                </div>
                <div className="col-span-1 flex justify-center">
                  {isInsuredNameMatch ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span
                      className="text-[10px] text-amber-600 font-bold uppercase"
                      title="Insured name does not match the enrolled vendor — verify this certificate belongs to this vendor"
                    >
                      ⚠
                    </span>
                  )}
                </div>
              </div>

              {/* Each Occurrence */}
              <div
                id="match-row-gl-occurrence"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  rowClass(isGlOccPassed, "gl_each_occurrence")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isGlOccPassed, "gl_each_occurrence")}`}>
                      {valueText("gl_each_occurrence", activeData.gl_each_occurrence)}
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
                  rowClass(isGlAggPassed, "gl_general_aggregate")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isGlAggPassed, "gl_general_aggregate")}`}>
                      {valueText("gl_general_aggregate", activeData.gl_general_aggregate)}
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

              {/* GL Coverage Form (Occurrence vs Claims-Made) */}
              <div
                id="match-row-gl-form"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  rowClass(isGlFormOk)
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">GL Coverage Form</p>
                  <p className="text-[10px] text-slate-500">Must be occurrence-based</p>
                </div>
                <div className="col-span-3 text-right">
                  {isManualMode ? (
                    <select
                      id="input-gl-form"
                      value={activeData.gl_form || "Occurrence"}
                      onChange={(e) =>
                        setFormData({ ...activeData, gl_form: e.target.value as "Occurrence" | "Claims-Made" | "Unknown" })
                      }
                      className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Occurrence">Occurrence</option>
                      <option value="Claims-Made">Claims-Made</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  ) : (
                    <p className={`text-xs font-bold ${valueClass(isGlFormOk)}`}>
                      {activeData.gl_form || "Unknown"}
                    </p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs text-slate-500">Occurrence</p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isGlFormOk ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold uppercase">FAIL</span>
                  )}
                </div>
              </div>

              {/* Automobile Liability */}
              <div
                id="match-row-auto-limit"
                className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                  rowClass(isAutoPassed, "auto_combined_single_limit")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isAutoPassed, "auto_combined_single_limit")}`}>
                      {valueText("auto_combined_single_limit", activeData.auto_combined_single_limit)}
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
                  rowClass(isWcPassed)
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
                  rowClass(isNotExpired, "policy_expiration_date")
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
                    <p className={`text-xs font-mono font-bold ${valueClass(isNotExpired, "policy_expiration_date")}`}>
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
                  rowClass(isGlProdPassed, "gl_products_completed")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isGlProdPassed, "gl_products_completed")}`}>
                      {valueText("gl_products_completed", activeData.gl_products_completed)}
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
                  rowClass(isUmbrellaPassed, "umbrella_limit")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isUmbrellaPassed, "umbrella_limit")}`}>
                      {valueText("umbrella_limit", activeData.umbrella_limit)}
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
                  rowClass(isElAccidentPassed, "employers_liability_accident")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isElAccidentPassed, "employers_liability_accident")}`}>
                      {valueText("employers_liability_accident", activeData.employers_liability_accident)}
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
                  rowClass(isElDiseasePersonPassed, "employers_liability_disease_person")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isElDiseasePersonPassed, "employers_liability_disease_person")}`}>
                      {valueText("employers_liability_disease_person", activeData.employers_liability_disease_person)}
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
                  rowClass(isElDiseaseLimitPassed, "employers_liability_disease_limit")
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
                    <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isElDiseaseLimitPassed, "employers_liability_disease_limit")}`}>
                      {valueText("employers_liability_disease_limit", activeData.employers_liability_disease_limit)}
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
                    rowClass(isProfessionalPassed, "professional_liability")
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
                      <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isProfessionalPassed, "professional_liability")}`}>
                        {valueText("professional_liability", activeData.professional_liability)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                      {formatUSD(required.professionalLiability)}
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
                    rowClass(isPollutionPassed, "pollution_liability")
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
                      <p className={`text-xs font-mono font-bold tracking-tight tabular-nums ${valueClass(isPollutionPassed, "pollution_liability")}`}>
                        {valueText("pollution_liability", activeData.pollution_liability)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-xs font-mono text-slate-500 tracking-tight tabular-nums">
                      {formatUSD(required.pollutionLiability)}
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
                        const namedList = activeData.additional_insured_named || [];
                        const named = isNamedAdditionalInsured(reqName, namedList);
                        const similar = !named && namedList.some((n) => matchEntityNames(reqName, n) === "partial");
                        const blanketOk = !named && !similar && !!activeData.additional_insured_blanket && project.accept_blanket_ai !== false;
                        const status = named ? "named" : similar ? "similar" : blanketOk ? "blanket" : "missing";
                        return (
                          <div
                            key={`ai-${idx}`}
                            data-testid={`match-row-ai-${idx}`}
                            className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded border ${
                              status === "named"
                                ? "bg-slate-50 border-slate-200"
                                : status === "blanket" || status === "similar"
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
                                  status === "named"
                                    ? "text-emerald-700"
                                    : status === "blanket" || status === "similar"
                                    ? "text-amber-700"
                                    : "text-red-700"
                                }`}
                              >
                                {status === "named"
                                  ? "Named"
                                  : status === "similar"
                                  ? "Similar name — verify"
                                  : status === "blanket"
                                  ? "Blanket — verify endorsement"
                                  : "Not listed"}
                              </p>
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {status === "named" ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : status === "similar" ? (
                                <span className="text-[10px] text-amber-600 font-bold uppercase" title="A similar but not identical name appears on the certificate — verify it refers to the same entity">⚠</span>
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

              {/* Endorsement verification (opt-in per project; advisory only) */}
              {project.endorsement_requirements &&
                (project.endorsement_requirements.waiver_of_subrogation ||
                  project.endorsement_requirements.primary_noncontributory ||
                  project.endorsement_requirements.project_aggregate ||
                  project.endorsement_requirements.completed_ops_ai) && (
                  <div id="drawer-endorsements-group" className="pt-2.5 border-t border-slate-200 mt-2 space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">
                      Required Endorsements
                    </p>
                    <p className="text-[10px] text-slate-500 px-1 -mt-1 leading-snug">
                      Advisory only — a certificate box is not proof of the endorsement form.
                    </p>
                    {(
                      [
                        ["waiver_of_subrogation", "Waiver of Subrogation", "CG 24 04"],
                        ["primary_noncontributory", "Primary & Non-Contributory", "CG 20 01"],
                        ["project_aggregate", "Per-Project Aggregate", "CG 25 03"],
                        ["completed_ops_ai", "Completed-Ops Additional Insured", "CG 20 37"],
                      ] as const
                    ).map(([key, label, form]) => {
                      if (!project.endorsement_requirements?.[key]) return null;
                      const facts = activeData.endorsement_facts || {};
                      const present = !!facts[key];
                      return (
                        <div
                          key={key}
                          data-testid={`match-row-endorsement-${key}`}
                          className="grid grid-cols-12 gap-2 items-center p-2.5 rounded border bg-amber-50 border-amber-200"
                        >
                          <div className="col-span-7">
                            <p className="text-xs font-bold text-slate-800">{label}</p>
                            <p className="text-[10px] text-slate-500">Verify endorsement (e.g. {form})</p>
                          </div>
                          <div className="col-span-4 text-right">
                            {isManualMode ? (
                              <label className="inline-flex items-center space-x-1.5 cursor-pointer justify-end">
                                <input
                                  type="checkbox"
                                  checked={present}
                                  onChange={(e) =>
                                    setFormData({ ...activeData, endorsement_facts: { ...facts, [key]: e.target.checked } })
                                  }
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                />
                                <span className="text-[11px] font-bold text-slate-700">On certificate</span>
                              </label>
                            ) : (
                              <p className="text-[11px] font-bold text-amber-700">
                                {present ? "Indicated — verify" : "Not found — request"}
                              </p>
                            )}
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <span
                              className="text-[10px] text-amber-600 font-bold uppercase"
                              title={present ? "Indicated on certificate — verify the endorsement form" : "Required but not found — request the endorsement"}
                            >
                              ⚠
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
            <label
              htmlFor="reviewer-attestation"
              className="flex items-start gap-2 mr-auto cursor-pointer select-none max-w-[380px]"
              title="Records that you checked this certificate against the document. It does not change the compliance result."
            >
              <input
                id="reviewer-attestation"
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-indigo-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-600 leading-tight">
                I reviewed this certificate against the document.
                <span className="block text-[10px] text-slate-450">Recorded with your name — it does not change the compliance result.</span>
              </span>
            </label>
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
