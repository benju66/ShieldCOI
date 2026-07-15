import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { todayISO } from "../settingsService";
import { useSettings } from "../SettingsContext";

interface CoiUploadZoneProps {
  onScanComplete: (data: {
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
    extraction_method?: "AI_Scan" | "Manual_Entry";
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    additional_insured_text?: string;
    gl_addl_insd?: boolean;
    file_data?: string;
    file_mime?: string;
    field_locations?: { field: string; page?: number; box_2d: number[] }[];
  }) => void;
  onScanStart: () => void;
  customRequirements?: { id: string; label: string; limit: number }[];
  additionalInsuredNames?: string[];
}

const SAMPLE_FILES = [
  {
    name: "titan_steel_coi_2026.png",
    label: "Titan Structural Steel (Will scan as EXPIRED)",
    trade: "Steel Framing",
  },
  {
    name: "apex_plumbing_coi_short.pdf",
    label: "Apex Plumbing & Piping (Will scan as INSUFFICIENT LIMITS)",
    trade: "Plumbing Package",
  },
  {
    name: "solid_ground_compliance.jpg",
    label: "Solid Ground Concrete (Will scan as COMPLIANT)",
    trade: "Foundations",
  },
];

export default function CoiUploadZone({ onScanComplete, onScanStart, customRequirements, additionalInsuredNames }: CoiUploadZoneProps) {
  const { settings } = useSettings();
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerManualEntry = () => {
    setError(null);
    onScanComplete({
      insured_name: "",
      gl_each_occurrence: 0,
      gl_general_aggregate: 0,
      auto_combined_single_limit: 0,
      workers_comp_statutory: false,
      policy_expiration_date: settings.evaluation_date || todayISO(), // Blank manual entry starts at "today"; user sets the real date
      gl_products_completed: 0,
      umbrella_limit: 0,
      employers_liability_accident: 0,
      employers_liability_disease_person: 0,
      employers_liability_disease_limit: 0,
      professional_liability: 0,
      pollution_liability: 0,
      additional_insured_named: [],
      additional_insured_blanket: false,
      additional_insured_text: "",
      gl_addl_insd: false,
      file_name: "Manual_Entry_Document.pdf",
      simulated: false,
      extraction_method: "Manual_Entry",
    });
  };

  const processFile = async (file: File) => {
    if (loading) return;
    setError(null);

    // The hosted scanner sends the file as base64 JSON; keep it under the
    // serverless request-body limit (~4.5 MB on Vercel). Base64 adds ~33%.
    const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Please upload a file under 3 MB (compress the PDF or export fewer/lower-res pages).`
      );
      return;
    }

    try {
      setLoading(true);
      onScanStart();
      setLoadingText("Reading file bytes...");

      // Read file to Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const fullDataUrl = reader.result as string;
        const commaIdx = fullDataUrl.indexOf(",");
        const base64Bytes = commaIdx !== -1 ? fullDataUrl.substring(commaIdx + 1) : fullDataUrl;

        setLoadingText("AI scanning and analyzing ACORD 25 document structure...");

        try {
          const res = await fetch("/api/scan-coi", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileData: base64Bytes,
              mimeType: file.type || "image/png",
              fileName: file.name,
              custom_requirements: customRequirements,
              additional_insured_names: additionalInsuredNames,
            }),
          });

          if (!res.ok) {
            throw new Error(`Server returned status code: ${res.status}`);
          }

          const responseData = await res.json();
          if (responseData.success) {
            setLoadingText("Comparing extracted policy limits against project mandates...");
            setTimeout(() => {
              onScanComplete({
                ...responseData.data,
                file_name: file.name,
                file_data: base64Bytes,
                file_mime: file.type || "image/png",
                simulated: !!responseData.simulated,
                warning: responseData.warning,
                extraction_method: "AI_Scan",
              });
              setLoading(false);
            }, 800);
          } else {
            throw new Error(responseData.error || "Gemini endpoint parsing error.");
          }
        } catch (serverErr: any) {
          console.error("Scanning request failed:", serverErr);
          setError("Scanning Unsuccessful: Document text could not be reliably extracted by AI.");
          setLoading(false);
        }
      };

      reader.onerror = () => {
        setError("Scanning Unsuccessful: Document text could not be reliably extracted by AI.");
        setLoading(false);
      };
    } catch (err: any) {
      console.error(err);
      setError("Scanning Unsuccessful: Document text could not be reliably extracted by AI.");
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // Simulating a file upload for samples
  const handleSampleSelect = async (sampleName: string) => {
    if (loading) return;
    setError(null);
    setLoading(true);
    onScanStart();
    setLoadingText("Simulating file stream payload...");

    await new Promise((resolve) => setTimeout(resolve, 800));

    setLoadingText("AI Scanning standard ACORD 25 certificate boxes...");

    try {
      const res = await fetch("/api/scan-coi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: "U0FNUExFX0RBVEE=", // short mock base64
          mimeType: "image/png",
          fileName: sampleName,
          custom_requirements: customRequirements,
          additional_insured_names: additionalInsuredNames,
        }),
      });

      const responseData = await res.json();
      if (responseData.success) {
        setLoadingText("Running insurance validation parser...");
        setTimeout(() => {
          onScanComplete({
            ...responseData.data,
            file_name: sampleName,
            simulated: !!responseData.simulated,
            warning: responseData.warning,
            extraction_method: "AI_Scan",
          });
          setLoading(false);
        }, 1000);
      } else {
        throw new Error(responseData.error || "Scanning sample failed.");
      }
    } catch (error: any) {
      console.error("Sample simulation failed:", error);
      setError("Scanning Unsuccessful: Document text could not be reliably extracted by AI.");
      setLoading(false);
    }
  };

  return (
    <div id="coi-upload-container" className="bg-slate-50 border border-slate-200 rounded-lg p-4">
      <h3 id="coi-upload-title" className="text-xs font-bold text-slate-900 tracking-tight font-display mb-2">
        Verification Scanning Desk (ACORD 25 Parsing)
      </h3>

      {error ? (
        <div id="coi-upload-error-box" className="p-4 bg-amber-50/50 border border-amber-200 rounded-lg text-center flex flex-col items-center justify-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-600 mb-1" />
          <p className="text-xs font-bold text-amber-900">
            Scanning Unsuccessful: Document text could not be reliably extracted by AI.
          </p>
          <div className="flex space-x-2 mt-2 w-full justify-center">
            <button
              onClick={() => setError(null)}
              type="button"
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-705 hover:text-slate-900 rounded font-bold text-[10.5px] shadow-xs cursor-pointer flex items-center space-x-1"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Retry Upload
            </button>
            <button
              onClick={triggerManualEntry}
              type="button"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[10.5px] shadow-xs cursor-pointer flex items-center space-x-1"
            >
              <span>⌨️ Enter Insurance Data Manually</span>
            </button>
          </div>
        </div>
      ) : loading ? (
        <div id="coi-upload-loading" className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-blue-500/30 rounded-lg bg-blue-50/50 animate-pulse text-center">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-3" />
          <p className="text-slate-800 text-xs font-bold px-4">{loadingText}</p>
          <span className="text-slate-500 text-[10px] mt-1">This usually takes about 2-4 seconds.</span>
        </div>
      ) : (
        <>
          <div
            id="coi-upload-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer transition-all border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center ${
              isDragOver
                ? "border-blue-500 bg-blue-50 text-slate-900"
                : "border-slate-205 border-slate-300 hover:border-blue-500 bg-white text-slate-500 hover:bg-slate-50/50"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,application/pdf"
              className="hidden"
            />
            <Upload className="h-8 w-8 text-slate-400 mb-2" />
            <p className="text-xs font-bold text-slate-800">
              Drag & drop ACORD 25 COI PDF or Image
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Supports PDF, PNG, JPG, JPEG up to 10MB</p>
            <button
              type="button"
              className="mt-3 px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 rounded font-bold text-[10.5px] shadow-xs cursor-pointer"
            >
              Browse Files
            </button>

            {/* Permanent text link at the base of drop zone */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                triggerManualEntry();
              }}
              className="mt-4 text-[11px] text-indigo-600 hover:text-indigo-800 underline font-semibold cursor-pointer transition-colors"
            >
              Skip scanning and enter manually
            </div>
          </div>

          <div id="coi-upload-samples" className="mt-4 pt-3 border-t border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block mb-2 tracking-wide uppercase">
              Or Instant Sandbox Simulators:
            </span>
            <div className="grid grid-cols-1 gap-2">
              {SAMPLE_FILES.map((sample) => (
                <button
                  key={sample.name}
                  onClick={() => handleSampleSelect(sample.name)}
                  type="button"
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-left transition-all hover:bg-blue-50/50 hover:border-blue-350 cursor-pointer group"
                >
                  <div className="flex items-center space-x-2 w-full pr-2">
                    <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">
                        {sample.name}
                      </p>
                      <p className="text-[10px] text-slate-450 text-slate-500 truncate">{sample.label}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold">
                    Inject
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
