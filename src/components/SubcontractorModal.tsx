import React, { useState, useEffect } from "react";
import { UserPlus, X } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { useSettings } from "../SettingsContext";

interface SubcontractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onAdd: (companyName: string, trade: string, contractValue: number, vendorType: "Subcontractor" | "Supplier") => Promise<void>;
}

export default function SubcontractorModal({ isOpen, onClose, projectName, onAdd }: SubcontractorModalProps) {
  const { settings } = useSettings();
  const [companyName, setCompanyName] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [trade, setTrade] = useState("");
  const [contractValue, setContractValue] = useState(150000);
  const [vendorType, setVendorType] = useState<"Subcontractor" | "Supplier">("Subcontractor");
  const [submitting, setSubmitting] = useState(false);

  // Load the configurable Trade Scope Package list when the modal opens.
  useEffect(() => {
    if (isOpen) {
      const list = settings.trades;
      setTrades(list);
      setTrade((cur) => (cur && list.includes(cur) ? cur : list[0] || ""));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !trade.trim() || contractValue <= 0) {
      alert("Please provide valid subscriber and contract details.");
      return;
    }

    try {
      setSubmitting(true);
      await onAdd(companyName, trade, Number(contractValue), vendorType);
      setCompanyName("");
      setTrade(trades[0] || "");
      setContractValue(150000);
      setVendorType("Subcontractor");
      onClose();
    } catch (err) {
      alert("Failed to enroll subcontractor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="subcontractor-modal-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
      <div id="subcontractor-modal-card" className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div id="subcontractor-modal-header" className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserPlus className="h-4.5 w-4.5 text-blue-600" />
            <div>
              <h2 id="subcontractor-modal-title" className="text-xs font-bold text-slate-900 font-display tracking-tight uppercase">
                Add Subcontractor
              </h2>
              <p className="text-[10px] text-slate-500">Enrolling vendor for {projectName}</p>
            </div>
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Company Name */}
          <div>
            <label htmlFor="subcontractor-company-name" className="block text-[11px] font-bold text-slate-700 mb-1">
              Company / Vendor Name *
            </label>
            <input
              id="subcontractor-company-name"
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Paramount Glazing Inc."
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
            />
          </div>

          {/* Vendor Classification */}
          <div>
            <label htmlFor="subcontractor-vendor-type" className="block text-[11px] font-bold text-slate-700 mb-1">
              Company Vendor Classification *
            </label>
            <select
              id="subcontractor-vendor-type"
              required
              value={vendorType}
              onChange={(e) => setVendorType(e.target.value as "Subcontractor" | "Supplier")}
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800 cursor-pointer"
            >
              <option value="Subcontractor">Subcontractor</option>
              <option value="Supplier">Supplier</option>
            </select>
          </div>

          {/* Trade Package */}
          <div>
            <label htmlFor="subcontractor-trade-package" className="block text-[11px] font-bold text-slate-700 mb-1">
              Trade Scope Package *
            </label>
            <select
              id="subcontractor-trade-package"
              required
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800 cursor-pointer"
            >
              {trades.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Contract Value */}
          <div>
            <label htmlFor="subcontractor-contract-value" className="block text-[11px] font-bold text-slate-700 mb-1">
              Assigned Contract Value ($) *
            </label>
            <CurrencyInput
              id="subcontractor-contract-value"
              required
              value={contractValue}
              onChange={(v) => setContractValue(v ?? 0)}
              placeholder="e.g. $150,000"
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
            />
          </div>

          {/* Footer Actions */}
          <div id="subcontractor-modal-footer" className="pt-3 border-t border-slate-250 flex justify-end space-x-2">
            <button
              onClick={onClose}
              type="button"
              className="px-3 py-1.5 bg-white text-slate-700 rounded-md font-bold text-[11px] hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[11px] hover:shadow-xs transition-all uppercase tracking-wide cursor-pointer"
            >
              {submitting ? "Enrolling..." : "Enroll Sub"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
