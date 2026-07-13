import React, { useEffect, useRef, useState } from "react";
import { Sliders, X, Plus, Trash2, Download, Upload, Database, RefreshCw, AlertTriangle } from "lucide-react";
import {
  getSettings,
  saveSettings,
  TRADES_WITH_COVERAGE_RULES,
} from "../settingsService";
import { exportAllData, importAllData, clearAllData } from "../dbService";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Trade names currently referenced by enrolled subcontractors (for remove guardrails). */
  usedTrades: string[];
  /** Re-seed the sample dataset. */
  onResetMockData: () => void | Promise<void>;
  /** Called after import/clear so the app can re-hydrate from storage. */
  onDataReloaded: () => void | Promise<void>;
}

export default function SettingsModal({
  isOpen,
  onClose,
  usedTrades,
  onResetMockData,
  onDataReloaded,
}: SettingsModalProps) {
  const [trades, setTrades] = useState<string[]>([]);
  const [newTrade, setNewTrade] = useState("");
  const [expiredTemplate, setExpiredTemplate] = useState("");
  const [insufficientTemplate, setInsufficientTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate local editing state each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      const s = getSettings();
      setTrades(s.trades);
      setExpiredTemplate(s.email_templates.expired_template);
      setInsufficientTemplate(s.email_templates.insufficient_template);
      setNewTrade("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const usedSet = new Set(usedTrades);

  const addTrade = () => {
    const name = newTrade.trim();
    if (!name) return;
    if (trades.some((t) => t.toLowerCase() === name.toLowerCase())) {
      alert(`"${name}" is already in the list.`);
      return;
    }
    setTrades([...trades, name]);
    setNewTrade("");
  };

  const renameTrade = (index: number, value: string) => {
    const updated = [...trades];
    updated[index] = value;
    setTrades(updated);
  };

  const removeTrade = (index: number) => {
    const name = trades[index];
    const inUseCount = usedTrades.filter((t) => t === name).length;
    const warnings: string[] = [];
    if (inUseCount > 0) {
      warnings.push(
        `${inUseCount} enrolled subcontractor${inUseCount !== 1 ? "s are" : " is"} assigned "${name}". They keep the label, but it will no longer be selectable for new vendors.`
      );
    }
    if (TRADES_WITH_COVERAGE_RULES.has(name)) {
      warnings.push(
        `"${name}" is a built-in trade with specific coverage rules (umbrella / professional / pollution). Removing it means future COIs for it fall back to your project's baseline checks only.`
      );
    }
    if (warnings.length > 0 && !window.confirm(`Remove "${name}"?\n\n${warnings.join("\n\n")}`)) {
      return;
    }
    setTrades(trades.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    // Trim, drop blanks, de-dupe (case-insensitive, keep first occurrence).
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const t of trades) {
      const name = t.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(name);
    }
    if (cleaned.length === 0) {
      alert("Keep at least one Trade Scope Package.");
      return;
    }
    setSaving(true);
    saveSettings({
      trades: cleaned,
      email_templates: {
        expired_template: expiredTemplate,
        insufficient_template: insufficientTemplate,
      },
    });
    setSaving(false);
    onClose();
  };

  const handleExport = () => {
    try {
      const json = exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shieldcoi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err?.message || err}`);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !window.confirm(
        "Importing replaces ALL current projects, subcontractors, COIs, and settings with the contents of this file. Continue?"
      )
    ) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy("import");
    try {
      const text = await file.text();
      importAllData(text);
      // Re-hydrate editing state from the imported settings.
      const s = getSettings();
      setTrades(s.trades);
      setExpiredTemplate(s.email_templates.expired_template);
      setInsufficientTemplate(s.email_templates.insufficient_template);
      await onDataReloaded();
      alert("Import complete.");
    } catch (err: any) {
      alert(`Import failed: ${err?.message || err}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset to the built-in sample dataset? This replaces your current records.")) return;
    setBusy("reset");
    try {
      await onResetMockData();
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        "Delete ALL projects, subcontractors, and COIs? This cannot be undone. Export a backup first if you want to keep this data."
      )
    ) {
      return;
    }
    setBusy("clear");
    try {
      clearAllData();
      await onDataReloaded();
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;

  return (
    <div id="settings-modal-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div id="settings-modal-card" className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 max-h-[88vh]">

        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="h-4.5 w-4.5 text-blue-600" />
            <span className="text-xs font-bold text-slate-900 font-display tracking-tight uppercase">
              Settings
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Trade Scope Packages */}
          <section className="space-y-2.5">
            <div>
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">
                Trade Scope Packages
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Options shown when enrolling a subcontractor.
              </p>
            </div>

            <div className="space-y-1.5">
              {trades.map((t, index) => {
                const hasRules = TRADES_WITH_COVERAGE_RULES.has(t);
                const inUse = usedSet.has(t);
                return (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={t}
                      onChange={(e) => renameTrade(index, e.target.value)}
                      className="flex-1 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800"
                    />
                    {hasRules && (
                      <span
                        title="Built-in trade with specific coverage rules in the compliance engine."
                        className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 cursor-help shrink-0"
                      >
                        Rules
                      </span>
                    )}
                    {inUse && (
                      <span
                        title="In use by one or more enrolled subcontractors."
                        className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0"
                      >
                        In use
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTrade(index)}
                      title={`Remove "${t}"`}
                      className="p-1 rounded cursor-pointer hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add new trade */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newTrade}
                onChange={(e) => setNewTrade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTrade();
                  }
                }}
                placeholder="Add a trade, e.g. Glazing"
                className="flex-1 text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800"
              />
              <button
                type="button"
                onClick={addTrade}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition-colors shrink-0"
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </button>
            </div>

            <p className="text-[9.5px] text-slate-500 leading-normal flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Custom trades are checked against each project's baseline limits only — the trade-specific
                umbrella, professional, and pollution rules apply to the built-in "Rules" trades.
              </span>
            </p>
          </section>

          {/* Default Email Templates */}
          <section className="space-y-2.5 border-t border-slate-200 pt-5">
            <div>
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">
                Default Email Templates
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Pre-filled into new projects. Existing projects keep their own saved templates.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Expired Policy Template
              </label>
              <textarea
                rows={5}
                value={expiredTemplate}
                onChange={(e) => setExpiredTemplate(e.target.value)}
                className="w-full text-xs font-sans bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Insufficient Limit Template
              </label>
              <textarea
                rows={5}
                value={insufficientTemplate}
                onChange={(e) => setInsufficientTemplate(e.target.value)}
                className="w-full text-xs font-sans bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
              />
            </div>
          </section>

          {/* Data Management */}
          <section className="space-y-2.5 border-t border-slate-200 pt-5">
            <div>
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">
                Data Management
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Everything is stored in this browser. Export a backup before clearing or importing.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={isBusy}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export backup</span>
              </button>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isBusy}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>{busy === "import" ? "Importing…" : "Import backup"}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleReset}
                disabled={isBusy}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Database className="h-3.5 w-3.5 text-slate-500" />
                <span>{busy === "reset" ? "Resetting…" : "Reset sample data"}</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={isBusy}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 rounded-md text-[11px] font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{busy === "clear" ? "Clearing…" : "Clear all records"}</span>
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
          <button
            onClick={onClose}
            type="button"
            className="px-3.5 py-1.5 bg-white text-slate-700 rounded-md font-bold text-[11px] hover:bg-slate-100 transition-colors border border-slate-200 shadow-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[11px] hover:shadow-xs transition-all uppercase tracking-wide cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
