import { Project, Subcontractor, CoiRecord, Notification } from "./types";
import { verifyCompliance } from "./complianceEngine";
import { fetchSettings, saveSettings, todayISO, AppSettings } from "./settingsService";
import { supabase, currentOrgId } from "./supabaseClient";

/**
 * Supabase-backed data layer. Every table is org-scoped by Row-Level Security,
 * so reads/updates/deletes are automatically limited to the signed-in user's
 * org; inserts stamp `org_id` explicitly. This is the single swap point — the
 * rest of the app calls the same async API it always has.
 */

// --- Row <-> app-object mapping (DB uses created_at; some types use createdAt) ---

function rowToProject(r: any): Project {
  return {
    id: r.id,
    name: r.name,
    number: r.number,
    target_completion_date: r.target_completion_date,
    requirements: r.requirements,
    createdAt: r.created_at,
    custom_requirements: r.custom_requirements ?? [],
    additional_insured_required: r.additional_insured_required ?? false,
    additional_insured_names: r.additional_insured_names ?? [],
    accept_blanket_ai: r.accept_blanket_ai ?? true,
    email_templates: r.email_templates ?? undefined,
    archived: r.archived ?? false,
  };
}

/** Map a (partial) Project onto DB columns — used for both insert and update. */
function projectToRow(p: Partial<Project>): Record<string, any> {
  const row: Record<string, any> = {};
  const keys: (keyof Project)[] = [
    "name",
    "number",
    "target_completion_date",
    "requirements",
    "custom_requirements",
    "additional_insured_required",
    "additional_insured_names",
    "accept_blanket_ai",
    "email_templates",
    "archived",
  ];
  for (const k of keys) if (p[k] !== undefined) row[k] = p[k];
  return row;
}

function rowToSub(r: any): Subcontractor {
  return {
    id: r.id,
    project_id: r.project_id,
    company_name: r.company_name,
    trade: r.trade,
    contract_value: Number(r.contract_value),
    compliance_status: r.compliance_status,
    manual_override: r.manual_override,
    override_notes: r.override_notes ?? "",
    createdAt: r.created_at,
    vendor_type: r.vendor_type,
    waiver_reason_type: r.waiver_reason_type ?? null,
    waiver_authorized_by: r.waiver_authorized_by ?? null,
    waiver_expiration_date: r.waiver_expiration_date ?? null,
    contact_email: r.contact_email ?? null,
    contact_name: r.contact_name ?? null,
  };
}

function subToRow(s: Partial<Subcontractor>): Record<string, any> {
  const row: Record<string, any> = {};
  const keys: (keyof Subcontractor)[] = [
    "project_id",
    "company_name",
    "trade",
    "contract_value",
    "compliance_status",
    "manual_override",
    "override_notes",
    "vendor_type",
    "waiver_reason_type",
    "waiver_authorized_by",
    "waiver_expiration_date",
    "contact_email",
    "contact_name",
  ];
  for (const k of keys) if (s[k] !== undefined) row[k] = s[k];
  return row;
}

function rowToCoi(r: any): CoiRecord {
  const { org_id, ...rest } = r;
  return rest as CoiRecord;
}

function rowToNotif(r: any): Notification {
  return {
    id: r.id,
    project_id: r.project_id,
    project_name: r.project_name,
    subcontractor_name: r.subcontractor_name,
    type: r.type,
    message: r.message,
    timestamp: r.created_at,
    resolved: r.resolved,
  };
}

// =====================================================================
// Projects
// =====================================================================

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToProject);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToProject(data) : null;
}

export async function createProject(project: Omit<Project, "id" | "createdAt">): Promise<Project> {
  const org_id = await currentOrgId();
  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id, ...projectToRow(project) })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToProject(data);
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
  const { error } = await supabase.from("projects").update(projectToRow(updates)).eq("id", projectId);
  if (error) throw new Error(error.message);
}

/** Delete a project (subcontractors + COIs cascade via FK). */
export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}

