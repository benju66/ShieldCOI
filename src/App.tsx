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
  Mail,
  ChevronRight,
  Sliders,
  ChevronLeft,
  Edit2,
  Trash2,
  History,
  Download,
  Printer,
  X,
  HelpCircle,
  Archive,
  ArchiveRestore
} from "lucide-react";

import UserGuideModal from "./components/UserGuideModal";
import SettingsModal from "./components/SettingsModal";

import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
  submitCoiRecord,
  getNotifications,
  seedInitialData,
  getCoiRecords
} from "./dbService";

import { Project, Subcontractor, Notification, CoiRecord } from "./types";
import DashboardStats from "./components/DashboardStats";
import NeedsAttention from "./components/NeedsAttention";
import ProjectForm from "./components/ProjectForm";
import SubcontractorModal from "./components/SubcontractorModal";
import CoiUploadZone from "./components/CoiUploadZone";
import VerificationDrawer from "./components/VerificationDrawer";
import NotificationList from "./components/NotificationList";
import VendorsView from "./components/VendorsView";
import CoiHistoryDrawer from "./components/CoiHistoryDrawer";
import { exportToCSV } from "./utils/reportExporter";
import ExecutivePrintReport from "./components/ExecutivePrintReport";
import { formatUSD } from "./utils/currency";
import { getEvaluationDate } from "./settingsService";

