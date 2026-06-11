import React, { useState } from "react";
import { 
  X, 
  Settings, 
  FileText, 
  UserCheck, 
  Printer, 
  HelpCircle,
  Briefcase,
  Layers,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "parsing" | "exclusions" | "exporting">("projects");

  if (!isOpen) return null;

  const tabs = [
    {
      id: "projects",
      label: "1. Project Setup",
      description: "Spinning up project parameters and active thresholds",
      icon: Briefcase
    },
    {
      id: "parsing",
      label: "2. Certificate Parsing",
      description: "Automated analysis of ACORD 25 templates",
      icon: FileText
    },
    {
      id: "exclusions",
      label: "3. Exceptions & Overrides",
      description: "Handling policy exclusions and custom exceptions",
      icon: UserCheck
    },
    {
      id: "exporting",
      label: "4. Report Exporting",
      description: "Printing and downloading corporate ledgers",
      icon: Printer
    }
  ] as const;

  return (
    <div 
      id="user-guide-backdrop" 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 md:p-6 transition-all duration-250 animate-fade-in"
    >
      <div 
        id="user-guide-modal-container"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
      >
        {/* Banner/Header */}
        <div id="user-guide-banner-header" className="p-5 bg-linear-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between relative">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <HelpCircle className="h-5.5 w-5.5 text-blue-100" />
            </div>
            <div>
              <span className="text-[10px] bg-blue-500/30 text-blue-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-blue-400/20">
                Staff Knowledge Base
              </span>
              <h2 id="user-guide-modal-title" className="text-base font-bold font-display tracking-tight mt-0.5">
                ShieldCOI Operations Manual & Step-by-Step Guide
              </h2>
            </div>
          </div>
          <button
            id="user-guide-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 text-white transition-all cursor-pointer"
            aria-label="Close Operations Guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection Row */}
        <div id="user-guide-tab-selection-row" className="bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`user-guide-tab-trigger-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`p-3 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                  isActive 
                    ? "bg-white text-blue-600 font-bold" 
                    : "text-slate-600 hover:bg-slate-100/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                  <span className="text-xs font-bold tracking-tight">{tab.label}</span>
                </div>
                <span className="text-[9px] text-slate-400 mt-1 font-medium leading-tight">
                  {tab.description}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Pane */}
        <div id="user-guide-content-scrollpane" className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 space-y-6">
          
          {activeTab === "projects" && (
            <div id="user-guide-step-projects" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Step 1: Spinning Up Project Parameters & Thresholds
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Before evaluating any Certificates of Insurance, operators must define the exact contract risk parameters. Each project maintains its own isolated liability requirements to protect the corporation from tier-2 litigation exposure.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div id="projects-guide-card-1" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center">
                    <span className="h-4.5 w-4.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold flex items-center justify-center mr-1.5 shrink-0">1</span>
                    Initiate Project Spec Form
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Click the <strong className="text-blue-600">+ New Project</strong> button in the left directory pane. Supply the Project Name, a unique identification job number, and a target project completion limit date.
                  </p>
                </div>

                <div id="projects-guide-card-2" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center">
                    <span className="h-4.5 w-4.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold flex items-center justify-center mr-1.5 shrink-0">2</span>
                    Input Required Insurance Policy Minimums
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Set limits for General Liability ($1M standard minimum), Automobile Liability Combined limits, and whether compliance with State statutory Workers' Compensation limits is required.
                  </p>
                </div>

                <div id="projects-guide-card-3" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center">
                    <span className="h-4.5 w-4.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold flex items-center justify-center mr-1.5 shrink-0">3</span>
                    Establish Notification Rules
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Define the <strong className="text-slate-700 font-medium">Expiration Alert Days Warning Buffer</strong> (e.g. 30, 60 or 90 days out). This ensures automated flags are generated when policy years approach renewal.
                  </p>
                </div>

                <div id="projects-guide-card-4" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center">
                    <span className="h-4.5 w-4.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold flex items-center justify-center mr-1.5 shrink-0">4</span>
                    Enroll Active Subcontractors
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Select your active project, click <strong className="text-blue-600">Add Subcontractor</strong>, enroll the specific trade package (e.g. Concrete, Earthwork, Roofing), and enter their assigned contract value.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "parsing" && (
            <div id="user-guide-step-parsing" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Step 2: Dropping in ACORD 25 Certificates for Automated Parsing
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ShieldCOI leverages standard multi-page intelligent visual mapping engines to ingest ACORD 25 Certificate PDFs and images. No manual keying of insurance data fields is necessary.
              </p>

              <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3.5">
                <h4 className="text-xs font-bold text-blue-800 flex items-center">
                  <Layers className="h-4 w-4 mr-1.5 text-blue-600" />
                  Operator Upload & Analysis Workflow:
                </h4>
                <ol className="list-decimal list-inside text-xs text-slate-700 space-y-2 pl-1 leading-relaxed">
                  <li>
                    Select the target subcontractor in the active project table and click the <strong className="text-blue-600">Upload COI</strong> or <strong className="text-blue-600">Re-Scan COI</strong> button.
                  </li>
                  <li>
                    A dedicated, secure <strong className="text-slate-800">CoiUploadZone</strong> will slide into view at the bottom of the workspace panels.
                  </li>
                  <li>
                    <strong>Drag and drop</strong> the subcontractor's ACORD PDF into the zone, or click to find the document file locally.
                  </li>
                  <li>
                    The multi-modal scanning engine automatically identifies key features:
                    <ul className="list-disc list-inside text-[11px] text-slate-500 pl-4 mt-1 space-y-1">
                      <li>Insured Name matching subcontractor registered details</li>
                      <li>Policy Effective & Expiration limits and dates</li>
                      <li>General liability Occurrence & Aggregate coverage</li>
                      <li>Auto Combined limits & Workers' Comp checkboxes</li>
                    </ul>
                  </li>
                  <li>
                    A split-screen **Review Drawer** automatically opens showing side-by-side matches. Review the extracted data values, edit any values that need tweaking, and save the audit record!
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === "exclusions" && (
            <div id="user-guide-step-exclusions" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Step 3: Handling Policy Exclusions & Manual Exception Overrides
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Real-world project scopes do not always fit strict automated thresholds. When a subcontractor has minor policy gaps or exclusions (e.g. small contract values or non-hazardous scopes), team leaders can grant justified, auditable exceptions.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div id="exclusions-card-1" className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-indigo-700 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-indigo-600" />
                    How to Activate an Exception Override
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    In the side-by-side Audit Review drawer, toggle the **"Manual Exception Override"** option to active. This tells the system database to bypass standard minimum requirements check constraints.
                  </p>
                </div>

                <div id="exclusions-card-2" className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-slate-700">
                    Mandatory Audit Requirements
                  </h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    To prevent audits from failing corporate compliance, the system requires the operator to supply:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-slate-500 mt-1 space-y-1.5 pl-1.5">
                    <li>
                      <strong>Waiver Reason Type</strong>: Let's pick from Low Contract Value, Low-Risk Scope, Executive Discretion, or Temporary Extension.
                    </li>
                    <li>
                      <strong>Authorized Officer</strong>: Name of the regional executive authorizing the deviation.
                    </li>
                    <li>
                      <strong>Justification Notes</strong>: Detailed reason backing the override.
                    </li>
                  </ul>
                </div>
              </div>

              <div id="waiver-info-callout" className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-lg text-xs text-indigo-900 leading-relaxed">
                <strong>💡 Pro-Tip</strong>: Approved exceptions display a highly visible <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold px-1 rounded text-[10px]">Waiver Active</span> tag directly in the project directory matrix. Hovering over the subcontractor status badges reveals full auditable notes and authorization.
              </div>
            </div>
          )}

          {activeTab === "exporting" && (
            <div id="user-guide-step-exporting" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <Printer className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Step 4: Exporting Printable Corporate Compliance Ledgers
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ShieldCOI facilitates easy external stakeholders hand-off. You can easily generate and export printable executive compliance files, as well as offline analysis spreadsheets.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div id="exporting-guide-card-csv" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-800">Export Offline Excel & CSV</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Select your active project, and click <strong className="text-slate-700">Download CSV</strong> on the top-right toolbar. This automatically downloads a tailored, raw matrix containing all active trade subcontractor policy details, contract sums, status logs, and active exceptions.
                  </p>
                </div>

                <div id="exporting-guide-card-print" className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center space-x-2">
                    <Printer className="h-4.5 w-4.5 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-800">Print Professional PDF Reports</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Click the <strong className="text-slate-700">Print Report</strong> toolbar button. The system triggers a print stylesheet, temporarily hiding navigation bars and sidebar buttons. This yields a formatted, clean, letterhead compliance ledger page ready for PDF print saving.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div id="user-guide-modal-footer" className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            For operational system compliance support, contact your project's regional admin.
          </p>
          <button
            id="user-guide-footer-close-btn"
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs hover:shadow-sm cursor-pointer transition-all"
          >
            Acknowledge & Close Guide
          </button>
        </div>

      </div>
    </div>
  );
}
