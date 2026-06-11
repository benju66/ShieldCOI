export interface ProjectRequirements {
  gl_occurrence: number;
  gl_aggregate: number;
  auto_limit: number;
  workers_comp: boolean;
  warn_days_out: number;
}

export interface Project {
  id: string;
  name: string;
  number: string;
  target_completion_date: string; // YYYY-MM-DD
  requirements: ProjectRequirements;
  createdAt: string;
}

export interface Subcontractor {
  id: string;
  project_id: string;
  company_name: string;
  trade: string;
  contract_value: number;
  compliance_status: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload";
  manual_override: boolean;
  override_notes: string;
  createdAt: string;
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
  validation_errors: string[];
}

export interface Notification {
  id: string;
  project_id: string;
  project_name: string;
  subcontractor_name: string;
  type: "danger" | "warning" | "info";
  message: string;
  timestamp: string; // ISO string
}
