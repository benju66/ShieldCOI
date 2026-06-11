import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FolderOpen,
  Calendar,
  DollarSign,
  Briefcase,
  Layers,
  ArrowRight,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  FileBadge,
  Sparkles,
  Info,
  Database,
  Mail,
  ChevronRight,
  Sliders,
  ChevronLeft
} from "lucide-react";

import {
  getProjects,
  createProject,
  getSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  submitCoiRecord,
  getNotifications,
  seedInitialData
} from "./dbService";

import { Project, Subcontractor, Notification } from "./types";
import DashboardStats from "./components/DashboardStats";
import ProjectForm from "./components/ProjectForm";
import SubcontractorModal from "./components/SubcontractorModal";
import CoiUploadZone from "./components/CoiUploadZone";
import VerificationDrawer from "./components/VerificationDrawer";
import NotificationList from "./components/NotificationList";

export default function App() {
  // DB States
  const [projects, setProjects] = useState<Project[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<Subcontractor[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // UI States
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // Modals state
  const [isProjModalOpen, setIsProjModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [activeSubForUpload, setActiveSubForUpload] = useState<Subcontractor | null>(null);

  // Scanning facts to share with Drawer
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scannedPayload, setScannedPayload] = useState<{
    insured_name: string;
    gl_each_occurrence: number;
    gl_general_aggregate: number;
    auto_combined_single_limit: number;
    workers_comp_statutory: boolean;
    policy_expiration_date: string;
    file_name: string;
    simulated: boolean;
    warning?: string;
  } | null>(null);

  const loadAllData = async (resetSelected = false) => {
    try {
      const projs = await getProjects();
      setProjects(projs);

      const alerts = await getNotifications();
      setNotifications(alerts);

      // Accumulate subcontractors
      const results: Subcontractor[] = [];
      for (const p of projs) {
        const subs = await getSubcontractors(p.id);
        results.push(...subs);
      }
      setAllSubcontractors(results);

      if (resetSelected) {
        setSelectedProject(null);
        setActiveSubForUpload(null);
        setScannedPayload(null);
      } else if (selectedProject) {
        // Refresh active project instance
        const match = projs.find((p) => p.id === selectedProject.id);
        if (match) setSelectedProject(match);
      }
    } catch (err) {
      console.error("Error gathering snapshot values:", err);
    } finally {
      setPageLoading(false);
    }
  };

  // Seeding trigger
  const runDurableSeeding = async (force = false) => {
    setIsSeeding(true);
    try {
      await seedInitialData(force);
      await loadAllData(true);
    } catch (error) {
      alert("Failed to initialize system default data.");
    } finally {
      setIsSeeding(false);
    }
  };

  // Initial load
  useEffect(() => {
    async function boot() {
      // Seed if first time
      await seedInitialData(false);
      await loadAllData();
    }
    boot();
  }, []);

  // Filter projects by searchQuery
  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Subcontractors belonging to active project detail
  const activeSubs = allSubcontractors.filter((s) => s.project_id === selectedProject?.id);

  // Status computation for individual projects
  // Green = All Subs Compliant, Orange = Missing/Expired (or Pending Upload), Red = Active Infraction (Expired / Insufficient)
  const getProjectStatus = (projId: string) => {
    const subs = allSubcontractors.filter((s) => s.project_id === projId);
    if (subs.length === 0) return { label: "Fully Compliant", color: "text-emerald-450 bg-emerald-500/10 border-emerald-500/20" };

    const hasExpired = subs.some((s) => s.compliance_status === "Expired");
    const hasInsufficient = subs.some((s) => s.compliance_status === "Insufficient Coverage");
    const hasPending = subs.some((s) => s.compliance_status === "Pending Upload");

    if (hasExpired) {
      return { label: "Active Expirations", color: "text-red-400 bg-red-500/10 border-red-500/20" };
    }
    if (hasInsufficient || hasPending) {
      return { label: "Action Needed", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    }
    return { label: "Fully Compliant", color: "text-emerald-400 bg-emerald-500/10 border-emerald-550/20" };
  };

  // Create Project handler
  const handleCreateProject = async (projectData: Omit<Project, "id" | "createdAt">) => {
    await createProject(projectData);
    await loadAllData();
  };

  // Enrolling a subcontractor
  const handleAddSubcontractor = async (companyName: string, trade: string, contractValue: number) => {
    if (!selectedProject) return;
    await createSubcontractor(selectedProject.id, {
      company_name: companyName,
      trade,
      contract_value: contractValue,
    });
    await loadAllData();
  };

  // Submit COI scanned items from Drag-and-Drop or sample selector
  const handleScanFinished = async (extracted: any) => {
    if (!activeSubForUpload || !selectedProject) return;
    setScannedPayload(extracted);
    setIsScanningActive(false);
  };

  // Save reviewed scanned elements from matrix drawer
  const handleAuditSave = async (
    manualOverride: boolean,
    notes: string,
    status: "Compliant" | "Insufficient Coverage" | "Expired"
  ) => {
    if (!selectedProject || !activeSubForUpload || !scannedPayload) return;

    // 1. Submit COI record
    await submitCoiRecord(selectedProject.id, activeSubForUpload.id, {
      file_name: scannedPayload.file_name,
      insured_extracted_name: scannedPayload.insured_name,
      gl_occurrence_extracted: scannedPayload.gl_each_occurrence,
      gl_aggregate_extracted: scannedPayload.gl_general_aggregate,
      auto_combined_single_limit_extracted: scannedPayload.auto_combined_single_limit,
      workers_comp_statutory_extracted: scannedPayload.workers_comp_statutory,
      policy_expiration_date_extracted: scannedPayload.policy_expiration_date,
    });

    // 2. Commit override state if chosen
    if (manualOverride) {
      await updateSubcontractor(selectedProject.id, activeSubForUpload.id, {
        manual_override: true,
        compliance_status: "Compliant",
        override_notes: notes,
      });
    } else {
      await updateSubcontractor(selectedProject.id, activeSubForUpload.id, {
        manual_override: false,
        override_notes: "",
      });
    }

    // 3. Reset workflow states
    setActiveSubForUpload(null);
    setScannedPayload(null);
    await loadAllData();
  };

  if (pageLoading && projects.length === 0) {
    return (
      <div id="boot-loader-layer" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-4" />
        <h3 className="text-sm font-semibold tracking-wide text-slate-800">ShieldCOI: Booting Compliance Ledger Database...</h3>
        <span className="text-xs text-slate-500 mt-1">Initializing Firestore secure client instances & verification rules</span>
      </div>
    );
  }

  return (
    <div id="shieldcoi-app-canvas" className="min-h-screen bg-slate-50 font-sans text-slate-850 flex flex-col selection:bg-blue-500/20 selection:text-blue-900 antialiased">
      
      {/* 1. Header Navigation Bar */}
      <header id="app-header" className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 id="brand-title" className="text-sm font-bold text-slate-900 font-display tracking-tight flex items-center space-x-1">
              <span className="text-blue-600 font-black tracking-wider uppercase">Shield</span>
              <span className="text-slate-800 uppercase tracking-wide">COI</span>
            </h1>
            <p className="text-[10px] text-slate-500 tracking-normal font-medium">
              Project-Level Insurance Compliance Manager
            </p>
          </div>
        </div>

        {/* Database controllers & Auth simulation */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => runDurableSeeding(true)}
            id="seed-database-button"
            disabled={isSeeding}
            type="button"
            className="flex items-center space-x-1 px-2.5 py-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-md text-[11px] shadow-xs cursor-pointer transition-all disabled:opacity-50"
          >
            <Database className="h-3 w-3 text-slate-400" />
            <span>{isSeeding ? "Resetting..." : "Reset Mock Data"}</span>
          </button>

          <div id="authenticated-admin-panel" className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md flex items-center space-x-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-500 text-[10px] font-semibold uppercase">Advisor:</span>
            <strong className="text-slate-800 font-medium truncate max-w-[120px]" title="benj.urness@gmail.com">
              benj.urness@gmail.com
            </strong>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Layout Area */}
      <main id="app-viewport-pane" className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col h-full lg:overflow-hidden">
        
        {/* Dynamic high level stats header */}
        <DashboardStats projects={projects} subcontractors={allSubcontractors} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start">
          
          {/* Left Column Section: Projects Index Directory */}
          <section id="projects-index-section" className="col-span-1 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Active Projects
              </span>
              <button
                onClick={() => setIsProjModalOpen(true)}
                id="initiate-create-project-trigger"
                type="button"
                className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 py-1 rounded-md text-[11px] cursor-pointer shadow-xs transition-all tracking-wide"
              >
                <Plus className="h-3 stroke-[2.5px] w-3" />
                <span>New Project</span>
              </button>
            </div>

            {/* Keyword filter block */}
            <div id="search-input-wrapper" className="mt-3 relative">
              <input
                type="text"
                value={searchQuery}
                aria-label="Search Projects"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 pl-8 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-all shadow-xs"
              />
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>

            {/* Project List */}
            <div id="project-directory-list" className="mt-3.5 space-y-2 overflow-y-auto max-h-[380px] pr-1">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-xs">No active projects matching filter query.</p>
                </div>
              ) : (
                filteredProjects.map((p) => {
                  const numContractors = allSubcontractors.filter((s) => s.project_id === p.id).length;
                  const statusInfo = getProjectStatus(p.id);
                  const isSelected = selectedProject?.id === p.id;

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProject(p);
                        setActiveSubForUpload(null);
                        setScannedPayload(null);
                      }}
                      type="button"
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex flex-col justify-start relative group cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/75 border-blue-500 shadow-xs ring-1 ring-blue-200"
                          : "bg-white hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex justify-between items-center w-full gap-2">
                        <span className="text-[10px] font-mono font-bold text-blue-600">
                          {p.number}
                        </span>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 tracking-tight mt-1 group-hover:text-blue-600 transition-colors font-display line-clamp-1">
                        {p.name}
                      </h4>

                      <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                        <span className="flex items-center">
                          <Layers className="h-3 w-3 mr-1 text-slate-400" />
                          {numContractors} Trade Vendor{numContractors !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1 text-slate-400" />
                          {p.target_completion_date}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Column Section: Primary Detail Workspace */}
          <section id="primary-detail-workspace" className="col-span-1 lg:col-span-8 flex flex-col space-y-5">
            
            {/* Conditional Sub-View Workspace */}
            {selectedProject ? (
              <div id="project-details-active-view" className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
                
                {/* 1. Detail Header */}
                <div id="active-project-infobar" className="flex flex-col md:flex-row md:items-center justify-between pb-3.5 border-b border-slate-100 gap-4">
                  <div className="flex items-start space-x-2.5">
                    <button
                      onClick={() => setSelectedProject(null)}
                      title="Back to overall summary stats"
                      className="p-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-sm font-bold text-slate-900 tracking-tight font-display">
                          {selectedProject.name}
                        </h2>
                        <span className="text-[10px] font-mono text-blue-600 bg-blue-50/75 p-0.5 px-1.5 rounded border border-blue-200 font-bold">
                          {selectedProject.number}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Setup risk thresholds and direct subcontractor insurance audits below.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsSubModalOpen(true)}
                    id="trigger-add-vendor-button"
                    type="button"
                    className="flex items-center space-x-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer shadow-xs transition-all"
                  >
                    <Plus className="h-3 w-3 text-slate-500" />
                    <span>Add Subcontractor</span>
                  </button>
                </div>

                {/* 2. Side-by-Side configuration panel vs Enrolled subcontractors table */}
                <div id="threshold-and-vendor-grid" className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  
                  {/* Left segment - Thresholds parameters card */}
                  <div id="active-thresholds-panel" className="col-span-1 md:col-span-4 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center">
                      <Sliders className="h-3 w-3 mr-1 text-slate-400" /> Required COI Minimums
                    </span>

                    <div className="space-y-2 pt-0.5 text-[11px]">
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-semibold">
                          General Liability Occurrence Limit
                        </span>
                        <strong className="text-slate-800 font-mono">
                          ${selectedProject.requirements.gl_occurrence.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-semibold">
                          General Liability General Aggregate
                        </span>
                        <strong className="text-slate-800 font-mono">
                          ${selectedProject.requirements.gl_aggregate.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-semibold">
                          Automobile Liability Combined Single
                        </span>
                        <strong className="text-slate-800 font-mono">
                          ${selectedProject.requirements.auto_limit.toLocaleString()}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-[11px]">
                        <span className="text-slate-500">Workers Comp</span>
                        <strong className="text-slate-800 font-semibold uppercase tracking-wide text-[10px]">
                          {selectedProject.requirements.workers_comp ? "Statutory Limits" : "N/A"}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-505">Grace Notification</span>
                        <strong className="text-slate-800 text-[10px]">
                          {selectedProject.requirements.warn_days_out} Days
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Right segment - Subcontractors assigned tabular view */}
                  <div id="enrolled-vendor-table-container" className="col-span-1 md:col-span-8 overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table id="subcontractors-table" className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                          <th className="p-2.5 px-3.5">Company Name & Trade</th>
                          <th className="p-2.5 text-right">Contract Value</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                        {activeSubs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center py-8 text-slate-400 italic">
                              No subcontractor companies registered yet under this project.
                            </td>
                          </tr>
                        ) : (
                          activeSubs.map((sub) => {
                            const isSelectedForUpload = activeSubForUpload?.id === sub.id;

                            // Badges mapper
                            let badgeStyle = "text-slate-650 bg-slate-50 border-slate-250";
                            if (sub.compliance_status === "Compliant") {
                              badgeStyle = "text-emerald-800 bg-emerald-50 border-emerald-200/80";
                            } else if (sub.compliance_status === "Expired") {
                              badgeStyle = "text-red-800 bg-red-50 border-red-200/80 font-bold";
                            } else if (sub.compliance_status === "Insufficient Coverage") {
                              badgeStyle = "text-amber-800 bg-amber-50 border-amber-200/80";
                            }

                            return (
                              <tr
                                key={sub.id}
                                className={`hover:bg-slate-50 transition-colors ${
                                  isSelectedForUpload ? "bg-blue-50/50" : ""
                                }`}
                              >
                                <td className="p-2 px-3">
                                  <span className="font-semibold text-slate-905 flex items-center">
                                    {sub.company_name}
                                    {sub.manual_override && (
                                      <span
                                        title={sub.override_notes}
                                        className="ml-1.5 text-[8px] bg-purple-100 text-purple-800 border border-purple-200 px-1 rounded font-bold uppercase tracking-wide cursor-help"
                                      >
                                        Override Active
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">{sub.trade}</span>
                                </td>
                                <td className="p-2 text-right font-mono text-slate-705">
                                  ${sub.contract_value.toLocaleString()}
                                </td>
                                <td className="p-2 text-center">
                                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${badgeStyle}`}>
                                    {sub.compliance_status}
                                  </span>
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    onClick={() => {
                                      setActiveSubForUpload(sub);
                                      setScannedPayload(null);
                                    }}
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                                      isSelectedForUpload
                                        ? "bg-slate-100 text-slate-450 border border-slate-200 cursor-not-allowed"
                                        : "bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200/55"
                                    }`}
                                  >
                                    {sub.compliance_status === "Pending Upload" ? "Upload COI" : "Re-Scan COI"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Drag and drop file picker triggered conditionally when subcontractor selected for upload */}
                {activeSubForUpload && (
                  <div id="subcontractor-active-uploader-card" className="border border-slate-200 rounded-lg p-1 bg-white animate-in slide-in-from-bottom duration-200 shadow-xs">
                    <div className="flex items-center justify-between p-2 px-3 border-b border-slate-100 bg-slate-50 rounded-t-md">
                      <p className="text-xs text-slate-600">
                        Analyzing policy credentials for:{" "}
                        <strong className="text-slate-800 font-bold">{activeSubForUpload.company_name}</strong>
                      </p>
                      <button
                        onClick={() => setActiveSubForUpload(null)}
                        className="text-[10px] text-slate-505 hover:text-slate-900 cursor-pointer underline font-semibold"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="p-3">
                      <CoiUploadZone
                        onScanStart={() => {
                          setIsScanningActive(true);
                        }}
                        onScanComplete={handleScanFinished}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Default view showing notifications and global uploader overview
              <div id="dashboard-general-view" className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                
                {/* Visual Intro widget */}
                <div id="introduction-welcome-card" className="bg-white border border-slate-200 p-5 rounded-lg shadow-xs flex flex-col justify-between h-full min-h-[380px]">
                  <div className="space-y-3.5">
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block">
                      Enterprise Compliance
                    </span>
                    <h2 id="welcome-title" className="text-base font-bold text-slate-900 tracking-tight font-display">
                      Zero-Trust Construction Compliance Audits
                    </h2>
                    <p className="text-xs text-slate-550 leading-relaxed">
                      ShieldCOI mitigates downstream construction litigation by continuously auditing subcontractor Certificates of Insurance (ACORD 25 templates). 
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed font-semibold bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                      Select any active project from the list directory to run verification audits, configure policy aggregate minimums, or manually override limits via justified exceptions.
                    </p>
                  </div>

                  <div className="mt-8 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                    <div className="flex items-center space-x-1.5">
                      <Info className="h-4 w-4 text-blue-500" />
                      <span>Gemini Multimodal AI Extraction</span>
                    </div>
                    <span className="font-semibold text-slate-400">ShieldCOI v1.0</span>
                  </div>
                </div>

                {/* Notifications Log */}
                <NotificationList notifications={notifications} />
              </div>
            )}
          </section>
        </div>
      </main>

      {/* 3. Global Modal Components */}
      <ProjectForm
        isOpen={isProjModalOpen}
        onClose={() => setIsProjModalOpen(false)}
        onSave={handleCreateProject}
      />

      <SubcontractorModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        projectName={selectedProject?.name || ""}
        onAdd={handleAddSubcontractor}
      />

      {/* Split-screen sidebar compliance reviewer drawer */}
      <VerificationDrawer
        isOpen={!!selectedProject && !!activeSubForUpload && !!scannedPayload}
        onClose={() => {
          setActiveSubForUpload(null);
          setScannedPayload(null);
        }}
        project={selectedProject!}
        subContractorId={activeSubForUpload?.id || ""}
        subContractorName={activeSubForUpload?.company_name || ""}
        extractedData={scannedPayload}
        onSave={handleAuditSave}
      />
    </div>
  );
}
