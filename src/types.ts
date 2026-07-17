export interface ProjectRequirements {
  gl_occurrence: number;
  gl_aggregate: number;
  auto_limit: number;
  workers_comp: boolean;
  warn_days_out: number;
  gl_products_completed: number;
  umbrella_limit: number;
  employers_liability_accident: number;
  employers_liability_disease_person: number;
  employers_liability_disease_limit: number;
  // Project baselines for professional & pollution liability (0/absent = not
  // required for everyone). Trade rules can raise these for specific trades.
  professional_liability?: number;
  pollution_liability?: number;
}

export interface Project {
  id: string;
  name: string;
  number: string;
  target_completion_date: string; // YYYY-MM-DD
  requirements: ProjectRequirements;
  createdAt: string;
  /** Archived projects are hidden from active dashboards, triage, and vendor roll-ups. Absent = active. */
  archived?: boolean;
  custom_requirements?: { id: string; label: string; limit: number }[];
  // Additional Insured verification (optional; absent on legacy projects, in which case the check is skipped)
  additional_insured_required?: boolean;
  additional_insured_names?: string[];
  accept_blanket_ai?: boolean; // treat "as required by written contract" blanket language as satisfying the requirement (default true)
  email_templates?: {
    expired_template: string;
    insufficient_template: string;
  };
}

export type TradeType =
  | "Environmental"
  | "Surveying"
  | "Earthwork"
  | "Concrete (Precast)"
  | "Concrete (with Crane)"
  | "Concrete (Standard)"
  | "Masonry"
  | "Rough Carpentry (with Crane)"
  | "Rough Carpentry (Standard)"
  | "Siding"
  | "Roofing"
  | "Windows"
  | "Drywall"
  | "Pool"
  | "Elevators"
  | "Fire Sprinkler"
  | "Plumbing"
  | "HVAC"
  | "Electrical"
  | "Other Trades";

export interface Subcontractor {
  id: string;
  project_id: string;
  company_name: string;
  trade: TradeType | string;
  contract_value: number;
  compliance_status: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload" | "Approved Exception";
  manual_override: boolean;
  override_notes: string;
  createdAt: string;
  vendor_type: "Subcontractor" | "Supplier";
  waiver_reason_type?: "Low Contract Value" | "Low-Risk Scope" | "Executive Discretion" | "Temporary Extension" | null;
  waiver_authorized_by?: string | null;
  waiver_expiration_date?: string | null;
  // Optional vendor contact — used by the scheduled reminder engine's future
  // "email the vendor directly" channel (absent until captured).
  contact_email?: string | null;
  contact_name?: string | null;
}

export interface CoiRecord {
  id: string;
  subcontractor_id: string;
  project_id: string;
  uploaded_at: string; // ISO string
  file_name: string;
  insured_extracted_name: string;
  gl_occurrence_extracted: number;
  gl_aggregate_extracted: number;
  auto_combined_single_limit_extracted: number;
  workers_comp_statutory_extracted: boolean;
  policy_expiration_date_extracted: string; // YYYY-MM-DD
  gl_products_completed_extracted: number;
  umbrella_limit_extracted: number;
  employers_liability_accident_extracted: number;
  employers_liability_disease_person_extracted: number;
  employers_liability_disease_limit_extracted: number;
  professional_liability_extracted: number;
  pollution_liability_extracted: number;
  validation_errors: string[];
  extraction_method?: "AI_Scan" | "Manual_Entry";
  custom_extractions?: Record<string, number | null>;
  // Additional Insured extraction facts
  additional_insured_named_extracted?: string[];
  additional_insured_blanket_extracted?: boolean;
  additional_insured_text_extracted?: string;
  gl_addl_insd_extracted?: boolean;
}

export interface Notification {
  id: string;
  project_id: string;
  project_name: string;
  subcontractor_name: string;
  type: "danger" | "warning" | "info";
  message: string;
  timestamp: string; // ISO string
  resolved: boolean;
}
