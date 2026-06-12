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
  ChevronLeft,
  Edit2,
  Trash2,
  History,
  Download,
  Printer,
  X,
  HelpCircle
} from "lucide-react";

import UserGuideModal from "./components/UserGuideModal";
import { auth, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

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
import ProjectForm from "./components/ProjectForm";
import SubcontractorModal from "./components/SubcontractorModal";
import CoiUploadZone from "./components/CoiUploadZone";
import VerificationDrawer from "./components/VerificationDrawer";
import NotificationList from "./components/NotificationList";
import CoiHistoryDrawer from "./components/CoiHistoryDrawer";
import { exportToCSV } from "./utils/reportExporter";
import ExecutivePrintReport from "./components/ExecutivePrintReport";
import { formatUSD } from "./utils/currency";

export default function App() {
  // DB States
  const [projects, setProjects] = useState<Project[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<Subcontractor[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeCoiMap, setActiveCoiMap] = useState<Record<string, CoiRecord>>({});

  // Auth States
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // UI States
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showWelcomeIntro, setShowWelcomeIntro] = useState<boolean>(() => {
    return localStorage.getItem("shieldcoi_show_welcome") !== "false";
  });
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);

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

  // Initial load with Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setPageLoading(true);
        try {
          await seedInitialData(false);
          await loadAllData();
        } catch (error) {
          console.error("Auth init boot seeding error: ", error);
        } finally {
          setPageLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google sign-in failing:", err);
      alert("Sign-in failed. Please ensure Firebase Auth is configured and try again.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSelectedProject(null);
      setProjects([]);
      setAllSubcontractors([]);
      setNotifications([]);
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };

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

  // Save Project handler (handles both create and edit specifications)
  const handleSaveProject = async (projectData: Omit<Project, "id" | "createdAt">) => {
    if (projectToEdit) {
      await updateProject(projectToEdit.id, projectData);
    } else {
      await createProject(projectData);
    }
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          <p className="text-slate-400 text-sm font-medium tracking-wide">Securing Tenant Connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 selection:bg-blue-500/30 selection:text-blue-200 antialiased overflow-hidden relative">
        {/* Abstract Glow Effects */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
        
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center">
            {/* ShieldCOI Logo Icon */}
            <div className="h-16 w-16 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-6 border border-blue-400/20">
              <ShieldCheck className="h-9 w-9 text-white" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              ShieldCOI Portal
            </h1>
            <p className="text-slate-400 text-sm mb-8 px-2 leading-relaxed">
              Instant insurance compliance check, custom alert loggers, and exception approval workflows.
            </p>
            
            <button
              onClick={handleSignIn}
              id="google-signin-auth-gate-button"
              className="w-full h-12 bg-white hover:bg-slate-50 text-slate-800 font-semibold px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-3 cursor-pointer group active:scale-98"
            >
              <svg className="h-5 w-5 group-hover:scale-105 transition-transform" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.03-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Connect with Google Auth</span>
            </button>
            
            <div className="mt-8 pt-6 border-t border-slate-800 w-full flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Host ID: shieldcoi-staging</span>
              <span className="flex items-center space-x-1.5">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span>Active Link</span>
              </span>
            </div>
          </div>
        </div>
        
        <p className="mt-6 text-[12px] text-slate-500 font-medium">
          Workspace secured by custom Firestore security parameters.
        </p>
      </div>
    );
  }

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
              Project-Level Insurance Compliance Manager
            </p>
          </div>
        </div>

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
            onClick={() => runDurableSeeding(true)}
            id="seed-database-button"
            disabled={isSeeding}
            type="button"
            className="flex items-center space-x-1 px-2.5 py-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-md text-[11px] shadow-xs cursor-pointer transition-all disabled:opacity-50"
          >
            <Database className="h-3 w-3 text-slate-400" />
            <span>{isSeeding ? "Resetting..." : "Reset Mock Data"}</span>
          </button>

          <div id="authenticated-admin-panel" className="bg-slate-50 border border-slate-200 pl-2 pr-2.5 py-1 rounded-md flex items-center space-x-2 text-[11px]">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="h-5.5 w-5.5 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-slate-500 text-[9px] font-semibold uppercase tracking-wider">{user.displayName || "Authorized User"}</span>
              <strong className="text-slate-800 font-medium truncate max-w-[140px] text-[10.5px]" title={user.email || ""}>
                {user.email}
              </strong>
            </div>
            <button
              onClick={handleSignOut}
              className="text-slate-400 hover:text-red-500 font-semibold pl-1.5 border-l border-slate-250 text-[10px] transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Layout Area */}
      <main id="app-viewport-pane" className="flex-1 w-full max-w-[1600px] mx-auto px-6 py-4 flex flex-col h-full lg:overflow-hidden">
        
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
                        Setup risk thresholds and direct subcontractor insurance audits below.
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
                  
                  {/* Left segment - Thresholds parameters card */}
                  <div id="active-thresholds-panel" className="col-span-1 md:col-span-3 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3.5 max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center">
                        <Sliders className="h-3 w-3 mr-1 text-slate-400" /> Required COI Minimums
                      </span>
                    </div>

                    <div className="space-y-2.5 text-[11px]">
                      {/* General Liability */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">General Liability</span>
                        <div className="pl-1.5 border-l border-slate-200 space-y-1.5">
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              Each Occurrence Limit
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.gl_occurrence)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              General Aggregate Limit
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.gl_aggregate)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              Products / Completed Ops
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.gl_products_completed ?? 0)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Auto & Umbrella */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Auto & Excess</span>
                        <div className="pl-1.5 border-l border-slate-200 space-y-1.5">
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              Automobile Combined Single
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.auto_limit)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              Umbrella / Excess Limit
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.umbrella_limit ?? 0)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Employers Liability */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Employers Liability</span>
                        <div className="pl-1.5 border-l border-slate-200 space-y-1.5">
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              E.L. Each Accident
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.employers_liability_accident ?? 0)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              E.L. Disease - Each Employee
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.employers_liability_disease_person ?? 0)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-medium">
                              E.L. Disease - Policy Limit
                            </span>
                            <strong className="text-slate-800 font-mono text-xs tracking-tight tabular-nums">
                              {formatUSD(selectedProject.requirements.employers_liability_disease_limit ?? 0)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Workers Comp & Buffer */}
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Workers Comp:</span>
                          <strong className="text-slate-800 font-semibold uppercase tracking-wide text-[10px]">
                            {selectedProject.requirements.workers_comp ? "Statutory" : "Excluded"}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Grace Buffer:</span>
                          <strong className="text-slate-800 text-[10px]">
                            {selectedProject.requirements.warn_days_out} Days
                          </strong>
                        </div>
                      </div>

                      {/* Custom Requirements */}
                      {selectedProject.custom_requirements && selectedProject.custom_requirements.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Custom Coverage</span>
                          <div className="pl-1.5 border-l border-blue-200 space-y-1.5">
                            {selectedProject.custom_requirements.map((custom) => (
                              <div key={custom.id}>
                                <span className="text-[9px] text-slate-500 block uppercase font-semibold">
                                  {custom.label}
                                </span>
                                <strong className="text-blue-800 font-mono text-xs tracking-tight tabular-nums">
                                  {formatUSD(custom.limit)}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right segment - Subcontractors assigned tabular view */}
                  <div id="enrolled-vendor-table-container" className="col-span-1 md:col-span-9 overflow-x-auto border border-slate-200 rounded-lg bg-white">
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
                                    const current = new Date("2026-06-11");
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
                        customRequirements={selectedProject?.custom_requirements}
                      />
                    </div>
                  </div>
                )}
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
                        Enterprise Compliance
                      </span>
                      <h2 id="welcome-title" className="text-base font-bold text-slate-900 tracking-tight font-display pr-6">
                        Zero-Trust Construction Compliance Audits
                      </h2>
                      <p className="text-xs text-slate-550 leading-relaxed font-sans">
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
      </main>

      {/* 3. Global Modal Components */}
      <UserGuideModal
        isOpen={isUserGuideOpen}
        onClose={() => setIsUserGuideOpen(false)}
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