export default function App() {
  // DB States
  const [projects, setProjects] = useState<Project[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<Subcontractor[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeCoiMap, setActiveCoiMap] = useState<Record<string, CoiRecord>>({});

  // UI States
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<"active" | "archived" | "all">("active");
  const [pageLoading, setPageLoading] = useState(true);
  const [showWelcomeIntro, setShowWelcomeIntro] = useState<boolean>(() => {
    return localStorage.getItem("shieldcoi_show_welcome") !== "false";
  });
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // The date compliance is evaluated against (real today, or a configured override).
  const [evalDate, setEvalDate] = useState(getEvaluationDate());

  // History state
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [activeSubForHistory, setActiveSubForHistory] = useState<Subcontractor | null>(null);

  // Modals state
  const [isProjModalOpen, setIsProjModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [activeSubForUpload, setActiveSubForUpload] = useState<Subcontractor | null>(null);

  // Scanning facts to share with Drawer
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [view, setView] = useState<"home" | "projects" | "vendors">("home");
  const [scannedPayload, setScannedPayload] = useState<{
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
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    file_data?: string;
    file_mime?: string;
    field_locations?: { field: string; page?: number; box_2d: number[] }[];
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
      const coiMap: Record<string, CoiRecord> = {};
      for (const p of projs) {
        const subs = await getSubcontractors(p.id);
        results.push(...subs);

        for (const sub of subs) {
          const cois = await getCoiRecords(p.id, sub.id);
          if (cois && cois.length > 0) {
            coiMap[sub.id] = cois[0];
          }
        }
      }
      setAllSubcontractors(results);
      setActiveCoiMap(coiMap);

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
    try {
      await seedInitialData(force);
      await loadAllData(true);
    } catch (error) {
      alert("Failed to initialize system default data.");
    }
  };

  // Initial load: seed sample data (once) then hydrate the local ledger
  useEffect(() => {
    (async () => {
      setPageLoading(true);
      try {
        await seedInitialData(false);
        await loadAllData();
      } catch (error) {
        console.error("Boot seeding error: ", error);
      } finally {
        setPageLoading(false);
      }
    })();
  }, []);

  // Active vs archived split. Archived projects are hidden from dashboards, triage,
  // and vendor roll-ups — only surfaced under the Archived filter in the directory.
  const activeProjects = projects.filter((p) => !p.archived);
  const archivedCount = projects.length - activeProjects.length;
  const activeProjectIds = new Set(activeProjects.map((p) => p.id));
  const liveSubcontractors = allSubcontractors.filter((s) => activeProjectIds.has(s.project_id));

  // Projects shown in the directory: filtered by the active/archived tab, then search.
  const filteredProjects = projects
    .filter((p) => (projectFilter === "all" ? true : projectFilter === "archived" ? !!p.archived : !p.archived))
    .filter(
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

  // Save Project handler (handles both create and edit specifications)
  const handleSaveProject = async (projectData: Omit<Project, "id" | "createdAt">) => {
    if (projectToEdit) {
      await updateProject(projectToEdit.id, projectData);
    } else {
      await createProject(projectData);
    }
    await loadAllData();
  };

  // Archive / restore a project (reversible; hides it from active views)
  const handleToggleArchive = async (project: Project) => {
    await updateProject(project.id, { archived: !project.archived });
    await loadAllData();
  };

  // Enrolling a subcontractor
  const handleAddSubcontractor = async (companyName: string, trade: string, contractValue: number, vendorType: "Subcontractor" | "Supplier") => {
    if (!selectedProject) return;
    await createSubcontractor(selectedProject.id, {
      company_name: companyName,
      trade,
      contract_value: contractValue,
      vendor_type: vendorType,
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
    status: "Compliant" | "Insufficient Coverage" | "Expired" | "Approved Exception",
    waiverReasonType: "Low Contract Value" | "Low-Risk Scope" | "Executive Discretion" | "Temporary Extension" | null,
    waiverAuthorizedBy: string | null,
    waiverExpirationDate: string | null,
    updatedPayload?: any
  ) => {
    if (!selectedProject || !activeSubForUpload || !scannedPayload) return;

    const payloadToSave = updatedPayload || scannedPayload;

    // 1. Submit COI record
    await submitCoiRecord(selectedProject.id, activeSubForUpload.id, {
      file_name: payloadToSave.file_name,
      insured_extracted_name: payloadToSave.insured_name,
      gl_occurrence_extracted: payloadToSave.gl_each_occurrence,
      gl_aggregate_extracted: payloadToSave.gl_general_aggregate,
      auto_combined_single_limit_extracted: payloadToSave.auto_combined_single_limit,
      workers_comp_statutory_extracted: payloadToSave.workers_comp_statutory,
      policy_expiration_date_extracted: payloadToSave.policy_expiration_date,
      gl_products_completed_extracted: payloadToSave.gl_products_completed ?? 0,
      umbrella_limit_extracted: payloadToSave.umbrella_limit ?? 0,
      employers_liability_accident_extracted: payloadToSave.employers_liability_accident ?? 0,
      employers_liability_disease_person_extracted: payloadToSave.employers_liability_disease_person ?? 0,
      employers_liability_disease_limit_extracted: payloadToSave.employers_liability_disease_limit ?? 0,
      professional_liability_extracted: payloadToSave.professional_liability ?? 0,
      pollution_liability_extracted: payloadToSave.pollution_liability ?? 0,
      additional_insured_named_extracted: payloadToSave.additional_insured_named ?? [],
      additional_insured_blanket_extracted: payloadToSave.additional_insured_blanket ?? false,
      additional_insured_text_extracted: payloadToSave.additional_insured_text ?? "",
      gl_addl_insd_extracted: payloadToSave.gl_addl_insd ?? false,
      extraction_method: payloadToSave.extraction_method || "AI_Scan",
    });

    // 2. Commit override state if chosen
    if (manualOverride) {
      await updateSubcontractor(selectedProject.id, activeSubForUpload.id, {
        manual_override: true,
        compliance_status: "Approved Exception",
        override_notes: notes,
        waiver_reason_type: waiverReasonType,
        waiver_authorized_by: waiverAuthorizedBy,
        waiver_expiration_date: waiverExpirationDate,
      });
    } else {
      await updateSubcontractor(selectedProject.id, activeSubForUpload.id, {
        manual_override: false,
        compliance_status: status as any,
        override_notes: "",
        waiver_reason_type: null,
        waiver_authorized_by: null,
        waiver_expiration_date: null,
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
        <h3 className="text-sm font-semibold tracking-wide text-slate-800">Loading Shield COI…</h3>
        <span className="text-xs text-slate-500 mt-1">Preparing your compliance records</span>
      </div>
    );
  }

  return (
    <>
      <div id="shieldcoi-app-canvas" className="min-h-screen bg-slate-50 font-sans text-slate-850 flex flex-col selection:bg-blue-500/20 selection:text-blue-900 antialiased print:hidden">
      
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
              Certificate of insurance compliance
            </p>
          </div>
        </div>

        {/* Primary navigation */}
        <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setView("home")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${view === "home" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => setView("projects")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${view === "projects" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            Projects
          </button>
          <button
            type="button"
            onClick={() => setView("vendors")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${view === "vendors" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            Vendors
          </button>
        </nav>

        {/* Database controllers & Auth simulation */}
        <div className="flex items-center space-x-2">
          {/* User Guide Button */}
          <button
            onClick={() => setIsUserGuideOpen(true)}
            id="user-guide-toggle-button"
            type="button"
            className="flex items-center space-x-1.5 px-2.5 py-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-md text-[11px] font-semibold shadow-xs cursor-pointer transition-all"
          >
            <span>📖 User Guide & Instructions</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            id="open-settings-button"
            type="button"
            className="flex items-center space-x-1.5 px-2.5 py-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-md text-[11px] font-semibold shadow-xs cursor-pointer transition-all"
          >
            <Sliders className="h-3 w-3 text-slate-400" />
            <span>Settings</span>
          </button>

          <div id="local-mode-panel" className="bg-slate-50 border border-slate-200 pl-2 pr-2.5 py-1 rounded-md flex items-center space-x-2 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <div className="flex flex-col leading-tight">
              <span className="text-slate-500 text-[9px] font-semibold uppercase tracking-wider">Local Demo</span>
              <strong className="text-slate-800 font-medium text-[10.5px]">Saved in this browser</strong>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Layout Area */}
      <main id="app-viewport-pane" className="flex-1 w-full max-w-[1600px] mx-auto px-6 py-4 flex flex-col h-full lg:overflow-hidden">
        
        {/* Home view: portfolio KPIs + cross-project triage worklist */}
        {view === "home" && (
          <div className="space-y-4">
            <DashboardStats projects={activeProjects} subcontractors={liveSubcontractors} />
            <NeedsAttention
              projects={activeProjects}
              subcontractors={liveSubcontractors}
              coiMap={activeCoiMap}
              evalDate={evalDate}
              onOpenProject={(projId) => {
                const p = projects.find((x) => x.id === projId);
                if (p) {
                  setSelectedProject(p);
                  setActiveSubForUpload(null);
                  setScannedPayload(null);
                  setView("projects");
                }
              }}
              onUpload={(projId, sub) => {
                const p = projects.find((x) => x.id === projId);
                if (p) {
                  setSelectedProject(p);
                  setScannedPayload(null);
                  setActiveSubForUpload(sub);
                  setView("projects");
                }
              }}
            />
          </div>
        )}

        {/* Projects view: project list + selected-project detail */}
        {view === "projects" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start">
          
          {/* Left Column Section: Projects Index Directory */}
          <section id="projects-index-section" className="col-span-1 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Projects
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

            {/* Active / archived filter */}
            <div id="project-status-filter" className="mt-2.5 flex items-center gap-1">
              {([
                { key: "active", label: "Active", count: activeProjects.length },
                { key: "archived", label: "Archived", count: archivedCount },
                { key: "all", label: "All", count: projects.length },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setProjectFilter(f.key)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                    projectFilter === f.key
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f.label} {f.count}
                </button>
              ))}
            </div>

            {/* Project List */}
            <div id="project-directory-list" className="mt-3.5 space-y-2 overflow-y-auto max-h-[380px] pr-1">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-xs">
                    {projectFilter === "archived" ? "No archived projects." : "No projects match your filter."}
                  </p>
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
                        {p.archived ? (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 flex items-center gap-1">
                            <Archive className="h-2.5 w-2.5" /> Archived
                          </span>
                        ) : (
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 tracking-tight mt-1 group-hover:text-blue-600 transition-colors font-display line-clamp-1">
                        {p.name}
                      </h4>

                      <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                        <span className="flex items-center">
                          <Layers className="h-3 w-3 mr-1 text-slate-400" />
                          {numContractors} Subcontractor{numContractors !== 1 ? "s" : ""}
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

                {selectedProject.archived && (
                  <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px] text-amber-800">
                      <Archive className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-semibold">Archived — hidden from dashboards, triage, and vendor roll-ups.</span>
                    </div>
                    <button
                      onClick={() => handleToggleArchive(selectedProject)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-md text-[10px] font-bold cursor-pointer shrink-0"
                    >
                      <ArchiveRestore className="h-3 w-3" /> Restore
                    </button>
                  </div>
                )}

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
                        
                        {/* Control buttons */}
                        <div className="flex items-center space-x-1.5 ml-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setProjectToEdit(selectedProject);
                              setIsProjModalOpen(true);
                            }}
                            title="Edit Project Specifications"
                            className="p-1 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-500 hover:text-blue-600 cursor-pointer transition-all flex items-center justify-center"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleToggleArchive(selectedProject)}
                            title={selectedProject.archived ? "Restore project to active" : "Archive project"}
                            className="p-1 rounded bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-500 hover:text-amber-600 cursor-pointer transition-all flex items-center justify-center"
                          >
                            {selectedProject.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={async () => {
                              const confirmText = `Warning: This action will permanently delete this project along with all registered subcontractors and scanned COI records. This cannot be undone. Type the project number to confirm.`;
                              const input = window.prompt(confirmText);
                              if (input === selectedProject.number) {
                                try {
                                  await deleteProject(selectedProject.id);
                                  setSelectedProject(null);
                                  await loadAllData(true);
                                } catch (error) {
                                  console.error(error);
                                  alert("An error occurred during project database execution.");
                                }
                              } else if (input !== null) {
                                alert("Verification match mismatch. Deletion aborted.");
                              }
                            }}
                            title="Delete Project Specifications"
                            className="p-1 rounded bg-slate-55 hover:bg-red-50 border border-slate-200 hover:border-red-350 text-red-500 hover:text-red-700 cursor-pointer transition-all flex items-center justify-center font-bold"
                          >
                            <Trash2 className="h-3 w-3 text-red-650" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Review each subcontractor's certificate against the project requirements.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2 shrink-0">
                    <button
                      onClick={() => exportToCSV(selectedProject.name, selectedProject.number, activeSubs)}
                      id="download-csv-button"
                      type="button"
                      className="flex items-center space-x-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer shadow-xs transition-all"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>Download CSV</span>
                    </button>

                    <button
                      onClick={() => window.print()}
                      id="print-report-button"
                      type="button"
                      className="flex items-center space-x-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer shadow-xs transition-all"
                    >
                      <Printer className="h-3.5 w-3.5 text-slate-500" />
                      <span>Print Report</span>
                    </button>

                    <button
                      onClick={() => setIsSubModalOpen(true)}
                      id="trigger-add-vendor-button"
                      type="button"
                      className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-750 text-white px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer shadow-xs transition-all"
                    >
                      <Plus className="h-3 w-3 text-white" />
                      <span>Add Subcontractor</span>
                    </button>
                  </div>
                </div>

                {/* 2. Side-by-Side configuration panel vs Enrolled subcontractors table */}
                <div id="threshold-and-vendor-grid" className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  
                  {/* Subcontractor compliance table (full width) — insurance requirements are edited via the pencil in the header */}
                  <div id="enrolled-vendor-table-container" className="col-span-1 md:col-span-12 overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table id="subcontractors-table" className="w-full text-left border-collapse table-auto">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/75">
                          <th className="py-2.5 px-3 md:px-4">Company Name & Trade</th>
                          <th className="py-2.5 px-3 md:px-4 text-right">Contract Value</th>
                          <th className="py-2.5 px-3 md:px-4 text-center">Status</th>
                          <th className="py-2.5 px-3 md:px-4 text-center">COI Expiration</th>
                          <th className="py-2.5 px-3 md:px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                        {activeSubs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400 italic">
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
                            } else if (sub.compliance_status === "Approved Exception") {
                              badgeStyle = "text-indigo-800 bg-indigo-50 border-indigo-200/80 font-bold";
                            }

                            return (
                              <tr
                                key={sub.id}
                                className={`hover:bg-slate-50/50 transition-colors ${
                                  isSelectedForUpload ? "bg-blue-50/50" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 md:px-4 animate-in fade-in duration-100">
                                  <div className="flex flex-col">
                                    <div className="font-semibold text-slate-905 flex items-center flex-wrap gap-y-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveSubForHistory(sub);
                                          setHistoryDrawerOpen(true);
                                        }}
                                        className="font-semibold text-slate-905 hover:text-blue-600 transition-colors text-left focus:outline-none hover:underline cursor-pointer"
                                        title="Click to view full COI history"
                                      >
                                        {sub.company_name}
                                      </button>
                                      {sub.vendor_type === "Supplier" ? (
                                        <span className="ml-1.5 px-1.5 py-0.5 rounded border font-medium select-none bg-slate-100 text-slate-700 border-slate-200 text-[10px] shrink-0">
                                          Supplier
                                        </span>
                                      ) : (
                                        <span className="ml-1.5 px-1.5 py-0.5 rounded border font-medium select-none bg-blue-50 text-blue-700 border-blue-100 text-[10px] shrink-0">
                                          Subcontractor
                                        </span>
                                      )}
                                      {sub.manual_override && (
                                        <span
                                          title={sub.override_notes}
                                          className="ml-1.5 text-[8px] bg-indigo-100 text-indigo-800 border border-indigo-250 px-1.5 rounded font-bold uppercase tracking-wide cursor-help shrink-0"
                                        >
                                          Waiver Active
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-1.5 mt-0.5">
                                      <span className="text-[10px] text-slate-400">{sub.trade}</span>
                                      <span className="text-slate-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveSubForHistory(sub);
                                          setHistoryDrawerOpen(true);
                                        }}
                                        title="View COI history & previous policy years"
                                        className="inline-flex items-center space-x-0.5 text-[10px] text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-1 rounded transition-all cursor-pointer"
                                      >
                                        <History className="h-2.5 w-2.5 text-slate-400" />
                                        <span className="text-[9px] font-medium">History</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 md:px-4 text-right font-mono text-xs font-semibold text-slate-800 tracking-tight tabular-nums">
                                  {formatUSD(sub.contract_value)}
                                </td>
                                <td className="py-2.5 px-3 md:px-4 text-center relative">
                                  <div className="inline-block relative group">
                                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider cursor-help transition-all ${badgeStyle}`}>
                                      {sub.compliance_status}
                                    </span>
                                    
                                    {sub.manual_override && (
                                      <div className="hidden group-hover:block absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white rounded-lg shadow-xl text-left normal-case tracking-normal animate-in fade-in slide-in-from-bottom-1 duration-150">
                                        <div className="border-b border-slate-700 pb-1.5 mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                                          <span>Policy Waiver Auditable Info</span>
                                          <span className="bg-indigo-950 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-800">Exception</span>
                                        </div>
                                        <div className="space-y-1.5 text-[11px]">
                                          <div>
                                            <span className="text-slate-400 block text-[9px] font-semibold uppercase">Waiver Reason Type</span>
                                            <span className="font-semibold text-slate-100">{sub.waiver_reason_type || "N/A"}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[9px] font-semibold uppercase">Authorized Officer</span>
                                            <span className="font-mono text-slate-200">{sub.waiver_authorized_by || "Authorized In Writing"}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[9px] font-semibold uppercase">Expiration Limit Date</span>
                                            <span className={`font-semibold ${sub.waiver_expiration_date ? "text-amber-305" : "text-emerald-400"}`}>
                                              {sub.waiver_expiration_date ? sub.waiver_expiration_date : "No limit (Unconstrained)"}
                                            </span>
                                          </div>
                                          <div className="border-t border-slate-800 pt-1.5 mt-1">
                                            <span className="text-slate-400 block text-[9px] font-semibold uppercase">Resolution Context</span>
                                            <p className="text-slate-300 text-[10px] italic leading-relaxed break-words">{sub.override_notes || "No notes logged."}</p>
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900"></div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 md:px-4 text-center">
                                  {(() => {
                                    const activeCoi = activeCoiMap[sub.id];
                                    const coiExpDate = activeCoi 
                                      ? (activeCoi.policy_expiration_date_extracted || (activeCoi as any).policy_expiration_date)
                                      : null;

                                    if (!coiExpDate) {
                                      return (
                                        <span id={`coi-exp-fallback-${sub.id}`} className="text-slate-400 italic">
                                          No Document
                                        </span>
                                      );
                                    }

                                    // Check expiration conditions
                                    const expiration = new Date(coiExpDate);
                                    const current = new Date(evalDate);
                                    const isExpired = expiration <= current;

                                    let alertClass = "text-slate-600";
                                    if (isExpired) {
                                      alertClass = "text-red-600 font-bold";
                                    } else {
                                      const warnDaysOut = selectedProject?.requirements?.warn_days_out ?? 30;
                                      const diffTime = expiration.getTime() - current.getTime();
                                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                      if (diffDays <= warnDaysOut) {
                                        alertClass = "text-amber-600";
                                      }
                                    }

                                    return (
                                      <span id={`coi-exp-date-${sub.id}`} className={`font-mono text-xs ${alertClass}`}>
                                        {coiExpDate}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="py-2.5 px-3 md:px-4 text-center animate-in fade-in duration-100">
                                  <div className="flex items-center justify-center space-x-1.5">
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
                                    <button
                                      onClick={async () => {
                                        if (window.confirm(`Are you sure you want to remove ${sub.company_name} from this project?`)) {
                                          try {
                                            await deleteSubcontractor(selectedProject.id, sub.id);
                                            await loadAllData();
                                          } catch (error) {
                                            console.error(error);
                                            alert("An error occurred during subcontractor database deletion.");
                                          }
                                        }
                                      }}
                                      type="button"
                                      title={`Remove ${sub.company_name}`}
                                      className="p-1 rounded bg-red-50/30 hover:bg-red-50 border border-red-100/60 hover:border-red-200 text-red-500/75 hover:text-red-600 cursor-pointer transition-all flex items-center justify-center"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              // Default view showing notifications and global uploader overview
              <div 
                id="dashboard-general-view" 
                className={`grid grid-cols-1 ${showWelcomeIntro ? "md:grid-cols-2" : "md:grid-cols-1"} gap-5 items-start`}
              >
                
                {/* Visual Intro widget */}
                {showWelcomeIntro && (
                  <div id="introduction-welcome-card" className="bg-white border border-slate-200 p-5 rounded-lg shadow-xs flex flex-col justify-between h-full min-h-[380px] relative">
                    <button
                      id="dismiss-welcome-btn"
                      onClick={() => {
                        setShowWelcomeIntro(false);
                        localStorage.setItem("shieldcoi_show_welcome", "false");
                      }}
                      className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                      title="Permanently dismiss welcome guide"
                      aria-label="Dismiss Welcome Guide"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="space-y-3.5">
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block">
                        Overview
                      </span>
                      <h2 id="welcome-title" className="text-base font-bold text-slate-900 tracking-tight font-display pr-6">
                        Certificate of insurance compliance
                      </h2>
                      <p className="text-xs text-slate-550 leading-relaxed font-sans">
                        Shield COI checks each subcontractor's certificate of insurance (ACORD 25) against your project's requirements — coverage limits, additional insured, and expiration.
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                        Pick a project to review its subcontractors, or open Home to see everything that needs attention across all projects.
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
                )}

                {/* Notifications Log */}
                <NotificationList
                  notifications={notifications}
                  projects={projects}
                  onViewProject={(projId) => {
                    const match = projects.find((p) => p.id === projId);
                    if (match) {
                      setSelectedProject(match);
                    }
                  }}
                />
              </div>
            )}
          </section>
        </div>
        )}

        {/* Vendors view: every company rolled up across projects */}
        {view === "vendors" && (
          <VendorsView
            projects={activeProjects}
            subcontractors={liveSubcontractors}
            coiMap={activeCoiMap}
            evalDate={evalDate}
            onOpenProject={(projId) => {
              const p = projects.find((x) => x.id === projId);
              if (p) {
                setSelectedProject(p);
                setActiveSubForUpload(null);
                setScannedPayload(null);
                setView("projects");
              }
            }}
          />
        )}
      </main>

      {/* 3. Global Modal Components */}
      <UserGuideModal
        isOpen={isUserGuideOpen}
        onClose={() => setIsUserGuideOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        usedTrades={Array.from(new Set(allSubcontractors.map((s) => s.trade).filter(Boolean)))}
        onSaved={() => setEvalDate(getEvaluationDate())}
        onResetMockData={() => runDurableSeeding(true)}
        onDataReloaded={() => loadAllData(true)}
      />

      <ProjectForm
        isOpen={isProjModalOpen}
        onClose={() => {
          setIsProjModalOpen(false);
          setProjectToEdit(null);
        }}
        onSave={handleSaveProject}
        projectToEdit={projectToEdit || undefined}
      />

      <SubcontractorModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        projectName={selectedProject?.name || ""}
        onAdd={handleAddSubcontractor}
      />

      {/* COI upload drawer — opens per subcontractor; hands off to the verify drawer once scanned. Re-uploadable anytime. */}
      {selectedProject && activeSubForUpload && !scannedPayload && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end select-none">
          <div className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Upload COI
                </span>
                <h2 className="text-xs font-bold text-slate-900 tracking-tight font-display mt-1.5 uppercase">
                  {activeSubForUpload.company_name}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Drop a certificate to scan and verify. Re-upload a renewal here anytime.
                </p>
              </div>
              <button
                onClick={() => setActiveSubForUpload(null)}
                className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer shrink-0"
                aria-label="Close upload drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <CoiUploadZone
                onScanStart={() => setIsScanningActive(true)}
                onScanComplete={handleScanFinished}
                customRequirements={selectedProject?.custom_requirements}
                additionalInsuredNames={selectedProject?.additional_insured_names}
              />
            </div>
          </div>
        </div>
      )}

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
        subContractorTrade={activeSubForUpload?.trade || "Other Trades"}
        evaluationDate={evalDate}
        extractedData={scannedPayload}
        onSave={handleAuditSave}
      />

      {/* COI history timeline & archive inspect drawer */}
      {selectedProject && activeSubForHistory && (
        <CoiHistoryDrawer
          isOpen={historyDrawerOpen}
          onClose={() => {
            setHistoryDrawerOpen(false);
            setActiveSubForHistory(null);
          }}
          projectId={selectedProject.id}
          subcontractor={activeSubForHistory}
        />
      )}
    </div>

    {/* Dedicated Hidden Print Page Container */}
    <div id="shieldcoi-print-container" className="hidden print:block min-h-screen bg-white">
      <ExecutivePrintReport
        project={selectedProject}
        subcontractors={activeSubs}
        activeCoiMap={activeCoiMap}
      />
    </div>
  </>
);
}
