/**
 * Org-level application settings, persisted to localStorage alongside the record
 * collections in dbService. Kept as a single swappable module so a later Supabase
 * migration only has to touch this file (same pattern as dbService).
 *
 * Phase 1 scope: the editable Trade Scope Package list and the default email
 * templates used when creating a new project. Data-management operations
 * (export / import / reset) live in dbService since it owns the record keys.
 */

export interface AppSettings {
  /** Trade Scope Package options shown when enrolling a subcontractor. */
  trades: string[];
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

/**
 * The built-in Trade Scope Packages. NOTE: these names are also referenced by
 * complianceEngine.ts, which attaches trade-specific coverage rules (elevated
 * umbrella tiers, professional & pollution liability) to them by exact string
 * match. Renaming or removing a built-in trade here does NOT remove those rules
 * — a COI for a renamed/removed trade simply falls back to the project's
 * baseline checks. See TRADES_WITH_COVERAGE_RULES.
 */
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

/** Built-in trades carry trade-specific coverage rules in the compliance engine. */
export const TRADES_WITH_COVERAGE_RULES: ReadonlySet<string> = new Set(DEFAULT_TRADES);

export const DEFAULT_EXPIRED_TEMPLATE = `Dear [Subcontractor Name],

This is to notify you that your Certificate of Insurance (COI) for [Project Name] has expired or is about to expire. Please submit a renewed COI as soon as possible to ensure project compliance and avoid payment delays.

Thank you,
Project Management Team`;

export const DEFAULT_INSUFFICIENT_TEMPLATE = `Dear [Subcontractor Name],

We have reviewed your Certificate of Insurance (COI) uploaded for [Project Name]. Our verification indicates that some of your coverage limits do not meet the minimum contract requirements. Please contact your insurance agent to obtain an endorsement or an updated COI satisfying the required limits.

Thank you,
Project Management Team`;

export const DEFAULT_SETTINGS: AppSettings = {
  trades: DEFAULT_TRADES,
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
      trades:
        Array.isArray(parsed.trades) && parsed.trades.length > 0
          ? parsed.trades
          : [...DEFAULT_TRADES],
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
