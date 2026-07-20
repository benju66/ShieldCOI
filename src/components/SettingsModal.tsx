import React, { useEffect, useRef, useState } from "react";
import {
  Sliders,
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  Database,
  AlertTriangle,
  Bell,
  Building2,
  User,
  KeyRound,
  Tag,
} from "lucide-react";
import { fetchSettings, todayISO, ReminderSettings, DEFAULT_REMINDER_SETTINGS } from "../settingsService";
import { useSettings } from "../SettingsContext";
import { TradeRule, isNonEmptyRule } from "../tradeRules";
import { ProjectRequirements } from "../types";
import { exportAllData, importAllData, clearAllData } from "../dbService";
import {
  getOrg,
  getMyProfile,
  updateOrgName,
  updateMyProfile,
  updatePassword,
  MyProfile,
} from "../accountService";
import CurrencyInput from "./CurrencyInput";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Trade names currently referenced by enrolled subcontractors (for remove guardrails). */
  usedTrades: string[];
  /** Re-seed the sample dataset. */
  onResetMockData: () => void | Promise<void>;
  /** Called after import/clear so the app can re-hydrate from storage. */
  onDataReloaded: () => void | Promise<void>;
  /** Called after the org name / profile changes so the app can refresh the header. */
  onIdentityChanged?: () => void | Promise<void>;
}

type TabKey = "organization" | "profile" | "projects" | "trades" | "reminders" | "data";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "organization", label: "Organization", icon: Building2 },
  { key: "profile", label: "My Profile", icon: User },
  { key: "projects", label: "Project Defaults", icon: Sliders },
  { key: "trades", label: "Trades & Rules", icon: Tag },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "data", label: "Data", icon: Database },
];

const LABEL = "text-[9px] font-bold text-blue-600 uppercase tracking-wider block";
const DESC = "text-[10px] text-slate-500 mt-0.5";

