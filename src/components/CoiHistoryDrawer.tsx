import React, { useState, useEffect } from "react";
import { X, Clock, Calendar, Shield, Check, Flame, ChevronRight, FileText, CheckCircle2, AlertTriangle, HelpCircle, ArrowUpRight } from "lucide-react";
import { Subcontractor, CoiRecord } from "../types";
import { getCoiRecords } from "../dbService";
import { formatUSD } from "../utils/currency";

interface CoiHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  subcontractor: Subcontractor;
}

export default function CoiHistoryDrawer({
  isOpen,
  onClose,
  projectId,
  subcontractor,
}: CoiHistoryDrawerProps) {
  const [records, setRecords] = useState<CoiRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CoiRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const historyData = await getCoiRecords(projectId, subcontractor.id);
        // Note: they are already ordered descending by uploaded_at in getCoiRecords
        setRecords(historyData);
        if (historyData.length > 0) {
          setSelectedRecord(historyData[0]);
        } else {
          setSelectedRecord(null);
        }
      } catch (err) {
        console.error("Failed to load COI history:", err);
        setError("Could not retrieve past records.");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [isOpen, projectId, subcontractor.id]);

  if (!isOpen) return null;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) + " - " + date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getEvaluationBadge = (record: CoiRecord) => {
    const errorCount = record.validation_errors?.length ?? 0;
    const isOverridden = subcontractor.manual_override;

    if (errorCount === 0) {
      return (
        <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight shadow-xs">
          <Check className="h-3 w-3 stroke-[3]" />
          <span>Passed</span>
        </span>
      );
    } else if (isOverridden) {
      return (
        <span className="inline-flex items-center space-x-1 text-purple-750 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight shadow-xs" title="Overridden on subcontractor record">
          <HelpCircle className="h-3 w-3 stroke-[2.5]" />
          <span>Approved via Exception</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center space-x-1 text-red-750 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight shadow-xs">
          <X className="h-3 w-3 stroke-[3]" />
          <span>Contained Infractions</span>
        </span>
      );
    }
  };

  return (
    <div id="coi-history-overlay-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end transition-all">
      <div id="coi-history-drawer-container" className="w-full max-w-4xl bg-slate-50 border-l border-slate-200 h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-250">
        
        {/* Header section */}
        <div id="history-header" className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                COI Ledger Timeline
              </span>
              <h2 id="history-drawer-title" className="text-xs font-bold text-slate-909 tracking-tight font-display mt-1 uppercase">
                {subcontractor.company_name} — Policy History
              </h2>
              <p className="text-[11px] text-slate-500">
                Inspect past compliance status, uploaded certificates of insurance, and historical policy years.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer"
            title="Close version history"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-slate-400">
            <div className="animate-spin h-6 w-6 border-2 border-blue-550 border-t-transparent rounded-full mb-3"></div>
            <p className="text-xs font-medium">Fetching historical records...</p>
          </div>
        ) : error ? (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-red-500 space-y-2">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="text-xs font-semibold">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-slate-400 space-y-3">
            <div className="p-4 bg-white border border-slate-200 rounded-full">
              <FileText className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-xs font-medium text-slate-500">No previous insurance certificates have been uploaded for this partner.</p>
          </div>
        ) : (
          /* Split Layout Container */
          <div id="history-drawer-grid" className="flex-grow grid grid-cols-1 md:grid-cols-12 overflow-hidden h-full">
            
            {/* Left/Top Panel: The Archive Timeline */}
            <div id="archive-timeline-panel" className="col-span-1 md:col-span-5 border-r border-slate-250 flex flex-col h-full overflow-hidden bg-slate-50">
              <div className="p-3 bg-white border-b border-slate-200">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Document History ({records.length})
                </h3>
              </div>
              
              <div id="history-scroll-container" className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                {records.map((item) => {
                  const isSelected = selectedRecord?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedRecord(item)}
                      type="button"
                      className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col justify-start relative cursor-pointer group ${
                        isSelected
                          ? "bg-white border-blue-500 shadow-sm ring-1 ring-blue-200/50"
                          : "bg-white hover:bg-slate-100/50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full gap-2 mb-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-500 break-all line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {item.file_name}
                        </span>
                        <div className="shrink-0">
                          {getEvaluationBadge(item)}
                        </div>
                      </div>
                      
                      <div className="space-y-1 text-[11px] text-slate-500 w-full pt-1.5 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Uploaded:</span>
                          <span className="text-slate-700 font-mono">{formatDate(item.uploaded_at)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Policy Exp:</span>
                          <span className="text-slate-700 font-mono">{item.policy_expiration_date_extracted ?? "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Method:</span>
                          <span className={`font-semibold ${item.extraction_method === "Manual_Entry" ? "text-amber-700" : "text-emerald-700"}`}>
                            {item.extraction_method === "Manual_Entry" ? "📝 Manual" : "🤖 AI Scan"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right/Bottom Panel: Historical Inspector Snapshot */}
            <div id="inspector-snapshot-panel" className="col-span-1 md:col-span-7 flex flex-col h-full overflow-hidden bg-white">
              {selectedRecord ? (
                <div className="h-full flex flex-col overflow-hidden">
                  
                  {/* Banner warning */}
                  <div className="p-3 bg-amber-50 border-b border-amber-200/50 text-amber-850 flex items-start space-x-2 text-xs">
                    <span role="img" aria-label="archival record symbol" className="text-base flex-shrink-0 mt-0.5">🚨</span>
                    <div>
                      <strong className="text-amber-900 block font-semibold text-[11px] uppercase tracking-wide">Archival Record</strong>
                      <span className="text-slate-650 font-medium text-[11px]">
                        This summary displays the liability coverage parameters active at the time this certificate was uploaded.
                      </span>
                    </div>
                  </div>

                  {/* Inspector details body */}
                  <div id="historic-inspector-body" className="flex-grow overflow-y-auto p-4 lg:p-5 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    
                    {/* Header info */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2 text-xs">
                        <span className="font-semibold text-slate-500">Record Specifications</span>
                        <span className="font-mono text-[11px] text-blue-600 font-bold bg-blue-50/75 p-0.5 px-1.5 rounded border border-blue-200">
                          {selectedRecord.id}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400 block font-medium">Source Document File</span>
                          <span className="text-slate-800 font-mono font-semibold break-all">{selectedRecord.file_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Insured Name Stated</span>
                          <span className="text-slate-800 font-semibold">{selectedRecord.insured_extracted_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Policy Expiration Date</span>
                          <span className="text-slate-800 font-semibold font-mono">{selectedRecord.policy_expiration_date_extracted ?? "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Extraction Source</span>
                          <span className={`font-semibold ${selectedRecord.extraction_method === "Manual_Entry" ? "text-amber-700" : "text-emerald-700"}`}>
                            {selectedRecord.extraction_method === "Manual_Entry" ? "📝 Manual Entry" : "🤖 AI Scan"}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400 block font-medium">Analysis Audit Outcome</span>
                          <span className="text-slate-800 font-semibold">
                            {selectedRecord.validation_errors && selectedRecord.validation_errors.length === 0 ? "Compliant & Valid" : `${selectedRecord.validation_errors?.length} Exception(s) Found`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Exceptions / Validation errors list */}
                    {selectedRecord.validation_errors && selectedRecord.validation_errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <h4 className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-2 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1 text-red-600" />
                          Extracted Validation Infractions
                        </h4>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
                          {selectedRecord.validation_errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Coverage limits grid */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Extracted Liability Limits
                      </h4>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                        {/* CGL Occurrence */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Commercial General Liability (CGL) Occurrence</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.gl_occurrence_extracted)}
                          </span>
                        </div>

                        {/* CGL Aggregate */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Commercial General Liability (CGL) General Aggregate</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.gl_aggregate_extracted)}
                          </span>
                        </div>

                        {/* Excess/Umbrella */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Excess/Umbrella Liability Limit</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.umbrella_limit_extracted)}
                          </span>
                        </div>

                        {/* Auto */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Automobile Liability Combined Single Limit (CSL)</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.auto_combined_single_limit_extracted)}
                          </span>
                        </div>

                        {/* Employers Liability Accident */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Employers' Liability - Each Accident</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.employers_liability_accident_extracted)}
                          </span>
                        </div>

                        {/* Employers Liability Disease Person */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Employers' Liability - Disease (Each Employee)</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.employers_liability_disease_person_extracted)}
                          </span>
                        </div>

                        {/* Employers Liability Disease Limit */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Employers' Liability - Disease (Policy Limit)</span>
                          <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                            {formatUSD(selectedRecord.employers_liability_disease_limit_extracted)}
                          </span>
                        </div>

                        {/* Workers Comp (Statutory States) */}
                        <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                          <span className="col-span-8 text-slate-600 font-medium font-sans">Workers' Comp & Employers' Liability - Statutory Limits</span>
                          <span className="col-span-4 text-right font-sans font-bold">
                            {selectedRecord.workers_comp_statutory_extracted ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight border border-emerald-200">
                                Active / Statutory
                              </span>
                            ) : (
                              <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight border border-red-200">
                                Excluded / Inactive
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Professional Liability */}
                        {selectedRecord.professional_liability_extracted !== undefined && (
                          <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                            <span className="col-span-8 text-slate-600 font-medium font-sans">Professional Liability Limit</span>
                            <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedRecord.professional_liability_extracted)}
                            </span>
                          </div>
                        )}

                        {/* Pollution Liability */}
                        {selectedRecord.pollution_liability_extracted !== undefined && (
                          <div className="grid grid-cols-12 gap-2 text-xs p-2.5 items-center">
                            <span className="col-span-8 text-slate-600 font-medium font-sans">Contractors Pollution Liability Limit</span>
                            <span className="col-span-4 text-right font-mono font-bold text-slate-800 text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedRecord.pollution_liability_extracted)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center p-8 text-slate-400 space-y-2">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="text-xs font-semibold">Select an archival version to view active limits.</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
