import { supabase, currentOrgId } from "./supabaseClient";

/**
 * Original-certificate document storage (Supabase Storage, bucket
 * "coi-documents"). The stored file is the audit artifact behind each COI
 * record: objects live at `<org_id>/<subcontractor_id>/<uuid>.<ext>`, RLS
 * limits every operation to the caller's own org via the first path segment,
 * and objects are immutable — a correction is a new upload on a new record.
 */

const BUCKET = "coi-documents";

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function extensionForMime(mime: string): string {
  return MIME_EXT[(mime || "").toLowerCase()] ?? "bin";
}

/** The bucket path for a new document. Exported for tests. */
export function buildCoiDocumentPath(orgId: string, subcontractorId: string, mime: string): string {
  return `${orgId}/${subcontractorId}/${crypto.randomUUID()}.${extensionForMime(mime)}`;
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // btoa over chunks — building one giant binary string via String.fromCharCode
  // per byte would blow the call stack on multi-MB files.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Archive the original certificate. Throws on failure — the caller aborts the
 * save rather than persisting a record without its audit document.
 */
export async function uploadCoiDocument(subcontractorId: string, base64: string, mime: string): Promise<string> {
  const orgId = await currentOrgId();
  const path = buildCoiDocumentPath(orgId, subcontractorId, mime);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBlob(base64, mime), { contentType: mime, upsert: false });
  if (error) {
    throw new Error(`Couldn't archive the certificate document (${error.message}). The record was not saved — try again.`);
  }
  return path;
}

/** Fetch a stored document as raw base64 (no data: prefix) for the in-app viewer. */
export async function downloadCoiDocumentBase64(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Couldn't load the stored certificate (${error?.message || "not found"}).`);
  }
  return blobToBase64(data);
}

/** Short-lived signed URL for opening/downloading the original in a new tab. */
export async function getCoiDocumentSignedUrl(path: string, expiresInSeconds = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Couldn't create a download link (${error?.message || "unknown error"}).`);
  }
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Cleanup — DB deletes cascade rows but never storage objects. These are
// BEST-EFFORT companions to the dbService delete paths: a failure logs and
// leaves an orphaned file (harmless, org-scoped) rather than blocking the
// user's delete.
// ---------------------------------------------------------------------------

async function listFileNames(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  // Folder placeholders have no id; real objects do.
  return (data ?? []).filter((item) => item.id).map((item) => `${prefix}/${item.name}`);
}

/** Remove every stored document for one subcontractor. Never throws. */
export async function removeSubcontractorDocuments(subcontractorId: string): Promise<void> {
  try {
    const orgId = await currentOrgId();
    const paths = await listFileNames(`${orgId}/${subcontractorId}`);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
    }
  } catch (err: any) {
    console.warn(`Storage cleanup skipped for subcontractor ${subcontractorId}:`, err?.message || err);
  }
}

/** Remove every stored document for the whole org (backs clearAllData). Never throws. */
export async function removeAllOrgDocuments(): Promise<void> {
  try {
    const orgId = await currentOrgId();
    const { data, error } = await supabase.storage.from(BUCKET).list(orgId, { limit: 1000 });
    if (error) throw new Error(error.message);
    // Top level under the org folder is one folder per subcontractor id.
    const folders = (data ?? []).filter((item) => !item.id).map((item) => item.name);
    for (const folder of folders) {
      const paths = await listFileNames(`${orgId}/${folder}`);
      if (paths.length > 0) {
        const { error: rmError } = await supabase.storage.from(BUCKET).remove(paths);
        if (rmError) throw new Error(rmError.message);
      }
    }
  } catch (err: any) {
    console.warn("Org-wide storage cleanup skipped:", err?.message || err);
  }
}
