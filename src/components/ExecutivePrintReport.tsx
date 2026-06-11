import React from "react";
import { Project, Subcontractor, CoiRecord } from "../types";
import { formatUSD } from "../utils/currency";

interface ExecutivePrintReportProps {
  project: Project | null;
  subcontractors: Subcontractor[];
  activeCoiMap: Record<string, CoiRecord>;
}

export default function ExecutivePrintReport({
  project,
  subcontractors,
  activeCoiMap,
}: ExecutivePrintReportProps) {
  if (!project) return null;

  // Get current system generation date formatted nicely
  const generationDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8 text-slate-900 bg-white antialiased font-sans">
      {/* Header Box */}
      <div className="border-b-2 border-slate-900 pb-5 mb-8 flex flex-col md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight uppercase text-slate-900">
            ShieldCOI Compliance Ledger
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">
            Official Executive Insurance Compliance Report
          </p>
        </div>
        <div className="mt-3 md:mt-0 text-right text-[11px] text-slate-500">
          <p>
            <span className="font-semibold">Generated:</span> {generationDate}
          </p>
          <p>
            <span className="font-semibold text-blue-600">ShieldCOI Premium Ledger v1.0</span>
          </p>
        </div>
      </div>

      {/* Project Meta Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-5 mb-8">
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-bold block tracking-wider">
            PROJECT NAME
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{project.name}</h2>
        </div>
        <div className="text-left md:text-right">
          <span className="text-[10px] text-slate-500 uppercase font-bold block tracking-wider">
            PROJECT IDENTIFIER NUMBER
          </span>
          <h2 className="text-lg font-mono font-bold text-blue-700 mt-0.5">{project.number}</h2>
        </div>
      </div>

      {/* Threshold Summary Section */}
      <div className="mb-8">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-slate-350 pb-2 mb-4">
          Core Policy Requirements & Limits
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-500 block uppercase text-[10px] font-semibold tracking-wider">
              GL Occurrence Limit
            </span>
            <strong className="text-base font-mono font-bold text-slate-900 tracking-tight tabular-nums">
              {formatUSD(project.requirements.gl_occurrence)}
            </strong>
          </div>

          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-505 block uppercase text-[10px] font-semibold tracking-wider">
              GL Aggregate Limit
            </span>
            <strong className="text-base font-mono font-bold text-slate-900 tracking-tight tabular-nums">
              {formatUSD(project.requirements.gl_aggregate)}
            </strong>
          </div>

          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-505 block uppercase text-[10px] font-semibold tracking-wider">
              Auto Combined Single Limit
            </span>
            <strong className="text-base font-mono font-bold text-slate-900 tracking-tight tabular-nums">
              {formatUSD(project.requirements.auto_limit)}
            </strong>
          </div>

          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-505 block uppercase text-[10px] font-semibold tracking-wider">
              Umbrella Requirement
            </span>
            <strong className="text-base font-mono font-bold text-slate-900 tracking-tight tabular-nums">
              {project.requirements.umbrella_limit
                ? formatUSD(project.requirements.umbrella_limit)
                : "Not Required"}
            </strong>
          </div>

          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-550 block uppercase text-[10px] font-semibold tracking-wider">
              Workers' Comp Limits
            </span>
            <strong className="text-base uppercase text-slate-900">
              {project.requirements.workers_comp ? "Statutory Limits" : "Excluded"}
            </strong>
          </div>

          <div className="border-l-2 border-slate-705 pl-3">
            <span className="text-slate-550 block uppercase text-[10px] font-semibold tracking-wider">
              Grace Warn Threshold
            </span>
            <strong className="text-base text-slate-900">
              {project.requirements.warn_days_out} Days Prior
            </strong>
          </div>
        </div>
      </div>

      {/* Subcontractor Status Grid */}
      <div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-slate-350 pb-2 mb-4">
          Subcontractor Compliance Matrix
        </h3>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold uppercase text-slate-700 bg-slate-50">
              <th className="p-3">Vendor / Company</th>
              <th className="p-3">Trade Scope</th>
              <th className="p-3 text-right">Contract Value</th>
              <th className="p-3 text-center">Compliance Status</th>
              <th className="p-3 text-center">Expiration Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {subcontractors.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                  No enrolled subcontractor vendors registered for this project.
                </td>
              </tr>
            ) : (
              subcontractors.map((sub) => {
                const activeCoi = activeCoiMap[sub.id];
                const coiExpDate = activeCoi 
                  ? (activeCoi.policy_expiration_date_extracted || (activeCoi as any).policy_expiration_date)
                  : null;

                // Simple check for print version text
                let printStatus = sub.compliance_status;
                if (sub.manual_override) {
                  printStatus = "Approved Exception";
                }

                // Status border or indicators suitable for black/white printouts
                let statusLabel = printStatus;
                let statusStyle = "text-slate-900 font-medium";
                if (printStatus === "Compliant") {
                  statusStyle = "text-emerald-800 font-semibold";
                } else if (printStatus === "Expired") {
                  statusStyle = "text-red-800 font-bold underline";
                } else if (printStatus === "Insufficient Coverage") {
                  statusStyle = "text-amber-800 font-semibold";
                } else if (printStatus === "Approved Exception") {
                  statusStyle = "text-indigo-800 font-semibold italic";
                }

                return (
                  <tr key={sub.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div>
                        <span className="font-bold text-slate-900">{sub.company_name}</span>
                        {sub.manual_override && (
                          <div className="text-[10px] text-slate-550 italic mt-0.5">
                            Note: {sub.override_notes || "Authorized audit waiver active."}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-700">{sub.trade}</td>
                    <td className="p-3 text-right font-mono text-slate-950 tracking-tight tabular-nums">
                      {formatUSD(sub.contract_value)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={statusStyle}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">
                      {coiExpDate ? coiExpDate : "No Document"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Print Footer Acknowledgement */}
      <div className="mt-12 pt-4 border-t border-dashed border-slate-300 text-[10px] text-slate-400 text-center">
        <p>ShieldCOI Ledger Official Output Summary. Audit records are persistently managed via secure Firestore credentials.</p>
        <p className="mt-1">For questions concerning policy limits or coverage qualifications, contact your risk compliance administrator.</p>
      </div>
    </div>
  );
}