export default function SettingsModal({
  isOpen,
  onClose,
  usedTrades,
  onResetMockData,
  onDataReloaded,
  onIdentityChanged,
}: SettingsModalProps) {
  const { settings, updateSettings, reloadSettings } = useSettings();
  const [tab, setTab] = useState<TabKey>("organization");
  const [defaultReqs, setDefaultReqs] = useState<ProjectRequirements>(() => ({ ...settings.default_requirements }));
  const [trades, setTrades] = useState<string[]>([]);
  const [newTrade, setNewTrade] = useState("");
  const [tradeRules, setTradeRules] = useState<Record<string, TradeRule>>({});
  const [newRuleTrade, setNewRuleTrade] = useState("");
  const [expiredTemplate, setExpiredTemplate] = useState("");
  const [insufficientTemplate, setInsufficientTemplate] = useState("");
  const [evalMode, setEvalMode] = useState<"today" | "fixed">("today");
  const [evalDateOverride, setEvalDateOverride] = useState(todayISO());
  const [reminders, setReminders] = useState<ReminderSettings>(() => ({ ...DEFAULT_REMINDER_SETTINGS }));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Identity (org + this user's profile) — loaded lazily when the modal opens.
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [fullNameDraft, setFullNameDraft] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Hydrate local editing state each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    const s = settings;
    setDefaultReqs({ ...s.default_requirements });
    setTrades(s.trades);
    setTradeRules(JSON.parse(JSON.stringify(s.trade_rules || {})));
    setExpiredTemplate(s.email_templates.expired_template);
    setInsufficientTemplate(s.email_templates.insufficient_template);
    setEvalMode(s.evaluation_date ? "fixed" : "today");
    setEvalDateOverride(s.evaluation_date || todayISO());
    setReminders({ ...DEFAULT_REMINDER_SETTINGS, ...s.reminder_settings });
    setNewTrade("");
    setNewRuleTrade("");
    setTab("organization");
    setPwNew("");
    setPwConfirm("");
    setPwMsg(null);
    setIdentityLoaded(false);

    let active = true;
    (async () => {
      try {
        const [org, prof] = await Promise.all([getOrg(), getMyProfile()]);
        if (!active) return;
        setOrgName(org?.name ?? "");
        setOrgNameDraft(org?.name ?? "");
        setProfile(prof);
        setFullNameDraft(prof?.full_name ?? "");
      } catch (err) {
        console.error("Failed to load organization / profile:", err);
      } finally {
        if (active) setIdentityLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const usedSet = new Set(usedTrades);
  const isOwner = profile?.role === "owner";

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
    if (isNonEmptyRule(tradeRules[name])) {
      warnings.push(`Its coverage rule will also be deleted.`);
    }
    if (warnings.length > 0 && !window.confirm(`Remove "${name}"?\n\n${warnings.join("\n\n")}`)) {
      return;
    }
    setTrades(trades.filter((_, i) => i !== index));
    if (tradeRules[name]) {
      const next = { ...tradeRules };
      delete next[name];
      setTradeRules(next);
    }
  };

  // --- Trade coverage rules ---
  const setRuleField = (trade: string, field: keyof TradeRule, value: number) => {
    setTradeRules({ ...tradeRules, [trade]: { ...tradeRules[trade], [field]: value } });
  };

  const addRule = () => {
    if (!newRuleTrade) return;
    if (!tradeRules[newRuleTrade]) {
      setTradeRules({ ...tradeRules, [newRuleTrade]: {} });
    }
    setNewRuleTrade("");
  };

  const removeRule = (trade: string) => {
    const next = { ...tradeRules };
    delete next[trade];
    setTradeRules(next);
  };

  const setReq = (field: keyof ProjectRequirements, value: number | boolean) =>
    setDefaultReqs((prev) => ({ ...prev, [field]: value }));

  // --- Reminder cadence ---
  const REMINDER_DAY_OPTIONS = [7, 14, 30, 60, 90];
  const toggleReminderDay = (day: number) =>
    setReminders((prev) => {
      const has = prev.days_before.includes(day);
      const next = has ? prev.days_before.filter((d) => d !== day) : [...prev.days_before, day];
      return { ...prev, days_before: next.sort((a, b) => b - a) };
    });
  const setReminderField = <K extends keyof ReminderSettings>(field: K, value: ReminderSettings[K]) =>
    setReminders((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
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
      setTab("trades");
      return;
    }
    // Keep only non-empty rules for trades that still exist.
    const cleanedTradeSet = new Set(cleaned);
    const cleanedRules: Record<string, TradeRule> = {};
    for (const t of Object.keys(tradeRules)) {
      const rule: TradeRule | undefined = tradeRules[t];
      if (!rule || !cleanedTradeSet.has(t) || !isNonEmptyRule(rule)) continue;
      cleanedRules[t] = {
        umbrella: rule.umbrella || undefined,
        professionalLiability: rule.professionalLiability || undefined,
        pollutionLiability: rule.pollutionLiability || undefined,
      };
    }

    setSaving(true);
    try {
      // Org-wide app settings (optimistic; persists in the background).
      updateSettings({
        default_requirements: defaultReqs,
        trades: cleaned,
        trade_rules: cleanedRules,
        email_templates: {
          expired_template: expiredTemplate,
          insufficient_template: insufficientTemplate,
        },
        evaluation_date: evalMode === "fixed" && evalDateOverride ? evalDateOverride : null,
        reminder_settings: {
          ...reminders,
          days_before: [...reminders.days_before].sort((a, b) => b - a),
        },
      });

      // Organization name (owner-only, enforced by RLS) — only when changed.
      const nextOrgName = orgNameDraft.trim();
      let identityChanged = false;
      if (isOwner && nextOrgName && nextOrgName !== orgName) {
        await updateOrgName(nextOrgName);
        identityChanged = true;
      }

      // This user's display name — only when changed.
      const nextFullName = fullNameDraft.trim();
      if (nextFullName !== (profile?.full_name ?? "")) {
        await updateMyProfile({ full_name: nextFullName || null });
        identityChanged = true;
      }

      if (identityChanged) await onIdentityChanged?.();
      onClose();
    } catch (err: any) {
      alert(`Save failed: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwNew.length < 6) {
      setPwMsg({ ok: false, text: "Use at least 6 characters." });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      await updatePassword(pwNew);
      setPwNew("");
      setPwConfirm("");
      setPwMsg({ ok: true, text: "Password updated." });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err?.message || "Failed to update password." });
    } finally {
      setPwBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportAllData();
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
      await importAllData(text);
      reloadSettings(); // sync the app-wide settings context to the imported data
      // Re-hydrate this modal's editing state from the imported settings.
      const s = await fetchSettings();
      setDefaultReqs({ ...s.default_requirements });
      setTrades(s.trades);
      setTradeRules(JSON.parse(JSON.stringify(s.trade_rules || {})));
      setExpiredTemplate(s.email_templates.expired_template);
      setInsufficientTemplate(s.email_templates.insufficient_template);
      setReminders({ ...DEFAULT_REMINDER_SETTINGS, ...s.reminder_settings });
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
      await clearAllData();
      await onDataReloaded();
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;
  const inputCls =
    "w-full text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800";

  return (
    <div id="settings-modal-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div id="settings-modal-card" className="w-full max-w-3xl bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 h-[600px] max-h-[88vh]">

        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
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

        {/* Body: sidebar nav + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <nav id="settings-tabs" className="w-40 sm:w-44 shrink-0 border-r border-slate-200 bg-slate-50/60 p-2 space-y-0.5 overflow-y-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-left cursor-pointer transition-colors ${
                  tab === key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">

            {/* Organization */}
            {tab === "organization" && (
              <section className="space-y-2.5">
                <div>
                  <span className={LABEL}>Organization</span>
                  <p className={DESC}>
                    Your company name for this workspace — shown in the header and on outgoing notices.
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">Organization name</label>
                  <input
                    type="text"
                    value={orgNameDraft}
                    onChange={(e) => setOrgNameDraft(e.target.value)}
                    disabled={!identityLoaded || !isOwner}
                    placeholder={identityLoaded ? "Your company name" : "Loading…"}
                    className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-500`}
                  />
                  {identityLoaded && !isOwner && (
                    <p className="text-[9.5px] text-amber-600 mt-1 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>Only an owner can rename the organization.</span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* My Profile */}
            {tab === "profile" && (
              <div className="space-y-6">
                <section className="space-y-2.5">
                  <div>
                    <span className={LABEL}>My Profile</span>
                    <p className={DESC}>
                      How you appear in ShieldCOI. Your email is your sign-in and can't be changed here.
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Display name</label>
                      <input
                        type="text"
                        value={fullNameDraft}
                        onChange={(e) => setFullNameDraft(e.target.value)}
                        disabled={!identityLoaded}
                        placeholder={identityLoaded ? "e.g. Jordan Smith" : "Loading…"}
                        className={inputCls}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">Email</label>
                        <input
                          type="text"
                          value={profile?.email ?? ""}
                          disabled
                          className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">Role</label>
                        <input
                          type="text"
                          value={profile?.role ?? ""}
                          disabled
                          className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed capitalize`}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Change password */}
                <section className="space-y-2.5 border-t border-slate-200 pt-5">
                  <div>
                    <span className={`${LABEL} flex items-center gap-1`}>
                      <KeyRound className="h-3 w-3" />
                      Change password
                    </span>
                    <p className={DESC}>Set a new password for your account. Minimum 6 characters.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">New password</label>
                      <input
                        type="password"
                        value={pwNew}
                        onChange={(e) => setPwNew(e.target.value)}
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Confirm password</label>
                      <input
                        type="password"
                        value={pwConfirm}
                        onChange={(e) => setPwConfirm(e.target.value)}
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  {pwMsg && (
                    <p className={`text-[10px] font-semibold ${pwMsg.ok ? "text-green-600" : "text-red-600"}`}>
                      {pwMsg.text}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={pwBusy || !pwNew || !pwConfirm}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                    <span>{pwBusy ? "Updating…" : "Update password"}</span>
                  </button>
                </section>
              </div>
            )}

            {/* Project Defaults: requirements + email templates + evaluation date */}
            {tab === "projects" && (
              <div className="space-y-6">
                {/* Default project requirements */}
                <section className="space-y-2.5">
                  <div>
                    <span className={LABEL}>Default project requirements</span>
                    <p className={DESC}>
                      Your "house minimum" insurance limits, pre-filled into every new project. Existing projects keep
                      their own saved requirements.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {([
                      ["gl_occurrence", "GL — Each Occurrence"],
                      ["gl_aggregate", "GL — General Aggregate"],
                      ["auto_limit", "Automobile — Combined"],
                      ["gl_products_completed", "GL — Products-Completed"],
                      ["umbrella_limit", "Umbrella / Excess"],
                      ["employers_liability_accident", "Employers' Liab — Accident"],
                      ["employers_liability_disease_person", "Employers' Liab — Disease (Person)"],
                      ["employers_liability_disease_limit", "Employers' Liab — Disease (Limit)"],
                      ["professional_liability", "Professional Liab (baseline)"],
                      ["pollution_liability", "Pollution Liab (baseline)"],
                    ] as [keyof ProjectRequirements, string][]).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5">{label}</label>
                        <CurrencyInput
                          value={(defaultReqs[key] as number) ?? 0}
                          onChange={(v) => setReq(key, v ?? 0)}
                          placeholder="—"
                          className="w-full text-[11px] font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1 text-slate-800"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={defaultReqs.workers_comp}
                        onChange={(e) => setReq("workers_comp", e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-800 font-semibold">Require Workers' Comp</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-semibold">Alert window</span>
                      <select
                        value={defaultReqs.warn_days_out}
                        onChange={(e) => setReq("warn_days_out", Number(e.target.value))}
                        className="text-[11px] bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1 text-slate-800 cursor-pointer"
                      >
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Default Email Templates */}
                <section className="space-y-2.5 border-t border-slate-200 pt-5">
                  <div>
                    <span className={LABEL}>Default Email Templates</span>
                    <p className={DESC}>
                      Pre-filled into new projects. Existing projects keep their own saved templates.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Expired Policy Template</label>
                    <textarea
                      rows={5}
                      value={expiredTemplate}
                      onChange={(e) => setExpiredTemplate(e.target.value)}
                      className="w-full text-xs font-sans bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Insufficient Limit Template</label>
                    <textarea
                      rows={5}
                      value={insufficientTemplate}
                      onChange={(e) => setInsufficientTemplate(e.target.value)}
                      className="w-full text-xs font-sans bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
                    />
                  </div>
                </section>

                {/* Evaluation date */}
                <section className="space-y-2.5 border-t border-slate-200 pt-5">
                  <div>
                    <span className={LABEL}>Evaluation date</span>
                    <p className={DESC}>
                      The date compliance checks treat as "today" for expiration and expiring-soon warnings.
                    </p>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="eval-mode"
                      checked={evalMode === "today"}
                      onChange={() => setEvalMode("today")}
                      className="mt-0.5 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-800">
                      <span className="font-bold">Use today's date</span>
                      <span className="block text-[10px] text-slate-500">Recommended — evaluates against the current date ({todayISO()}).</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="eval-mode"
                      checked={evalMode === "fixed"}
                      onChange={() => setEvalMode("fixed")}
                      className="mt-0.5 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-800">
                      <span className="font-bold">Use a fixed date</span>
                      <span className="block text-[10px] text-slate-500">Pin evaluation to a specific date — handy for demoing the sample data.</span>
                    </span>
                  </label>

                  {evalMode === "fixed" && (
                    <input
                      type="date"
                      value={evalDateOverride}
                      onChange={(e) => setEvalDateOverride(e.target.value)}
                      className="ml-6 text-xs font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800"
                    />
                  )}
                </section>
              </div>
            )}

            {/* Trades & Rules */}
            {tab === "trades" && (
              <div className="space-y-6">
                {/* Trade Scope Packages */}
                <section className="space-y-2.5">
                  <div>
                    <span className={LABEL}>Trade Scope Packages</span>
                    <p className={DESC}>Options shown when enrolling a subcontractor.</p>
                  </div>

                  <div className="space-y-1.5">
                    {trades.map((t, index) => {
                      const hasRules = isNonEmptyRule(tradeRules[t]);
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
                              title="Has a coverage rule configured (see Trade coverage rules below)."
                              className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 cursor-help shrink-0"
                            >
                              Rule
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
                      Every trade is checked against the project's baseline limits. Add a coverage rule below to
                      require extra insurance for a specific trade (e.g. an "Electrical – Design Build" trade that
                      needs professional liability).
                    </span>
                  </p>
                </section>

                {/* Trade coverage rules */}
                <section className="space-y-2.5 border-t border-slate-200 pt-5">
                  <div>
                    <span className={LABEL}>Trade coverage rules</span>
                    <p className={DESC}>
                      Extra coverage required for specific trades, above the project baseline. Trades without a rule
                      use the project baseline only. A rule can only raise a requirement, never lower it.
                    </p>
                  </div>

                  {Object.keys(tradeRules).length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic py-1">No trade rules — every trade uses the project baseline.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.keys(tradeRules).map((t) => {
                        const rule = tradeRules[t];
                        const stillListed = trades.includes(t);
                        return (
                          <div key={t} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/40 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${stillListed ? "text-slate-800" : "text-red-600"}`}>
                                {t}
                                {!stillListed && <span className="ml-1 text-[9px] font-normal">(trade removed)</span>}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeRule(t)}
                                title={`Remove rule for "${t}"`}
                                className="p-1 rounded cursor-pointer hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Umbrella</label>
                                <CurrencyInput
                                  value={rule.umbrella ?? 0}
                                  onChange={(v) => setRuleField(t, "umbrella", v ?? 0)}
                                  placeholder="—"
                                  className="w-full text-[11px] font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1 text-slate-800"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Professional</label>
                                <CurrencyInput
                                  value={rule.professionalLiability ?? 0}
                                  onChange={(v) => setRuleField(t, "professionalLiability", v ?? 0)}
                                  placeholder="—"
                                  className="w-full text-[11px] font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1 text-slate-800"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Pollution</label>
                                <CurrencyInput
                                  value={rule.pollutionLiability ?? 0}
                                  onChange={(v) => setRuleField(t, "pollutionLiability", v ?? 0)}
                                  placeholder="—"
                                  className="w-full text-[11px] font-mono bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1 text-slate-800"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add a rule */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={newRuleTrade}
                      onChange={(e) => setNewRuleTrade(e.target.value)}
                      className="flex-1 text-xs bg-white border border-slate-200 focus:border-blue-500 focus:outline-none rounded p-1.5 text-slate-800 cursor-pointer"
                    >
                      <option value="">Add a rule for…</option>
                      {trades
                        .filter((t) => !tradeRules[t])
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={addRule}
                      disabled={!newRuleTrade}
                      className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition-colors shrink-0 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add rule</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* Automated reminders */}
            {tab === "reminders" && (
              <section className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`${LABEL} flex items-center gap-1`}>
                      <Bell className="h-3 w-3" />
                      Automated reminders
                    </span>
                    <p className={DESC}>
                      A daily check flags certificates that are expiring soon (or have lapsed) so nothing slips through.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                    <input
                      type="checkbox"
                      checked={reminders.enabled}
                      onChange={(e) => setReminderField("enabled", e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-800">{reminders.enabled ? "On" : "Off"}</span>
                  </label>
                </div>

                <div className={reminders.enabled ? "space-y-3" : "space-y-3 opacity-40 pointer-events-none"}>
                  {/* Day thresholds */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1.5">Remind this many days before expiry</label>
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_DAY_OPTIONS.map((day) => {
                        const active = reminders.days_before.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleReminderDay(day)}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer transition-colors ${
                              active
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {day}d
                          </button>
                        );
                      })}
                    </div>
                    {reminders.days_before.length === 0 && (
                      <p className="text-[9.5px] text-amber-600 mt-1">
                        No advance reminders selected — only lapse notices (if enabled below) will fire.
                      </p>
                    )}
                  </div>

                  {/* Also on expiry */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reminders.also_on_expiry}
                      onChange={(e) => setReminderField("also_on_expiry", e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-800 font-semibold">Also send a notice when a certificate lapses</span>
                  </label>

                  {/* Channels */}
                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/40 space-y-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Delivery</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reminders.notify_team}
                        onChange={(e) => setReminderField("notify_team", e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-800 font-semibold">
                        Notify your team <span className="font-normal text-slate-500">(in-app alerts)</span>
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reminders.email_enabled}
                        onChange={(e) => setReminderField("email_enabled", e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-800 font-semibold">
                        Send email <span className="font-normal text-slate-500">(team &amp; / or vendors)</span>
                      </span>
                    </label>

                    {reminders.email_enabled && (
                      <label className="flex items-center gap-2 cursor-pointer ml-5">
                        <input
                          type="checkbox"
                          checked={reminders.notify_vendor}
                          onChange={(e) => setReminderField("notify_vendor", e.target.checked)}
                          className="cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-800">
                          Email the vendor directly <span className="text-slate-500">(where a contact email is on file)</span>
                        </span>
                      </label>
                    )}

                    <p className="text-[9.5px] text-slate-500 leading-normal flex items-start gap-1 pt-0.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        In-app alerts work now. Email stays off until an email provider is connected server-side — until
                        then these email options are saved but nothing is sent.
                      </span>
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Data Management */}
            {tab === "data" && (
              <section className="space-y-2.5">
                <div>
                  <span className={LABEL}>Data Management</span>
                  <p className={DESC}>
                    Your organization's records live in Supabase. Export a backup before clearing or importing.
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
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2 shrink-0">
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