// =====================================================================
// Subcontractors
// =====================================================================

export async function getSubcontractors(projectId: string): Promise<Subcontractor[]> {
  const { data, error } = await supabase
    .from("subcontractors")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSub);
}

async function getSubcontractorById(subId: string): Promise<Subcontractor | null> {
  const { data, error } = await supabase.from("subcontractors").select("*").eq("id", subId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSub(data) : null;
}

export async function createSubcontractor(
  projectId: string,
  sub: Omit<
    Subcontractor,
    "id" | "project_id" | "compliance_status" | "manual_override" | "override_notes" | "createdAt" | "vendor_type"
  > & { vendor_type?: "Subcontractor" | "Supplier" }
): Promise<Subcontractor> {
  const org_id = await currentOrgId();
  const { data, error } = await supabase
    .from("subcontractors")
    .insert({
      org_id,
      project_id: projectId,
      company_name: sub.company_name,
      trade: sub.trade,
      contract_value: sub.contract_value,
      compliance_status: "Pending Upload",
      manual_override: false,
      override_notes: "",
      vendor_type: sub.vendor_type || "Subcontractor",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToSub(data);
}

export async function updateSubcontractor(
  projectId: string,
  subId: string,
  updates: Partial<Subcontractor>
): Promise<void> {
  const currentSub = await getSubcontractorById(subId);
  const finalUpdates = { ...updates };

  const isOverrideActive =
    finalUpdates.manual_override !== undefined ? finalUpdates.manual_override : currentSub?.manual_override;

  if (isOverrideActive) {
    finalUpdates.compliance_status = "Approved Exception";
  }

  const { error } = await supabase.from("subcontractors").update(subToRow(finalUpdates)).eq("id", subId);
  if (error) throw new Error(error.message);

  if (finalUpdates.compliance_status === "Compliant") {
    await resolveNotificationsFor(projectId, currentSub?.company_name || "Subcontractor");
  }
}

/** Delete a subcontractor (its COIs cascade via FK). */
export async function deleteSubcontractor(_projectId: string, subId: string): Promise<void> {
  const { error } = await supabase.from("subcontractors").delete().eq("id", subId);
  if (error) throw new Error(error.message);
}

// =====================================================================
// COI Records
// =====================================================================

export async function getCoiRecords(_projectId: string, subcontractorId: string): Promise<CoiRecord[]> {
  const { data, error } = await supabase
    .from("coi_records")
    .select("*")
    .eq("subcontractor_id", subcontractorId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCoi);
}

export async function submitCoiRecord(
  projectId: string,
  subcontractorId: string,
  coiData: Omit<CoiRecord, "id" | "project_id" | "subcontractor_id" | "uploaded_at" | "validation_errors">
): Promise<CoiRecord> {
  const org_id = await currentOrgId();

  // 1. Fetch parent project + subcontractor, and org settings for the eval.
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project matching ID ${projectId} was not found.`);
  const subcontractor = await getSubcontractorById(subcontractorId);
  if (!subcontractor) throw new Error(`Subcontractor matching ID ${subcontractorId} was not found.`);
  const trade = subcontractor.trade || "Other Trades";
  const settings = await fetchSettings();
  const evalDate = settings.evaluation_date || todayISO();

  // 2. Perform compliance checks
  const evaluation = verifyCompliance(
    project,
    {
      insured_name: coiData.insured_extracted_name,
      gl_each_occurrence: coiData.gl_occurrence_extracted,
      gl_general_aggregate: coiData.gl_aggregate_extracted,
      auto_combined_single_limit: coiData.auto_combined_single_limit_extracted,
      workers_comp_statutory: coiData.workers_comp_statutory_extracted,
      policy_expiration_date: coiData.policy_expiration_date_extracted,
      gl_products_completed: coiData.gl_products_completed_extracted,
      umbrella_limit: coiData.umbrella_limit_extracted,
      employers_liability_accident: coiData.employers_liability_accident_extracted,
      employers_liability_disease_person: coiData.employers_liability_disease_person_extracted,
      employers_liability_disease_limit: coiData.employers_liability_disease_limit_extracted,
      professional_liability: coiData.professional_liability_extracted,
      pollution_liability: coiData.pollution_liability_extracted,
      additional_insured_named: coiData.additional_insured_named_extracted,
      additional_insured_blanket: coiData.additional_insured_blanket_extracted,
      gl_addl_insd: coiData.gl_addl_insd_extracted,
    },
    trade,
    evalDate,
    settings.trade_rules
  );

  // 3. Write the COI record
  const { data: insertedCoi, error: coiError } = await supabase
    .from("coi_records")
    .insert({ org_id, project_id: projectId, subcontractor_id: subcontractorId, ...coiData, validation_errors: evaluation.errors })
    .select("*")
    .single();
  if (coiError) throw new Error(coiError.message);

  // 4. Update subcontractor status (honoring active manual overrides / waivers)
  let targetStatus: Subcontractor["compliance_status"] = evaluation.status;
  let manualOverride = subcontractor.manual_override;
  let overrideNotes = subcontractor.override_notes || "";
  let waiverReasonType = subcontractor.waiver_reason_type || null;
  let waiverAuthorizedBy = subcontractor.waiver_authorized_by || null;
  let waiverExpirationDate = subcontractor.waiver_expiration_date || null;

  if (manualOverride) {
    if (evaluation.status === "Compliant") {
      manualOverride = false;
      targetStatus = "Compliant";
      overrideNotes = "";
      waiverReasonType = null;
      waiverAuthorizedBy = null;
      waiverExpirationDate = null;
    } else {
      const today = new Date(evalDate);
      let isWaiverExpired = false;
      if (waiverExpirationDate) {
        const expDate = new Date(waiverExpirationDate);
        if (expDate <= today) isWaiverExpired = true;
      }
      if (isWaiverExpired) {
        manualOverride = false;
        targetStatus = "Expired";
        overrideNotes = "";
        waiverReasonType = null;
        waiverAuthorizedBy = null;
        waiverExpirationDate = null;
      } else {
        targetStatus = "Approved Exception";
      }
    }
  }

  const { error: subError } = await supabase
    .from("subcontractors")
    .update({
      compliance_status: targetStatus,
      manual_override: manualOverride,
      override_notes: overrideNotes,
      waiver_reason_type: waiverReasonType,
      waiver_authorized_by: waiverAuthorizedBy,
      waiver_expiration_date: waiverExpirationDate,
    })
    .eq("id", subcontractorId);
  if (subError) throw new Error(subError.message);

  if (targetStatus === "Compliant") {
    await resolveNotificationsFor(projectId, subcontractor.company_name || "Subcontractor");
  }

  // 5. Create notifications for errors
  if (evaluation.errors.length > 0) {
    let alertType: "danger" | "warning" | "info" = "warning";
    if (evaluation.status === "Expired") alertType = "danger";
    else if (evaluation.status === "Insufficient Coverage") alertType = "warning";

    await createNotification({
      project_id: projectId,
      project_name: project.name,
      subcontractor_name: subcontractor.company_name || "Subcontractor",
      type: alertType,
      message: "Draft email message ready. Click to view and copy.",
    });
  }

  return rowToCoi(insertedCoi);
}

// =====================================================================
// Notifications
// =====================================================================

/** Resolve unresolved notifications matching a project OR a subcontractor name. */
async function resolveNotificationsFor(projectId: string, subcontractorName: string): Promise<void> {
  const byProject = await supabase
    .from("notifications")
    .update({ resolved: true })
    .eq("resolved", false)
    .eq("project_id", projectId);
  if (byProject.error) console.error("Failed to resolve notifications:", byProject.error.message);
  const byName = await supabase
    .from("notifications")
    .update({ resolved: true })
    .eq("resolved", false)
    .eq("subcontractor_name", subcontractorName);
  if (byName.error) console.error("Failed to resolve notifications:", byName.error.message);
}

export async function getNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToNotif);
}

export async function createNotification(
  notif: Omit<Notification, "id" | "timestamp" | "resolved"> & { resolved?: boolean }
): Promise<Notification> {
  const org_id = await currentOrgId();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      org_id,
      project_id: notif.project_id,
      project_name: notif.project_name,
      subcontractor_name: notif.subcontractor_name,
      type: notif.type,
      message: notif.message,
      resolved: notif.resolved ?? false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToNotif(data);
}

// =====================================================================
// Data management (export / import / clear / sample data)
// =====================================================================

interface ShieldCoiExport {
  _type: "shieldcoi_export";
  _version: number;
  exported_at: string;
  projects: Project[];
  subcontractors: Subcontractor[];
  cois: CoiRecord[];
  notifications: Notification[];
  settings: AppSettings;
}

/** Serialize the org's data + settings to a JSON string for download/backup. */
export async function exportAllData(): Promise<string> {
  const projects = await getProjects();
  const subcontractors: Subcontractor[] = [];
  const cois: CoiRecord[] = [];
  for (const p of projects) {
    const subs = await getSubcontractors(p.id);
    subcontractors.push(...subs);
    for (const s of subs) cois.push(...(await getCoiRecords(p.id, s.id)));
  }
  const notifications = await getNotifications();
  const settings = await fetchSettings();
  const payload: ShieldCoiExport = {
    _type: "shieldcoi_export",
    _version: 2,
    exported_at: new Date().toISOString(),
    projects,
    subcontractors,
    cois,
    notifications,
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Replace the org's data with the contents of an export file. Ids are remapped
 * to fresh uuids (so exports from the old localStorage version — with non-uuid
 * ids — import cleanly too), preserving project/subcontractor relationships.
 */
export async function importAllData(json: string): Promise<void> {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.projects)) {
    throw new Error("That file doesn't look like a ShieldCOI export.");
  }
  const org_id = await currentOrgId();
  await clearAllData();

  const projMap = new Map<string, string>();
  for (const p of data.projects) {
    const { data: row, error } = await supabase
      .from("projects")
      .insert({ org_id, ...projectToRow(p) })
      .select("id")
      .single();
    if (error) throw new Error("Import failed (projects): " + error.message);
    projMap.set(p.id, row.id);
  }

  const subMap = new Map<string, string>();
  for (const s of data.subcontractors ?? []) {
    const newProjId = projMap.get(s.project_id);
    if (!newProjId) continue;
    const { data: row, error } = await supabase
      .from("subcontractors")
      .insert({ org_id, ...subToRow(s), project_id: newProjId })
      .select("id")
      .single();
    if (error) throw new Error("Import failed (subcontractors): " + error.message);
    subMap.set(s.id, row.id);
  }

  for (const c of data.cois ?? []) {
    const newProjId = projMap.get(c.project_id);
    const newSubId = subMap.get(c.subcontractor_id);
    if (!newProjId || !newSubId) continue;
    const { id, org_id: _oid, project_id, subcontractor_id, uploaded_at, ...coiFields } = c;
    const { error } = await supabase
      .from("coi_records")
      .insert({ org_id, project_id: newProjId, subcontractor_id: newSubId, ...coiFields });
    if (error) throw new Error("Import failed (COIs): " + error.message);
  }

  for (const n of data.notifications ?? []) {
    const { error } = await supabase.from("notifications").insert({
      org_id,
      project_id: n.project_id ? projMap.get(n.project_id) ?? null : null,
      project_name: n.project_name,
      subcontractor_name: n.subcontractor_name,
      type: n.type ?? "info",
      message: n.message,
      resolved: n.resolved ?? false,
    });
    if (error) throw new Error("Import failed (notifications): " + error.message);
  }

  if (data.settings) await saveSettings(data.settings);
}

/** Delete all of the org's records (projects cascade to subcontractors + COIs). */
export async function clearAllData(): Promise<void> {
  const projErr = (await supabase.from("projects").delete().not("id", "is", null)).error;
  if (projErr) throw new Error(projErr.message);
  const notifErr = (await supabase.from("notifications").delete().not("id", "is", null)).error;
  if (notifErr) throw new Error(notifErr.message);
}

// =====================================================================
// Sample data (optional — populate an org to explore the app)
// =====================================================================

/** Replace the org's records with the built-in sample dataset. */
export async function seedInitialData(): Promise<void> {
  await clearAllData();

  const p1 = await createProject({
    name: "Aurora Luxury Suites",
    number: "P-2026-01",
    target_completion_date: "2026-12-31",
    requirements: {
      gl_occurrence: 2000000,
      gl_aggregate: 4000000,
      auto_limit: 1000000,
      workers_comp: true,
      warn_days_out: 60,
      gl_products_completed: 2000000,
      umbrella_limit: 1000000,
      employers_liability_accident: 1000000,
      employers_liability_disease_person: 1000000,
      employers_liability_disease_limit: 1000000,
    },
  });

  const sub1A = await createSubcontractor(p1.id, {
    company_name: "ACME Electrical Solutions LLC",
    trade: "Electrical",
    contract_value: 385000,
  });
  await submitCoiRecord(p1.id, sub1A.id, {
    file_name: "ACORD25_ACME_Electrical.pdf",
    insured_extracted_name: "ACME Electrical Solutions LLC",
    gl_occurrence_extracted: 2000000,
    gl_aggregate_extracted: 4000000,
    auto_combined_single_limit_extracted: 1000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2026-09-15",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 5000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 2000000,
    pollution_liability_extracted: 0,
  });

  const sub1B = await createSubcontractor(p1.id, {
    company_name: "Apex Plumbing & Piping Co.",
    trade: "Plumbing",
    contract_value: 240000,
  });
  await submitCoiRecord(p1.id, sub1B.id, {
    file_name: "Apex_Plumbing_COI_2026.pdf",
    insured_extracted_name: "Apex Plumbing & Piping Co.",
    gl_occurrence_extracted: 1000000,
    gl_aggregate_extracted: 2000000,
    auto_combined_single_limit_extracted: 500000,
    workers_comp_statutory_extracted: false,
    policy_expiration_date_extracted: "2026-11-20",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 5000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 2000000,
    pollution_liability_extracted: 2000000,
  });

  const sub1C = await createSubcontractor(p1.id, {
    company_name: "Titan Structural Steel Corp",
    trade: "Other Trades",
    contract_value: 710000,
  });
  await submitCoiRecord(p1.id, sub1C.id, {
    file_name: "titan_steel_insurance_acord.png",
    insured_extracted_name: "Titan Structural Steel Corp",
    gl_occurrence_extracted: 5000000,
    gl_aggregate_extracted: 10000000,
    auto_combined_single_limit_extracted: 2000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2026-05-10",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 1000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 0,
    pollution_liability_extracted: 0,
  });

  const p2 = await createProject({
    name: "Evergreen Business Park",
    number: "P-2026-02",
    target_completion_date: "2027-06-15",
    requirements: {
      gl_occurrence: 1000000,
      gl_aggregate: 2000000,
      auto_limit: 1000000,
      workers_comp: true,
      warn_days_out: 30,
      gl_products_completed: 2000000,
      umbrella_limit: 1000000,
      employers_liability_accident: 1000000,
      employers_liability_disease_person: 1000000,
      employers_liability_disease_limit: 1000000,
    },
  });

  const sub2A = await createSubcontractor(p2.id, {
    company_name: "Solid Ground Concrete Works",
    trade: "Concrete (Standard)",
    contract_value: 190000,
  });
  await submitCoiRecord(p2.id, sub2A.id, {
    file_name: "solid_ground_concrete_acord25.pdf",
    insured_extracted_name: "Solid Ground Concrete Works",
    gl_occurrence_extracted: 2000000,
    gl_aggregate_extracted: 4000000,
    auto_combined_single_limit_extracted: 1000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2027-01-15",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 5000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 0,
    pollution_liability_extracted: 2000000,
  });

  const sub2B = await createSubcontractor(p2.id, {
    company_name: "Vortex Mechanical Services",
    trade: "HVAC",
    contract_value: 125000,
  });
  await submitCoiRecord(p2.id, sub2B.id, {
    file_name: "vortex_hvac_coi_draft.pdf",
    insured_extracted_name: "Vortex Mechanical LLC",
    gl_occurrence_extracted: 1000000,
    gl_aggregate_extracted: 1500000,
    auto_combined_single_limit_extracted: 1000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2026-11-01",
    gl_products_completed_extracted: 1500000,
    umbrella_limit_extracted: 1000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 2000000,
    pollution_liability_extracted: 2000000,
  });
  await updateSubcontractor(p2.id, sub2B.id, {
    manual_override: true,
    compliance_status: "Compliant",
    override_notes:
      "Approved via Exception: Risk Committee reviewed low risk installation height. Exemption granted by Project Manager.",
  });

  const sub2C = await createSubcontractor(p2.id, {
    company_name: "ACME Electrical Solutions, Inc.",
    trade: "Electrical",
    contract_value: 210000,
  });
  await submitCoiRecord(p2.id, sub2C.id, {
    file_name: "ACME_Electrical_Evergreen_2026.pdf",
    insured_extracted_name: "ACME Electrical Solutions Inc",
    gl_occurrence_extracted: 2000000,
    gl_aggregate_extracted: 4000000,
    auto_combined_single_limit_extracted: 1000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2027-03-01",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 5000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 2000000,
    pollution_liability_extracted: 0,
  });

  const p3 = await createProject({
    name: "Summit Heights Canopy",
    number: "P-2026-03",
    target_completion_date: "2026-10-01",
    requirements: {
      gl_occurrence: 3000000,
      gl_aggregate: 5000005,
      auto_limit: 2000000,
      workers_comp: true,
      warn_days_out: 90,
      gl_products_completed: 2000000,
      umbrella_limit: 1000000,
      employers_liability_accident: 1000000,
      employers_liability_disease_person: 1000000,
      employers_liability_disease_limit: 1000000,
    },
  });

  await createSubcontractor(p3.id, {
    company_name: "Summit Roofing Specialists",
    trade: "Roofing",
    contract_value: 145000,
  });
  await createSubcontractor(p3.id, {
    company_name: "Acme Electrical Solutions",
    trade: "Electrical",
    contract_value: 175000,
  });

  const p4 = await createProject({
    name: "Harbor Point Renovation",
    number: "P-2025-11",
    target_completion_date: "2026-03-30",
    archived: true,
    requirements: {
      gl_occurrence: 2000000,
      gl_aggregate: 4000000,
      auto_limit: 1000000,
      workers_comp: true,
      warn_days_out: 60,
      gl_products_completed: 2000000,
      umbrella_limit: 1000000,
      employers_liability_accident: 1000000,
      employers_liability_disease_person: 1000000,
      employers_liability_disease_limit: 1000000,
    },
  });
  const sub4A = await createSubcontractor(p4.id, {
    company_name: "ACME Electrical Solutions LLC",
    trade: "Electrical",
    contract_value: 260000,
  });
  await submitCoiRecord(p4.id, sub4A.id, {
    file_name: "ACME_Electrical_HarborPoint_2025.pdf",
    insured_extracted_name: "ACME Electrical Solutions LLC",
    gl_occurrence_extracted: 2000000,
    gl_aggregate_extracted: 4000000,
    auto_combined_single_limit_extracted: 1000000,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: "2026-04-30",
    gl_products_completed_extracted: 2000000,
    umbrella_limit_extracted: 5000000,
    employers_liability_accident_extracted: 1000000,
    employers_liability_disease_person_extracted: 1000000,
    employers_liability_disease_limit_extracted: 1000000,
    professional_liability_extracted: 2000000,
    pollution_liability_extracted: 0,
  });
}
