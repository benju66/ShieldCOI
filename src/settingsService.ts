/**
 * Org-level application settings, persisted to localStorage alongside the record
 * collections in dbService. Kept as a single swappable module so a later Supabase
 * migration only has to touch this file (same pattern as dbService).
 */

import { TradeRule } from "./tradeRules";
import { ProjectRequirements } from "./types";
import { supabase, currentOrgId } from "./supabaseClient";

/**
 * Configurable cadence + channels for the scheduled COI-expiration reminder
 * engine (a daily edge function). `days_before` are the day thresholds to remind
 * ahead of expiry (a stepped cadence — a cert is notified once as it crosses
 * each tighter window); `also_on_expiry` adds one notice when it lapses. In-app
 * notices go to the team whenever `notify_team` is on; email is a separate,
 * off-by-default channel gated by `email_enabled` (and needs a provider secret
 * configured server-side before it actually sends).
 */
export interface ReminderSettings {
  enabled: boolean;
  days_before: number[];
  also_on_expiry: boolean;
  notify_team: boolean;
  notify_vendor: boolean;
  email_enabled: boolean;
}

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
  /** Scheduled COI-expiration reminder cadence + channels. */
  reminder_settings: ReminderSettings;
}

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

/** Built-in reminder cadence: stepped 30/7-days-out plus an expiry notice, in-app to the team. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  days_before: [30, 7],
  also_on_expiry: true,
  notify_team: true,
  notify_vendor: false,
  email_enabled: false,
};

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
  reminder_settings: DEFAULT_REMINDER_SETTINGS,
};

/** Normalize a partial reminder-settings object over the built-in defaults. */
function mergeReminderSettings(p: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  const r = p || {};
  const days = Array.isArray(r.days_before)
    ? r.days_before.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : DEFAULT_REMINDER_SETTINGS.days_before;
  return {
    enabled: r.enabled !== false,
    days_before: days.length ? days : DEFAULT_REMINDER_SETTINGS.days_before,
    also_on_expiry: r.also_on_expiry !== false,
    notify_team: r.notify_team !== false,
    notify_vendor: r.notify_vendor === true,
    email_enabled: r.email_enabled === true,
  };
}

/** Normalize a partial settings object (from storage) over the built-in defaults. */
function mergeSettings(parsed: Partial<AppSettings> | null | undefined): AppSettings {
  const p = parsed || {};
  return {
    default_requirements: { ...DEFAULT_PROJECT_REQUIREMENTS, ...(p.default_requirements || {}) },
    trades: Array.isArray(p.trades) && p.trades.length > 0 ? p.trades : [...DEFAULT_TRADES],
    trade_rules: p.trade_rules && typeof p.trade_rules === "object" ? p.trade_rules : {},
    email_templates: {
      expired_template: p.email_templates?.expired_template ?? DEFAULT_EXPIRED_TEMPLATE,
      insufficient_template: p.email_templates?.insufficient_template ?? DEFAULT_INSUFFICIENT_TEMPLATE,
    },
    evaluation_date: typeof p.evaluation_date === "string" ? p.evaluation_date : null,
    reminder_settings: mergeReminderSettings(p.reminder_settings),
  };
}

/** Load the current org's settings from Supabase, merged over defaults. */
export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("org_settings")
    .select("default_requirements, trades, trade_rules, email_templates, evaluation_date, reminder_settings")
    .maybeSingle();
  if (error) {
    console.error("Failed to load settings:", error.message);
    return mergeSettings(null);
  }
  return mergeSettings(data as Partial<AppSettings> | null);
}

/** Persist the current org's settings to Supabase. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const orgId = await currentOrgId();
  const { error } = await supabase
    .from("org_settings")
    .update({
      default_requirements: settings.default_requirements,
      trades: settings.trades,
      trade_rules: settings.trade_rules,
      email_templates: settings.email_templates,
      evaluation_date: settings.evaluation_date,
      reminder_settings: settings.reminder_settings,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
  if (error) console.error("Failed to save settings:", error.message);
}

/** Today's date as a "YYYY-MM-DD" string, in local time. */
export function todayISO(): string {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}
