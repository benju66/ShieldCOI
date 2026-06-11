import React, { useState } from "react";
import { FolderPlus, HelpCircle, X } from "lucide-react";
import { Project } from "../types";

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectData: Omit<Project, "id" | "createdAt">) => Promise<void>;
}

export default function ProjectForm({ isOpen, onClose, onSave }: ProjectFormProps) {
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
              Create New Construction Project
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
              {saving ? "Deploying..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
