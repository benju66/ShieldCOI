import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

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
  }) => void;
  onScanStart: () => void;
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

export default function CoiUploadZone({ onScanComplete, onScanStart }: CoiUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (loading) return;

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
                simulated: !!responseData.simulated,
                warning: responseData.warning,
              });
              setLoading(false);
            }, 800);
          } else {
            throw new Error(responseData.error || "Gemini endpoint parsing error.");
          }
        } catch (serverErr: any) {
          console.error("Scanning request failed:", serverErr);
          alert(`Scanning Error: ${serverErr.message}`);
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
          });
          setLoading(false);
        }, 1000);
      } else {
        throw new Error(responseData.error || "Scanning sample failed.");
      }
    } catch (error: any) {
      alert(`Simulation Error: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div id="coi-upload-container" className="bg-slate-50 border border-slate-200 rounded-lg p-4">
      <h3 id="coi-upload-title" className="text-xs font-bold text-slate-900 tracking-tight font-display mb-2">
        Verification Scanning Desk (ACORD 25 Parsing)
      </h3>

      {loading ? (
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
