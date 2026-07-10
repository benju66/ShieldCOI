import React, { useState, useRef, useEffect } from "react";
import { FolderPlus, HelpCircle, X, Upload, FileText, RefreshCw } from "lucide-react";
import { Project } from "../types";

const DEFAULT_EXPIRED_TEMPLATE = `Dear [Subcontractor Name],

This is to notify you that your Certificate of Insurance (COI) for [Project Name] has expired or is about to expire. Please submit a renewed COI as soon as possible to ensure project compliance and avoid payment delays.

Thank you,
Project Management Team`;

const DEFAULT_INSUFFICIENT_TEMPLATE = `Dear [Subcontractor Name],

We have reviewed your Certificate of Insurance (COI) uploaded for [Project Name]. Our verification indicates that some of your coverage limits do not meet the minimum contract requirements. Please contact your insurance agent to obtain an endorsement or an updated COI satisfying the required limits.

Thank you,
Project Management Team`;

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectData: Omit<Project, "id" | "createdAt">) => Promise<void>;
  projectToEdit?: Project;
}

export default function ProjectForm({ isOpen, onClose, onSave, projectToEdit }: ProjectFormProps) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [targetDate, setTargetDate] = useState("2026-12-31");
  const [glOcc, setGlOcc] = useState(2000000);
  const [glAgg, setGlAgg] = useState(4000000);
  const [autoLimit, setAutoLimit] = useState(1000000);
  const [wcRequired, setWcRequired] = useState(true);
  const [warnDays, setWarnDays] = useState(60);
  const [glProd, setGlProd] = useState(2000000);
  const [umbrella, setUmbrella] = useState(1000000);
  const [elAccident, setElAccident] = useState(1000000);
  const [elDiseasePerson, setElDiseasePerson] = useState(1000000);
  const [elDiseaseLimit, setElDiseaseLimit] = useState(1000000);
  const [saving, setSaving] = useState(false);
  const [customRequirements, setCustomRequirements] = useState<{ id: string; label: string; limit: number }[]>([]);
  const [additionalInsuredRequired, setAdditionalInsuredRequired] = useState(false);
  const [additionalInsuredNames, setAdditionalInsuredNames] = useState<string[]>([]);
  const [acceptBlanketAi, setAcceptBlanketAi] = useState(true);
  const [expiredTemplate, setExpiredTemplate] = useState(DEFAULT_EXPIRED_TEMPLATE);
  const [insufficientTemplate, setInsufficientTemplate] = useState(DEFAULT_INSUFFICIENT_TEMPLATE);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (projectToEdit) {
        setName(projectToEdit.name || "");
        setNumber(projectToEdit.number || "");
        setTargetDate(projectToEdit.target_completion_date || "2026-12-31");
        setGlOcc(projectToEdit.requirements?.gl_occurrence ?? 2000000);
        setGlAgg(projectToEdit.requirements?.gl_aggregate ?? 4000000);
        setAutoLimit(projectToEdit.requirements?.auto_limit ?? 1000000);
        setWcRequired(projectToEdit.requirements?.workers_comp ?? true);
        setWarnDays(projectToEdit.requirements?.warn_days_out ?? 60);
        setGlProd(projectToEdit.requirements?.gl_products_completed ?? 2000000);
        setUmbrella(projectToEdit.requirements?.umbrella_limit ?? 1000005);
        setElAccident(projectToEdit.requirements?.employers_liability_accident ?? 1000000);
        setElDiseasePerson(projectToEdit.requirements?.employers_liability_disease_person ?? 1000000);
        setElDiseaseLimit(projectToEdit.requirements?.employers_liability_disease_limit ?? 1000000);
        setCustomRequirements(projectToEdit.custom_requirements || []);
        setAdditionalInsuredRequired(projectToEdit.additional_insured_required ?? false);
        setAdditionalInsuredNames(projectToEdit.additional_insured_names || []);
        setAcceptBlanketAi(projectToEdit.accept_blanket_ai ?? true);
        setExpiredTemplate(projectToEdit.email_templates?.expired_template ?? DEFAULT_EXPIRED_TEMPLATE);
        setInsufficientTemplate(projectToEdit.email_templates?.insufficient_template ?? DEFAULT_INSUFFICIENT_TEMPLATE);
        setIsTemplatesOpen(false);
      } else {
        setName("");
        setNumber("");
        setTargetDate("2026-12-31");
        setGlOcc(2000000);
        setGlAgg(4000000);
        setAutoLimit(1000000);
        setWcRequired(true);
        setWarnDays(60);
        setGlProd(2000000);
        setUmbrella(1000000);
        setElAccident(1000000);
        setElDiseasePerson(1000000);
        setElDiseaseLimit(1000000);
        setCustomRequirements([]);
        setAdditionalInsuredRequired(false);
        setAdditionalInsuredNames([]);
        setAcceptBlanketAi(true);
        setExpiredTemplate(DEFAULT_EXPIRED_TEMPLATE);
        setInsufficientTemplate(DEFAULT_INSUFFICIENT_TEMPLATE);
        setIsTemplatesOpen(false);
      }
    }
  }, [isOpen, projectToEdit]);

  // 🧪 Experimental AI Contract Scan State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  const processContractFile = async (file: File) => {
    if (loading) return;

    // The hosted scanner sends the file as base64 JSON; keep it under the
    // serverless request-body limit (~4.5 MB on Vercel). Base64 adds ~33%.
    const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(
        `Contract file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Please upload a file under 3 MB (compress the PDF or export fewer pages).`
      );
      return;
    }

    try {
      setLoading(true);
      setLoadingText("Reading contract specifications...");

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const fullDataUrl = reader.result as string;
        const commaIdx = fullDataUrl.indexOf(",");
        const base64Bytes = commaIdx !== -1 ? fullDataUrl.substring(commaIdx + 1) : fullDataUrl;

        setLoadingText("AI analyzing contract specifications...");

        try {
          const res = await fetch("/api/scan-contract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileData: base64Bytes,
              mimeType: file.type || "application/pdf",
              fileName: file.name,
            }),
          });

          if (!res.ok) {
            throw new Error(`Server returned status code: ${res.status}`);
          }

          const responseData = await res.json();
          if (responseData.success && responseData.data) {
            const extracted = responseData.data;
            
            // Populating state hooks as requested
            if (extracted.projectName) setName(extracted.projectName);
            
            // Generate compliant project ID code format
            if (extracted.projectName) {
              const cleanedProjName = extracted.projectName.replace(/[^a-zA-Z0-9 ]/g, "");
              const words = cleanedProjName.split(" ");
              const prefix = words.slice(0, 2).map((w: string) => w.substring(0, 3).toUpperCase()).join("-");
              setNumber(`P-2026-${prefix || "AI"}`);
            }

            if (typeof extracted.gl_occurrence === "number") setGlOcc(extracted.gl_occurrence);
            if (typeof extracted.gl_aggregate === "number") setGlAgg(extracted.gl_aggregate);
            if (typeof extracted.gl_products_completed === "number") setGlProd(extracted.gl_products_completed);
            if (typeof extracted.auto_limit === "number") setAutoLimit(extracted.auto_limit);
            if (typeof extracted.umbrella_limit === "number") setUmbrella(extracted.umbrella_limit);
            if (typeof extracted.employers_liability_accident === "number") setElAccident(extracted.employers_liability_accident);
            if (typeof extracted.employers_liability_disease_person === "number") setElDiseasePerson(extracted.employers_liability_disease_person);
            if (typeof extracted.employers_liability_disease_limit === "number") setElDiseaseLimit(extracted.employers_liability_disease_limit);
            if (typeof extracted.workers_comp === "boolean") setWcRequired(extracted.workers_comp);

            setLoading(false);
          } else {
            throw new Error(responseData.error || "Gemini endpoint contract parsing error.");
          }
        } catch (serverErr: any) {
          console.error("Contract scanning request failed:", serverErr);
          alert(`Analysis Error: ${serverErr.message}`);
          setLoading(false);
        }
      };

      reader.onerror = () => {
        alert("Failed to read file.");
        setLoading(false);
      };
    } catch (err: any) {
      console.error(err);
      alert("Error preparing file selection.");
      setLoading(false);
    }
  };

  const handleSampleContractSelect = async (sampleName: string) => {
    if (loading) return;
    setLoading(true);
    setLoadingText("Sourcing contract baseline guidelines...");

    await new Promise((resolve) => setTimeout(resolve, 800));
    setLoadingText("AI analyzing contract specifications...");

    try {
      const res = await fetch("/api/scan-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: "U0FNUExFX0RBVEE=",
          mimeType: "application/pdf",
          fileName: sampleName,
        }),
      });

      const responseData = await res.json();
      if (responseData.success && responseData.data) {
        const extracted = responseData.data;
        if (extracted.projectName) setName(extracted.projectName);
        
        // Auto-generate project file code
        const pNumRandom = "P-2026-" + Math.floor(1000 + Math.random() * 9000);
        setNumber(pNumRandom);

        if (typeof extracted.gl_occurrence === "number") setGlOcc(extracted.gl_occurrence);
        if (typeof extracted.gl_aggregate === "number") setGlAgg(extracted.gl_aggregate);
        if (typeof extracted.gl_products_completed === "number") setGlProd(extracted.gl_products_completed);
        if (typeof extracted.auto_limit === "number") setAutoLimit(extracted.auto_limit);
        if (typeof extracted.umbrella_limit === "number") setUmbrella(extracted.umbrella_limit);
        if (typeof extracted.employers_liability_accident === "number") setElAccident(extracted.employers_liability_accident);
        if (typeof extracted.employers_liability_disease_person === "number") setElDiseasePerson(extracted.employers_liability_disease_person);
        if (typeof extracted.employers_liability_disease_limit === "number") setElDiseaseLimit(extracted.employers_liability_disease_limit);
        if (typeof extracted.workers_comp === "boolean") setWcRequired(extracted.workers_comp);

        setLoading(false);
      } else {
        throw new Error(responseData.error || "Simulation error");
      }
    } catch (error: any) {
      alert(`Simulation Error: ${error.message}`);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !number.trim()) {
      alert("Please fill in basic project identity parameters.");
      return;
    }

    try {
      setSaving(true);
      await onSave({
        name,
        number,
        target_completion_date: targetDate,
        requirements: {
          gl_occurrence: Number(glOcc),
          gl_aggregate: Number(glAgg),
          auto_limit: Number(autoLimit),
          workers_comp: wcRequired,
          warn_days_out: Number(warnDays),
          gl_products_completed: Number(glProd),
          umbrella_limit: Number(umbrella),
          employers_liability_accident: Number(elAccident),
          employers_liability_disease_person: Number(elDiseasePerson),
          employers_liability_disease_limit: Number(elDiseaseLimit),
        },
        custom_requirements: customRequirements,
        additional_insured_required: additionalInsuredRequired,
        additional_insured_names: additionalInsuredNames.map((n) => n.trim()).filter(Boolean),
        accept_blanket_ai: acceptBlanketAi,
        email_templates: {
          expired_template: expiredTemplate,
          insufficient_template: insufficientTemplate,
        },
      });
      // Reset
      setName("");
      setNumber("");
      onClose();
    } catch (err) {
      alert("An error occurred while registering the project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="project-form-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div id="project-form-card" className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div id="project-form-header" className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderPlus className="h-4.5 w-4.5 text-blue-600" />
            <span id="project-form-title" className="text-xs font-bold text-slate-900 font-display tracking-tight uppercase">
              {projectToEdit ? "Edit Project Specifications" : "Create New Construction Project"}
            </span>
          </div>
          <button
            onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
            onClick={onClose}
            className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto max-h-[75vh]">
          <div id="project-form-body" className="p-4 space-y-4">

            {/* 🧪 Experimental AI Contract Scan Drag & Drop Target Area */}
            <div id="ai-contract-scan-container" className="bg-amber-50/40 border-2 border-dashed border-amber-300 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  🧪 Experimental: Auto-Populate Form via AI Contract Scan
                </span>
                <HelpCircle className="h-3.5 w-3.5 text-amber-500 cursor-help" title="Upload draft contract agreements or project templates to extract parameters instantly using AI scanning." />
              </div>

              {loading ? (
                <div id="ai-contract-loading" className="flex flex-col items-center justify-center py-6 text-center">
                  <RefreshCw className="h-6 w-6 text-amber-600 animate-spin mb-2" />
                  <p className="text-slate-800 text-xs font-bold">{loadingText}</p>
                  <span className="text-slate-500 text-[9px]">Analyzing Article A.3 'Contractor Insurance'...</span>
                </div>
              ) : (
                <div
                  id="ai-contract-dropzone"
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      processContractFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer transition-all rounded-md p-4 flex flex-col items-center justify-center text-center ${
                    isDragOver
                      ? "bg-amber-100/50 border-amber-450"
                      : "bg-white hover:bg-amber-50/30 border border-amber-200"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processContractFile(e.target.files[0]);
                      }
                    }}
                    accept="image/*,application/pdf"
                    className="hidden"
                  />
                  <Upload className="h-5 w-5 text-amber-600 mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">
                    Drag & drop Prime Contract Exhibit PDF or Image
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Supports PDF, PNG, JPG, JPEG guidelines</p>
                  <button
                    type="button"
                    className="mt-2 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 rounded font-bold text-[10px] cursor-pointer"
                  >
                    Browse Files
                  </button>
                </div>
              )}

              {/* Instant sandbox mock files in the same container to play with */}
              {!loading && (
                <div className="pt-2 border-t border-amber-200/50">
                  <span className="text-[9px] text-amber-700 font-bold block mb-1.5 uppercase tracking-wide">
                    Sandbox Demo Exhibits:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSampleContractSelect("Aurora_Luxury_Suites_Phase_2_Exhibit.pdf")}
                      type="button"
                      className="flex items-center space-x-1.5 p-1.5 rounded border border-amber-200 bg-white hover:bg-amber-50 text-left transition-all cursor-pointer text-[10px] text-slate-700 font-medium group"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      <span className="truncate group-hover:text-amber-800">Aurora Exhibit A</span>
                    </button>
                    <button
                      onClick={() => handleSampleContractSelect("Skyline_Apartments_Exhibit_Section_A3.pdf")}
                      type="button"
                      className="flex items-center space-x-1.5 p-1.5 rounded border border-amber-200 bg-white hover:bg-amber-50 text-left transition-all cursor-pointer text-[10px] text-slate-700 font-medium group"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      <span className="truncate group-hover:text-amber-800">Skyline Exhibit A</span>
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[9.5px] text-slate-500 leading-normal text-center italic">
                Notice: This is an experimental feature utilizing generative AI. Always cross-reference extracted metrics against your hardcopy contract agreements before finalizing project baselines.
              </p>
            </div>

            {/* Project Details */}
            <div className="space-y-2.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                Basic Project Identity
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="project-name-input" className="block text-[11px] font-bold text-slate-705 mb-1">
                    Project Name *
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Skyline Apartments Masterplan"
                    className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="project-number-input" className="block text-[11px] font-bold text-slate-705 mb-1">
                    Project Identifier File # *
                  </label>
                  <input
                    id="project-number-input"
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="e.g. P-2026-98"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="target-completion-date" className="block text-[11px] font-bold text-slate-705 mb-1">
                    Target Completion Date
                  </label>
                  <input
                    id="target-completion-date"
                    type="date"
                    required
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Threshold Configuration Panel */}
            <div id="threshold-config-panel" className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider flex items-center">
                Insurance Aggregates Setup
              </span>

              {/* General Liability Occurrence */}
              <div>
                <label htmlFor="gl-each-occurrence" className="block text-[10px] font-bold text-slate-600 mb-1">
                  General Liability: Each Occurrence Limit ($)
                </label>
                <input
                  id="gl-each-occurrence"
                  type="number"
                  min="0"
                  required
                  value={glOcc}
                  onChange={(e) => setGlOcc(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* General Liability Aggregate */}
              <div>
                <label htmlFor="gl-general-aggregate" className="block text-[10px] font-bold text-slate-600 mb-1">
                  General Liability: General Aggregate Limit ($)
                </label>
                <input
                  id="gl-general-aggregate"
                  type="number"
                  min="0"
                  required
                  value={glAgg}
                  onChange={(e) => setGlAgg(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Auto Limits */}
              <div>
                <label htmlFor="auto-combined-single-limit" className="block text-[10px] font-bold text-slate-600 mb-1">
                  Automobile Liability: Combined Single Limit ($)
                </label>
                <input
                  id="auto-combined-single-limit"
                  type="number"
                  min="0"
                  required
                  value={autoLimit}
                  onChange={(e) => setAutoLimit(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* General Liability Products-Completed Aggregate */}
              <div>
                <label htmlFor="gl-products-completed" className="block text-[10px] font-bold text-slate-600 mb-1">
                  General Liability: Products-Completed Aggregate ($)
                </label>
                <input
                  id="gl-products-completed"
                  type="number"
                  min="0"
                  required
                  value={glProd}
                  onChange={(e) => setGlProd(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Umbrella Limit */}
              <div>
                <label htmlFor="umbrella-limit" className="block text-[10px] font-bold text-slate-600 mb-1">
                  Umbrella / Excess Liability Minimum ($)
                </label>
                <input
                  id="umbrella-limit"
                  type="number"
                  min="0"
                  required
                  value={umbrella}
                  onChange={(e) => setUmbrella(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Employers' Liability Accident */}
              <div>
                <label htmlFor="el-accident" className="block text-[10px] font-bold text-slate-600 mb-1">
                  Employers' Liability: Accident ($)
                </label>
                <input
                  id="el-accident"
                  type="number"
                  min="0"
                  required
                  value={elAccident}
                  onChange={(e) => setElAccident(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Employers' Liability Disease Per Person */}
              <div>
                <label htmlFor="el-disease-person" className="block text-[10px] font-bold text-slate-600 mb-1">
                  Employers' Liability: Disease (Per Person) ($)
                </label>
                <input
                  id="el-disease-person"
                  type="number"
                  min="0"
                  required
                  value={elDiseasePerson}
                  onChange={(e) => setElDiseasePerson(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Employers' Liability Disease Policy Limit */}
              <div>
                <label htmlFor="el-disease-limit" className="block text-[10px] font-bold text-slate-600 mb-1">
                  Employers' Liability: Disease (Policy Limit) ($)
                </label>
                <input
                  id="el-disease-limit"
                  type="number"
                  min="0"
                  required
                  value={elDiseaseLimit}
                  onChange={(e) => setElDiseaseLimit(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                />
              </div>

              {/* Workers Comp statutory toggle */}
              <div className="flex items-center justify-between py-1 border-t border-slate-200 pt-2">
                <div>
                  <p className="text-[11px] font-bold text-slate-800">Mandate Workers' Comp Statutory limits</p>
                  <p className="text-[10px] text-slate-500">Require standard state WC policy limits.</p>
                </div>
                <label id="wc-toggle-label" className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wcRequired}
                    onChange={(e) => setWcRequired(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {/* Warn grace indicators */}
              <div className="border-t border-slate-200 pt-2">
                <label htmlFor="warn-days-grace" className="block text-[10px] font-bold text-slate-605 mb-1">
                  Alert Window Buffer
                </label>
                <select
                  id="warn-days-grace"
                  value={warnDays}
                  onChange={(e) => setWarnDays(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800 cursor-pointer"
                >
                  <option value={30}>Warn within 30 days of expiration</option>
                  <option value={60}>Warn within 60 days of expiration (Recommended)</option>
                  <option value={90}>Warn within 90 days of expiration</option>
                </select>
              </div>

              {/* Custom Requirements Section */}
              <hr className="border-slate-200 my-4" />
              <div id="custom-requirements-section" className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Custom Insurance Requirements
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomRequirements([
                        ...customRequirements,
                        { id: Date.now().toString(), label: "", limit: 0 },
                      ]);
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    <span>[+] Add Custom Coverage Requirement</span>
                  </button>
                </div>

                {customRequirements.length > 0 && (
                  <div className="space-y-2">
                    {customRequirements.map((reqItem, index) => (
                      <div key={reqItem.id} className="grid grid-cols-12 gap-2 items-center">
                        {/* 1. Label column */}
                        <div className="col-span-6">
                          <input
                            type="text"
                            placeholder="e.g., Railroad Protective Liability"
                            value={reqItem.label}
                            onChange={(e) => {
                              const updated = [...customRequirements];
                              updated[index] = { ...reqItem, label: e.target.value };
                              setCustomRequirements(updated);
                            }}
                            className="w-full text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800"
                            required
                          />
                        </div>
                        {/* 2. Limit column */}
                        <div className="col-span-5">
                          <input
                            type="number"
                            min="0"
                            placeholder="Limit Amount"
                            value={reqItem.limit === 0 ? "" : reqItem.limit}
                            onChange={(e) => {
                              const updated = [...customRequirements];
                              updated[index] = { ...reqItem, limit: Number(e.target.value) };
                              setCustomRequirements(updated);
                            }}
                            className="w-full text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-805"
                            required
                          />
                        </div>
                        {/* 3. Delete button column */}
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomRequirements(customRequirements.filter(item => item.id !== reqItem.id));
                            }}
                            className="p-1 rounded cursor-pointer hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all"
                            title="Delete custom requirement"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Insured Verification */}
            <div id="additional-insured-panel" className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-800">Verify Additional Insured</p>
                  <p className="text-[10px] text-slate-500">Check that required entities are named as AI on each COI.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={additionalInsuredRequired}
                    onChange={(e) => setAdditionalInsuredRequired(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {additionalInsuredRequired && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Required Additional Insured Entities
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdditionalInsuredNames([...additionalInsuredNames, ""])}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        <span>[+] Add Entity</span>
                      </button>
                    </div>
                    {additionalInsuredNames.length > 0 && (
                      <div className="space-y-2">
                        {additionalInsuredNames.map((entityName, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-11">
                              <input
                                type="text"
                                placeholder="e.g., Evergreen Development LLC, its officers and agents"
                                value={entityName}
                                onChange={(e) => {
                                  const updated = [...additionalInsuredNames];
                                  updated[index] = e.target.value;
                                  setAdditionalInsuredNames(updated);
                                }}
                                className="w-full text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800"
                              />
                            </div>
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => setAdditionalInsuredNames(additionalInsuredNames.filter((_, i) => i !== index))}
                                className="p-1 rounded cursor-pointer hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all"
                                title="Remove entity"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[9.5px] text-slate-500 leading-normal">
                      Leave empty to simply require that <em>some</em> additional insured status appears on the certificate.
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                    <div className="pr-3">
                      <p className="text-[11px] font-bold text-slate-800">Accept blanket "as required by written contract"</p>
                      <p className="text-[10px] text-slate-500">Treat blanket endorsement language as a conditional pass (flagged to verify the endorsement).</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={acceptBlanketAi}
                        onChange={(e) => setAcceptBlanketAi(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ✉️ Notification Email Templates Configuration */}
            <div id="email-templates-pane" className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-100 hover:bg-slate-200/80 transition-colors text-xs font-bold text-slate-800"
              >
                <span>✉️ Notification Email Templates Configuration</span>
                <span className="text-slate-500 font-mono text-[10px]">
                  {isTemplatesOpen ? "▲ Collapse" : "▼ Expand"}
                </span>
              </button>
              
              {isTemplatesOpen && (
                <div className="p-3.5 space-y-3 border-t border-slate-200">
                  <p id="template-tag-tip" className="text-[10px] text-slate-500 leading-normal">
                    Tip: Use <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">[Project Name]</code> and <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">[Subcontractor Name]</code> tags to auto-populate vendor credentials dynamically.
                  </p>
                  
                  {/* Expired Policy Template */}
                  <div>
                    <label id="expired-template-label" htmlFor="expired-template-textarea" className="block text-[10px] font-bold text-slate-600 mb-1">
                      Expired Policy Template
                    </label>
                    <textarea
                      id="expired-template-textarea"
                      rows={5}
                      value={expiredTemplate}
                      onChange={(e) => setExpiredTemplate(e.target.value)}
                      className="w-full text-xs font-sans bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                      placeholder="Enter policy expiration message draft..."
                    />
                  </div>

                  {/* Insufficient Limit Template */}
                  <div>
                    <label id="insufficient-template-label" htmlFor="insufficient-template-textarea" className="block text-[10px] font-bold text-slate-600 mb-1">
                      Insufficient Limit Template
                    </label>
                    <textarea
                      id="insufficient-template-textarea"
                      rows={5}
                      value={insufficientTemplate}
                      onChange={(e) => setInsufficientTemplate(e.target.value)}
                      className="w-full text-xs font-sans bg-white border border-slate-100 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                      placeholder="Enter limit deficiency message draft..."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div id="project-form-footer" className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
            <button
              onClick={onClose}
              type="button"
              className="px-3.5 py-1.5 bg-white text-slate-700 rounded-md font-bold text-[11px] hover:bg-slate-100 transition-colors border border-slate-200 shadow-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[11px] hover:shadow-xs transition-all uppercase tracking-wide cursor-pointer"
            >
              {saving ? (projectToEdit ? "Saving..." : "Deploying...") : (projectToEdit ? "Save Changes" : "Create Project")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
