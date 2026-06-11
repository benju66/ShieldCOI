import React, { useState, useEffect } from "react";
import { X, Check, ShieldCheck, ShieldAlert, FileWarning, Eye } from "lucide-react";
import { Project } from "../types";
import { verifyCompliance } from "../complianceEngine";

interface VerificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  subContractorId: string;
  subContractorName: string;
  extractedData: {
    insured_name: string;
    gl_each_occurrence: number;
    gl_general_aggregate: number;
    auto_combined_single_limit: number;
    workers_comp_statutory: boolean;
    policy_expiration_date: string;
    file_name: string;
    simulated: boolean;
    warning?: string;
  } | null;
  onSave: (manualOverride: boolean, notes: string, status: "Compliant" | "Insufficient Coverage" | "Expired") => Promise<void>;
}

export default function VerificationDrawer({
  isOpen,
  onClose,
  project,
  subContractorId,
  subContractorName,
  extractedData,
  onSave,
}: VerificationDrawerProps) {
  const [override, setOverride] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto reset state on open
  useEffect(() => {
    if (isOpen) {
      setOverride(false);
      setOverrideNotes("");
    }
  }, [isOpen]);

  if (!isOpen || !extractedData) return null;

  // Run compliance analysis engine
  const req = project.requirements;
  const analysis = verifyCompliance(project, extractedData);

  // Compare each field to see if it meets threshold
  const isGlOccPassed = extractedData.gl_each_occurrence >= req.gl_occurrence;
  const isGlAggPassed = extractedData.gl_general_aggregate >= req.gl_aggregate;
  const isAutoPassed = extractedData.auto_combined_single_limit >= req.auto_limit;
  const isWcPassed = !req.workers_comp || extractedData.workers_comp_statutory;

  const currentYearDateStr = "2026-06-11";
  const isNotExpired = new Date(extractedData.policy_expiration_date) > new Date(currentYearDateStr);

  const finalStatus = override 
    ? "Compliant" 
    : analysis.status === "Pending Upload" ? "Insufficient Coverage" : analysis.status;

  const handleApplyResolution = async () => {
    try {
      setSubmitting(true);
      await onSave(override, overrideNotes, finalStatus as any);
      onClose();
    } catch (err) {
      alert("Failed to apply compliance update.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="verification-overlay-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end transition-all select-none">
      <div id="verification-drawer-container" className="w-full max-w-2xl bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div id="verification-header" className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Verification Compliance Matrix
            </span>
            <h2 id="verification-title" className="text-xs font-bold text-slate-900 tracking-tight font-display mt-1.5 uppercase">
              Reviewing COI: {subContractorName}
            </h2>
            <p className="text-[11px] text-slate-500">
              Comparing extracted facts from standard ACORD 25 for {project.name}.
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
          {/* Simulation warnings if no real API key is running */}
          {extractedData.simulated && (
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
                  <p className="text-xs font-mono font-bold text-blue-600">{extractedData.insured_name}</p>
                  <p className="text-[10px] text-slate-400">Registry name: {subContractorName}</p>
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
                  <p className={`text-xs font-mono font-bold ${isGlOccPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                    ${extractedData.gl_each_occurrence.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500">
                    ${req.gl_occurrence.toLocaleString()}
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
                  <p className={`text-xs font-mono font-bold ${isGlAggPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                    ${extractedData.gl_general_aggregate.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500">
                    ${req.gl_aggregate.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-1 flex justify-center">
                  {isGlAggPassed ? (
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
                  isAutoPassed ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200 text-red-950"
                }`}
              >
                <div className="col-span-5">
                  <p className="text-xs font-bold text-slate-800">Automobile combined Limit</p>
                </div>
                <div className="col-span-3 text-right">
                  <p className={`text-xs font-mono font-bold ${isAutoPassed ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                    ${extractedData.auto_combined_single_limit.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-3 text-right">
                  <p className="text-xs font-mono text-slate-500">
                    ${req.auto_limit.toLocaleString()}
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
                  <p className={`text-xs font-bold ${isWcPassed ? "text-emerald-700 animate-pulse" : "text-red-700 font-bold"}`}>
                    {extractedData.workers_comp_statutory ? "Statutory Limits" : "Not Provided"}
                  </p>
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
                  <p className={`text-xs font-mono font-bold ${isNotExpired ? "text-slate-800" : "text-red-700 font-extrabold"}`}>
                    {extractedData.policy_expiration_date}
                  </p>
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

          {/* Override Form Panel */}
          <div id="override-form" className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3.5 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">Legal Compliance Overriding Dispensation</p>
                <p className="text-[10px] text-slate-500">
                  Allow temporarily overriding standard project gaps with proper written justification notes.
                </p>
              </div>
              <label id="override-toggle-label" className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-450 after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {override && (
              <div id="override-justification-area" className="space-y-1 animate-in fade-in duration-150">
                <label htmlFor="compliance-exception-notes" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Mandated Override Reason & Justification *
                </label>
                <textarea
                  id="compliance-exception-notes"
                  rows={3}
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder="e.g. Risk Committee approved exception as drywall trade holds low structural risk parameters."
                  className="w-full text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                ></textarea>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div id="verification-footer" className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-1.5Slot pb-2.5 py-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evaluation Status:</span>
            {finalStatus === "Compliant" ? (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center shadow-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Compliant
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
              className="px-3.5 py-1.5 bg-white text-slate-700 border border-slate-205 border-slate-200 hover:bg-slate-100 rounded-md font-bold text-[11px] cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyResolution}
              type="button"
              disabled={override && !overrideNotes.trim() || submitting}
              className={`px-4 py-1.5 rounded-md text-[11px] font-bold tracking-wide uppercase transition-all shadow-xs cursor-pointer ${
                override && !overrideNotes.trim()
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
