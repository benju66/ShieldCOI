/**
 * Org-level application settings, persisted to localStorage alongside the record
 * collections in dbService. Kept as a single swappable module so a later Supabase
 * migration only has to touch this file (same pattern as dbService).
 */

import { TradeRule } from "./tradeRules";
import { ProjectRequirements } from "./types";

export interface AppSettings {
  /** Org "house minimum" insurance requirements pre-filled into new projects. */
  default_requirements: ProjectRequirements;
  /** Trade Scope Package options shown when enrolling a subcontractor. */
  trades: string[];
  /**
   * User-defined trade coverage rules (umbrella / professional / pollution
   * required for specific trades, above the project baseline). Ships empty —
   * trades without a rule are checked against the project baseline only.
   */
  trade_rules: Record<string, TradeRule>;
  /** Default notice templates pre-filled into new projects. */
  email_templates: {
    expired_template: string;
    insufficient_template: string;
  };
  /**
   * The date compliance checks treat as "today" (expiration / warning grace).
   * `null` means use the real current date; a "YYYY-MM-DD" string pins it to a
   * fixed date (useful for demos/testing against the sample data).
   */
  evaluation_date: string | null;
}

const KEY_SETTINGS = "shieldcoi_settings";

/** The built-in Trade Scope Package labels offered out of the box. */
export const DEFAULT_TRADES: string[] = [
  "Environmental",
  "Surveying",
  "Earthwork",
  "Concrete (Precast)",
  "Concrete (with Crane)",
  "Concrete (Standard)",
  "Masonry",
  "Rough Carpentry (with Crane)",
  "Rough Carpentry (Standard)",
  "Siding",
  "Roofing",
  "Windows",
  "Drywall",
  "Pool",
  "Elevators",
  "Fire Sprinkler",
  "Plumbing",
  "HVAC",
  "Electrical",
  "Other Trades",
];

export const DEFAULT_EXPIRED_TEMPLATE = `Dear [Subcontractor Name],

This is to notify you that your Certificate of Insurance (COI) for [Project Name] has expired or is about to expire. Please submit a renewed COI as soon as possible to ensure project compliance and avoid payment delays.

Thank you,
Project Management Team`;

export const DEFAULT_INSUFFICIENT_TEMPLATE = `Dear [Subcontractor Name],

We have reviewed your Certificate of Insurance (COI) uploaded for [Project Name]. Our verification indicates that some of your coverage limits do not meet the minimum contract requirements. Please contact your insurance agent to obtain an endorsement or an updated COI satisfying the required limits.

Thank you,
Project Management Team`;

/** Built-in "house minimum" requirements for a new project. */
export const DEFAULT_PROJECT_REQUIREMENTS: ProjectRequirements = {
  gl_occurrence: 2_000_000,
  gl_aggregate: 4_000_000,
  auto_limit: 1_000_000,
  workers_comp: true,
  warn_days_out: 60,
  gl_products_completed: 2_000_000,
  umbrella_limit: 1_000_000,
  employers_liability_accident: 1_000_000,
  employers_liability_disease_person: 1_000_000,
  employers_liability_disease_limit: 1_000_000,
  professional_liability: 0,
  pollution_liability: 0,
};

export const DEFAULT_SETTINGS: AppSettings = {
  default_requirements: DEFAULT_PROJECT_REQUIREMENTS,
  trades: DEFAULT_TRADES,
  trade_rules: {},
  email_templates: {
    expired_template: DEFAULT_EXPIRED_TEMPLATE,
    insufficient_template: DEFAULT_INSUFFICIENT_TEMPLATE,
  },
  evaluation_date: null,
};

/**
 * Read the current settings, merged over defaults so a partial/legacy stored
 * object never leaves a field undefined.
 */
export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS, email_templates: { ...DEFAULT_SETTINGS.email_templates } };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      default_requirements: { ...DEFAULT_PROJECT_REQUIREMENTS, ...(parsed.default_requirements || {}) },
      trades:
        Array.isArray(parsed.trades) && parsed.trades.length > 0
          ? parsed.trades
          : [...DEFAULT_TRADES],
      trade_rules:
        parsed.trade_rules && typeof parsed.trade_rules === "object" ? parsed.trade_rules : {},
      email_templates: {
        expired_template: parsed.email_templates?.expired_template ?? DEFAULT_EXPIRED_TEMPLATE,
        insufficient_template:
          parsed.email_templates?.insufficient_template ?? DEFAULT_INSUFFICIENT_TEMPLATE,
      },
      evaluation_date: typeof parsed.evaluation_date === "string" ? parsed.evaluation_date : null,
    };
  } catch (err) {
    console.error("Failed to read settings from localStorage:", err);
    return { ...DEFAULT_SETTINGS, email_templates: { ...DEFAULT_SETTINGS.email_templates } };
  }
}

/** Today's date as a "YYYY-MM-DD" string, in local time. */
export function todayISO(): string {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * The date compliance checks should treat as "today": the configured override
 * if set, otherwise the real current date.
 */
export function getEvaluationDate(): string {
  return getSettings().evaluation_date || todayISO();
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save settings to localStorage:", err);
  }
}

/** Restore built-in defaults (removes the stored override). */
export function resetSettings(): void {
  try {
    localStorage.removeItem(KEY_SETTINGS);
  } catch (err) {
    console.error("Failed to reset settings:", err);
  }
}
