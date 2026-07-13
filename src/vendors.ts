import { Subcontractor, Project, CoiRecord } from "./types";

/**
 * Vendor roll-up: the same company is enrolled per-project (each is its own
 * Subcontractor record), so this groups those records by company into a single
 * vendor with a status roll-up across every project they work on.
 */

export type ComplianceStatus = Subcontractor["compliance_status"];

export interface VendorProjectEntry {
  subId: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  trade: string;
  status: ComplianceStatus;
  contractValue: number;
  coiExpiration: string | null;
}

export interface VendorSummary {
  key: string;
  /** Canonical display name (longest spelling seen across projects). */
  name: string;
  vendorType: "Subcontractor" | "Supplier";
  entries: VendorProjectEntry[];
  projectCount: number;
  totalContractValue: number;
  /** The most attention-worthy status across all of this vendor's projects. */
  worstStatus: ComplianceStatus;
  /** Soonest COI expiration across projects (YYYY-MM-DD), or null if none on file. */
  earliestExpiration: string | null;
}

/** Higher = more attention-worthy. Drives roll-up and sort order. */
const STATUS_SEVERITY: Record<ComplianceStatus, number> = {
  Expired: 4,
  "Insufficient Coverage": 3,
  "Pending Upload": 2,
  "Approved Exception": 1,
  Compliant: 0,
};

const CORP_SUFFIXES = /\b(llc|inc|incorporated|corp|corporation|company|co|ltd|limited|lp|llp|plc)\b/g;

/**
 * Normalized key used to group the same company across projects — case-,
 * punctuation-, and corporate-suffix-insensitive, so "ACME Electrical LLC" and
 * "ACME Electrical, Inc." collapse to the same vendor.
 */
export function vendorKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,&/\\'"()-]/g, " ")
    .replace(CORP_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildVendorSummaries(
  subcontractors: Subcontractor[],
  projects: Project[],
  coiMap: Record<string, CoiRecord>
): VendorSummary[] {
  const projById = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<string, VendorSummary>();

  for (const sub of subcontractors) {
    const key = vendorKey(sub.company_name);
    if (!key) continue;

    const proj = projById.get(sub.project_id);
    const coi = coiMap[sub.id];
    const entry: VendorProjectEntry = {
      subId: sub.id,
      projectId: sub.project_id,
      projectName: proj?.name || "—",
      projectNumber: proj?.number || "—",
      trade: sub.trade,
      status: sub.compliance_status,
      contractValue: sub.contract_value || 0,
      coiExpiration: coi?.policy_expiration_date_extracted || null,
    };

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: sub.company_name,
        vendorType: sub.vendor_type || "Subcontractor",
        entries: [],
        projectCount: 0,
        totalContractValue: 0,
        worstStatus: "Compliant",
        earliestExpiration: null,
      };
      groups.set(key, group);
    }
    // Prefer the longest spelling as the canonical display name.
    if (sub.company_name.length > group.name.length) group.name = sub.company_name;
    group.entries.push(entry);
  }

  const summaries: VendorSummary[] = [];
  for (const group of groups.values()) {
    group.projectCount = group.entries.length;
    group.totalContractValue = group.entries.reduce((sum, e) => sum + e.contractValue, 0);
    group.worstStatus = group.entries.reduce<ComplianceStatus>(
      (worst, e) => (STATUS_SEVERITY[e.status] > STATUS_SEVERITY[worst] ? e.status : worst),
      "Compliant"
    );
    const expirations = group.entries
      .map((e) => e.coiExpiration)
      .filter((d): d is string => !!d)
      .sort();
    group.earliestExpiration = expirations[0] || null;

    // Most attention-worthy project first within a vendor.
    group.entries.sort(
      (a, b) =>
        STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status] ||
        a.projectNumber.localeCompare(b.projectNumber)
    );
    summaries.push(group);
  }

  // Vendors needing the most attention first; then those on the most projects.
  summaries.sort(
    (a, b) =>
      STATUS_SEVERITY[b.worstStatus] - STATUS_SEVERITY[a.worstStatus] ||
      b.projectCount - a.projectCount ||
      a.name.localeCompare(b.name)
  );
  return summaries;
}
