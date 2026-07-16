import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppSettings, fetchSettings, saveSettings } from "./settingsService";

/**
 * App-wide settings, loaded once from Supabase and shared via context.
 *
 * Components read settings synchronously from here instead of fetching ad hoc.
 * The provider blocks rendering its children until the initial load completes,
 * so consumers always see a fully-loaded `settings` object.
 */
interface SettingsContextValue {
  settings: AppSettings;
  /** Persist and apply new settings (optimistic — updates the context immediately). */
  updateSettings: (next: AppSettings) => void;
  /** Re-read settings from the backend (e.g. after a data import). */
  reloadSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let active = true;
    fetchSettings().then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next); // optimistic
    void saveSettings(next);
  }, []);

  const reloadSettings = useCallback(() => {
    void fetchSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-4" />
        <span className="text-xs text-slate-500">Loading your workspace…</span>
      </div>
    );
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, reloadSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
