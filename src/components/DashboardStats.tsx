import { ShieldAlert, Folder, Percent, CheckCircle2 } from "lucide-react";
import { Project, Subcontractor } from "../types";

interface DashboardStatsProps {
  projects: Project[];
  subcontractors: Subcontractor[];
}

export default function DashboardStats({ projects, subcontractors }: DashboardStatsProps) {
  const totalProjects = projects.length;
  const totalSubs = subcontractors.length;

  // Calculate compliance rate
  const compliantCount = subcontractors.filter(
    (s) => s.compliance_status === "Compliant" || s.manual_override === true
  ).length;

  const complianceRate = totalSubs > 0 ? Math.round((compliantCount / totalSubs) * 100) : 100;

  // Flagged/Expired subcontractors
  const flaggedCount = subcontractors.filter(
    (s) => s.compliance_status === "Expired" || s.compliance_status === "Insufficient Coverage"
  ).length;

  return (
    <div id="stats-dashboard-grid" className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
      {/* 1. Projects Count */}
      <div id="stat-card-projects" className="bg-white border border-slate-200 p-4 rounded-lg shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
            Active Projects
          </span>
          <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            {totalProjects}
          </p>
          <span className="text-[10px] text-slate-400 block font-medium">Active construction projects</span>
        </div>
        <div className="h-8 w-8 rounded bg-blue-50 flex items-center justify-center border border-blue-100">
          <Folder className="h-4.5 w-4.5 text-blue-600" />
        </div>
      </div>

      {/* 2. Subcontractors Count */}
      <div id="stat-card-total-vendors" className="bg-white border border-slate-200 p-4 rounded-lg shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
            Total Subcontractors
          </span>
          <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            {totalSubs}
          </p>
          <span className="text-[10px] text-slate-400 block font-medium">Registered trade vendors</span>
        </div>
        <div className="h-8 w-8 rounded bg-indigo-50 flex items-center justify-center border border-indigo-100">
          <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
        </div>
      </div>

      {/* 3. Compliance Health Rate */}
      <div id="stat-card-compliance-rate" className="bg-white border border-slate-200 p-4 rounded-lg shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
            Compliance Rate
          </span>
          <div className="flex items-baseline space-x-1">
            <p className="text-2xl font-display font-bold text-emerald-600 tracking-tight">
              {complianceRate}%
            </p>
          </div>
          <span className="text-[10px] text-slate-400 block font-medium">Target benchmark: 100%</span>
        </div>
        <div className="h-8 w-8 rounded bg-emerald-50 flex items-center justify-center border border-emerald-100">
          <Percent className="h-4.5 w-4.5 text-emerald-600" />
        </div>
      </div>

      {/* 4. Flagged Breaches */}
      <div id="stat-card-breaches" className="bg-white border border-slate-200 p-4 rounded-lg shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
            Flagged Breaches
          </span>
          <p className={`text-2xl font-display font-bold tracking-tight ${flaggedCount > 0 ? "text-red-600" : "text-slate-400"}`}>
            {flaggedCount}
          </p>
          <span className="text-[10px] text-slate-400 block font-medium">Urgent policy updates required</span>
        </div>
        <div className={`h-8 w-8 rounded flex items-center justify-center border ${
          flaggedCount > 0 
            ? "bg-red-50 border-red-200 text-red-600 animate-pulse" 
            : "bg-slate-50 border-slate-200 text-slate-440 text-slate-400"
        }`}>
          <ShieldAlert className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}
