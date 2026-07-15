import React, { createContext, useCallback, useContext, useState } from "react";
import { AppSettings, getSettings, saveSettings } from "./settingsService";

/**
 * App-wide settings, loaded once and shared via context.
 *
 * Components read settings from here (synchronously) instead of calling
 * settingsService.getSettings() ad hoc during render. That decouples them from
 * the storage backend: when settings move from localStorage to Supabase, only
 * this provider's load/save changes — the consumers don't. Changing settings
 * updates the context, so the app reacts live.
 */
interface SettingsContextValue {
  settings: AppSettings;
  /** Persist and apply new settings (updates the context so the app re-renders). */
  updateSettings: (next: AppSettings) => void;
  /** Re-read settings from the source (e.g. after a data import). */
  reloadSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  const updateSettings = useCallback((next: AppSettings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const reloadSettings = useCallback(() => setSettings(getSettings()), []);

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
