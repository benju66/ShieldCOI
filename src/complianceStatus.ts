import { ComplianceStatus } from "./types";

/**
 * One canonical home for how each compliance status behaves.
 *
 * Every table here is a `Record<ComplianceStatus, ...>`, so adding or removing
 * a status is a compile error until each behaviour is decided explicitly.
 * Call sites ask these helpers instead of comparing string literals — a new
 * status can then never silently fall through an `else` and vanish from a
 * dashboard count.
 */

/** Higher = more attention-worthy. Drives vendor roll-up and sort order. */
export const STATUS_SEVERITY: Record<ComplianceStatus, number> = {
  Expired: 5,
  "Insufficient Coverage": 4,
  "Pending Upload": 3,
  // A certificate arrived but at least one value could not be read. Ranked
  // below "no certificate at all" — we probably have coverage, we just can't
  // prove it yet — but never treated as passing.
  "Needs Review": 2,
  "Approved Exception": 1,
  Compliant: 0,
};

/** Shared badge palette (vendor table, project table, print report). */
export const STATUS_BADGE_CLASS: Record<ComplianceStatus, string> = {
  Compliant: "text-emerald-800 bg-emerald-50 border-emerald-200/80",
  Expired: "text-red-800 bg-red-50 border-red-200/80 font-bold",
  "Insufficient Coverage": "text-amber-800 bg-amber-50 border-amber-200/80",
  "Needs Review": "text-violet-800 bg-violet-50 border-violet-200/80",
  "Approved Exception": "text-indigo-800 bg-indigo-50 border-indigo-200/80 font-bold",
  "Pending Upload": "text-slate-650 bg-slate-50 border-slate-250",
};

/**
 * Does this status count toward the compliance rate?
 * "Needs Review" deliberately does NOT — an unreadable certificate is never an
 * automatic pass.
 */
export const COUNTS_AS_COMPLIANT: Record<ComplianceStatus, boolean> = {
  Compliant: true,
  "Approved Exception": true,
  Expired: false,
  "Insufficient Coverage": false,
  "Needs Review": false,
  "Pending Upload": false,
};

/**
 * Is this a confirmed breach — a coverage problem we can actually assert?
 * Backs the "Flagged Breaches" dashboard tile, so it stays narrower than
 * NEEDS_ATTENTION: "Needs Review" is an unknown, not a breach, and "Pending
 * Upload" has never been counted here.
 */
export const COUNTS_AS_BREACH: Record<ComplianceStatus, boolean> = {
  Expired: true,
  "Insufficient Coverage": true,
  "Needs Review": false,
  "Pending Upload": false,
  Compliant: false,
  "Approved Exception": false,
};

/**
 * Does this status belong in the "Needs Attention" list?
 * Every non-passing status must appear here, or a sub can be non-compliant and
 * yet show up nowhere a reviewer would look.
 */
export const NEEDS_ATTENTION: Record<ComplianceStatus, boolean> = {
  Expired: true,
  "Insufficient Coverage": true,
  "Needs Review": true,
  "Pending Upload": true,
  Compliant: false,
  "Approved Exception": false,
};

export const countsAsCompliant = (s: ComplianceStatus): boolean => COUNTS_AS_COMPLIANT[s];
export const countsAsBreach = (s: ComplianceStatus): boolean => COUNTS_AS_BREACH[s];
export const needsAttention = (s: ComplianceStatus): boolean => NEEDS_ATTENTION[s];
export const statusSeverity = (s: ComplianceStatus): number => STATUS_SEVERITY[s];
export const statusBadgeClass = (s: ComplianceStatus): string => STATUS_BADGE_CLASS[s];
