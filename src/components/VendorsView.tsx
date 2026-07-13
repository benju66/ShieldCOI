import { useMemo, useState } from "react";
import { Building2, ChevronRight, ChevronUp, ChevronDown, Search, Layers, ArrowRight } from "lucide-react";
import { Project, Subcontractor, CoiRecord } from "../types";
import { buildVendorSummaries, statusSeverity, ComplianceStatus } from "../vendors";
import { formatUSD } from "../utils/currency";

type SortKey = "attention" | "name" | "projects";

/** Ascending comparator per column; the toolbar flips direction as needed. */
const SORT_COMPARE: Record<SortKey, (a: { name: string; worstStatus: ComplianceStatus; projectCount: number }, b: { name: string; worstStatus: ComplianceStatus; projectCount: number }) => number> = {
  attention: (a, b) => statusSeverity(a.worstStatus) - statusSeverity(b.worstStatus),
  name: (a, b) => a.name.localeCompare(b.name),
  projects: (a, b) => a.projectCount - b.projectCount,
};

// Natural default direction when a sort is first selected (false = descending).
const SORT_DEFAULT_ASC: Record<SortKey, boolean> = { attention: false, name: true, projects: false };

interface VendorsViewProps {
  projects: Project[];
  subcontractors: Subcontractor[];
  coiMap: Record<string, CoiRecord>;
  /** The date "expiring soon" is measured against. */
  evalDate: string;
  onOpenProject: (projectId: string) => void;
}

const STATUS_BADGE: Record<ComplianceStatus, string> = {
  Compliant: "text-emerald-800 bg-emerald-50 border-emerald-200/80",
  Expired: "text-red-800 bg-red-50 border-red-200/80 font-bold",
  "Insufficient Coverage": "text-amber-800 bg-amber-50 border-amber-200/80",
  "Approved Exception": "text-indigo-800 bg-indigo-50 border-indigo-200/80 font-bold",
  "Pending Upload": "text-slate-600 bg-slate-50 border-slate-250",
};

function StatusBadge({ status }: { status: ComplianceStatus }) {
  return (
    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${STATUS_BADGE[status]}`}>
      {status}
    </span>
  );
}

/** Color a COI expiration date relative to the evaluation date. */
function expirationClass(exp: string | null, evalDate: string): string {
  if (!exp) return "text-slate-400 italic";
  const days = Math.ceil((new Date(exp).getTime() - new Date(evalDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "text-red-600 font-bold";
  if (days <= 30) return "text-amber-600";
  return "text-slate-600";
}

export default function VendorsView({ projects, subcontractors, coiMap, evalDate, onOpenProject }: VendorsViewProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [sortAsc, setSortAsc] = useState(SORT_DEFAULT_ASC.attention);

  const summaries = useMemo(
    () => buildVendorSummaries(subcontractors, projects, coiMap),
    [subcontractors, projects, coiMap]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? summaries.filter((v) => v.name.toLowerCase().includes(q)) : summaries;
  }, [summaries, query]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort(
      (a, b) => SORT_COMPARE[sortKey](a, b) * dir || a.name.localeCompare(b.name)
    );
  }, [filtered, sortKey, sortAsc]);

  const chooseSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(SORT_DEFAULT_ASC[key]);
    }
  };

  const multiProjectCount = summaries.filter((v) => v.projectCount > 1).length;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <section id="vendors-view" className="bg-white border border-slate-200 rounded-lg shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 font-display tracking-tight">Vendors</h2>
          <p className="text-[11px] text-slate-500">
            {summaries.length} compan{summaries.length === 1 ? "y" : "ies"} across every project
            {multiProjectCount > 0 && ` · ${multiProjectCount} on more than one`}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors..."
            aria-label="Search vendors"
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 pl-8 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-all shadow-xs"
          />
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-slate-50/40">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mr-0.5">Sort</span>
        {([
          { key: "attention", label: "Attention" },
          { key: "name", label: "Name" },
          { key: "projects", label: "Projects" },
        ] as const).map((s) => {
          const active = sortKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => chooseSort(s.key)}
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {s.label}
              {active && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            {summaries.length === 0 ? "No vendors enrolled yet." : "No vendors match your search."}
          </div>
        ) : (
          sorted.map((vendor) => {
            const isOpen = expanded.has(vendor.key);
            return (
              <div key={vendor.key} className="px-4">
                {/* Vendor summary row */}
                <button
                  type="button"
                  onClick={() => toggle(vendor.key)}
                  className="w-full flex items-center gap-3 py-3 text-left cursor-pointer group"
                >
                  <ChevronRight className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {vendor.name}
                      </span>
                      {vendor.vendorType === "Supplier" ? (
                        <span className="px-1.5 py-0.5 rounded border font-medium bg-slate-100 text-slate-700 border-slate-200 text-[9px] shrink-0">
                          Supplier
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-100 text-[9px] shrink-0">
                          Subcontractor
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-0.5 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3 text-slate-400" />
                        {vendor.projectCount} project{vendor.projectCount === 1 ? "" : "s"}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono tabular-nums">{formatUSD(vendor.totalContractValue)}</span>
                      {vendor.earliestExpiration && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className={`font-mono ${expirationClass(vendor.earliestExpiration, evalDate)}`}>
                            next exp {vendor.earliestExpiration}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={vendor.worstStatus} />
                  </div>
                </button>

                {/* Expanded per-project breakdown */}
                {isOpen && (
                  <div className="pb-3 pl-11 pr-1">
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-[9px] text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/75">
                            <th className="py-2 px-3">Project</th>
                            <th className="py-2 px-3">Trade</th>
                            <th className="py-2 px-3 text-right">Contract</th>
                            <th className="py-2 px-3 text-center">COI Expiration</th>
                            <th className="py-2 px-3 text-center">Status</th>
                            <th className="py-2 px-3 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                          {vendor.entries.map((e) => (
                            <tr key={e.subId} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-800 truncate max-w-[180px]">{e.projectName}</div>
                                <div className="text-[10px] font-mono text-blue-600">{e.projectNumber}</div>
                              </td>
                              <td className="py-2 px-3 text-[10px] text-slate-500">{e.trade}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                {formatUSD(e.contractValue)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`font-mono text-[11px] ${expirationClass(e.coiExpiration, evalDate)}`}>
                                  {e.coiExpiration || "No COI"}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <StatusBadge status={e.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => onOpenProject(e.projectId)}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                  title={`Open ${e.projectName}`}
                                >
                                  Open <ArrowRight className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
