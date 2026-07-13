import { useState } from "react";
import { ShieldAlert, Clock, TrendingDown, FileX, Upload, ArrowRight, CheckCircle2 } from "lucide-react";
import { Project, Subcontractor, CoiRecord } from "../types";

// Reference "today" — kept in sync with the date the compliance engine evaluates against.
const REF_DATE = "2026-06-11";

type Kind = "expired" | "insufficient" | "expiring" | "missing";

interface AttentionItem {
  sub: Subcontractor;
  projectId: string;
  projectName: string;
  kind: Kind;
  detail: string;
}

interface NeedsAttentionProps {
  projects: Project[];
  subcontractors: Subcontractor[];
  coiMap: Record<string, CoiRecord>;
  onOpenProject: (projectId: string) => void;
  onUpload: (projectId: string, sub: Subcontractor) => void;
}

const KIND_META: Record<Kind, { badge: string; icon: typeof ShieldAlert }> = {
  expired: { badge: "text-red-800 bg-red-50 border-red-200/80", icon: ShieldAlert },
  insufficient: { badge: "text-amber-800 bg-amber-50 border-amber-200/80", icon: TrendingDown },
  expiring: { badge: "text-amber-800 bg-amber-50 border-amber-200/80", icon: Clock },
  missing: { badge: "text-slate-600 bg-slate-50 border-slate-200", icon: FileX },
};

const ORDER: Kind[] = ["expired", "insufficient", "expiring", "missing"];

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - new Date(REF_DATE).getTime()) / (1000 * 60 * 60 * 24));
}

export default function NeedsAttention({ projects, subcontractors, coiMap, onOpenProject, onUpload }: NeedsAttentionProps) {
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const projName = (id: string) => projects.find((p) => p.id === id)?.name || "—";
  const warnDaysOf = (id: string) => projects.find((p) => p.id === id)?.requirements?.warn_days_out ?? 30;

  const items: AttentionItem[] = [];
  for (const sub of subcontractors) {
    const coi = coiMap[sub.id];
    const pid = sub.project_id;
    const base = { sub, projectId: pid, projectName: projName(pid) };
    if (sub.compliance_status === "Expired") {
      const exp = coi?.policy_expiration_date_extracted;
      items.push({ ...base, kind: "expired", detail: exp ? `Expired ${exp}` : "Policy expired" });
    } else if (sub.compliance_status === "Insufficient Coverage") {
      const err = coi?.validation_errors?.find((e) => !e.includes("risk grace threshold") && !e.includes("Verify the endorsement"));
      items.push({ ...base, kind: "insufficient", detail: err ? err.replace(/\s*\(.*$/, "").slice(0, 72) : "Coverage below required limits" });
    } else if (sub.compliance_status === "Pending Upload") {
      items.push({ ...base, kind: "missing", detail: "No certificate uploaded yet" });
    } else if (sub.compliance_status === "Compliant") {
      const exp = coi?.policy_expiration_date_extracted;
      if (exp) {
        const days = daysUntil(exp);
        if (days > 0 && days <= warnDaysOf(pid)) {
          items.push({ ...base, kind: "expiring", detail: `Expires in ${days} day${days === 1 ? "" : "s"}` });
        }
      }
    }
  }

  const countOf = (k: Kind) => items.filter((i) => i.kind === k).length;
  const visible = (filter === "all" ? items : items.filter((i) => i.kind === filter))
    .slice()
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  const chip = (key: "all" | Kind, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
        filter === key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label} {n}
    </button>
  );

  return (
    <section id="needs-attention" className="bg-white border border-slate-200 rounded-lg shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 font-display tracking-tight">Needs attention</h2>
          <p className="text-[11px] text-slate-500">Across every project</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("all", "All", items.length)}
          {chip("expiring", "Expiring", countOf("expiring"))}
          {chip("expired", "Expired", countOf("expired"))}
          {chip("insufficient", "Insufficient", countOf("insufficient"))}
          {chip("missing", "No COI", countOf("missing"))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
          <p className="text-sm font-semibold text-slate-700">All clear</p>
          <p className="text-xs text-slate-500 mt-0.5">No subcontractors need attention right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((it) => {
            const meta = KIND_META[it.kind];
            const Icon = meta.icon;
            return (
              <div key={it.sub.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{it.sub.company_name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {it.projectName} · {it.sub.trade}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.badge}`}>
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[180px]">{it.detail}</span>
                </span>
                {it.kind === "missing" ? (
                  <button
                    type="button"
                    onClick={() => onUpload(it.projectId, it.sub)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <Upload className="h-3 w-3" /> Upload
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenProject(it.projectId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  >
                    Review <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
