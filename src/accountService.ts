/**
 * Organization identity + the signed-in user's own profile. Kept separate from
 * settingsService (which is the org-wide app settings blob) because these live in
 * the `orgs` and `profiles` tables and have their own RLS: a user may edit only
 * their own profile, and only an owner may rename the org.
 */

import { supabase, currentOrgId } from "./supabaseClient";

/**
 * The signed-in user, read from the in-memory session. Preferred over
 * `auth.getUser()` because the latter makes a network round-trip that can race
 * with session restoration on first mount and momentarily return null.
 */
async function currentAuthUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export interface OrgInfo {
  id: string;
  name: string;
}

export interface MyProfile {
  id: string;
  email: string;
  role: string; // 'owner' | 'member'
  full_name: string | null;
}

/** The current user's organization (RLS returns only their own org). */
export async function getOrg(): Promise<OrgInfo | null> {
  const { data, error } = await supabase.from("orgs").select("id, name").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, name: data.name } : null;
}

/** Rename the organization. Enforced owner-only by RLS. */
export async function updateOrgName(name: string): Promise<void> {
  const orgId = await currentOrgId();
  const { error } = await supabase.from("orgs").update({ name }).eq("id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * The signed-in user's profile. Email comes from the auth account (always
 * present); role + display name come from the profiles row.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const u = await currentAuthUser();
  if (!u) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", u.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    id: u.id,
    email: u.email ?? "",
    role: data?.role ?? "member",
    full_name: data?.full_name ?? null,
  };
}

/** Update the signed-in user's own profile (e.g. their display name). */
export async function updateMyProfile(updates: { full_name?: string | null }): Promise<void> {
  const u = await currentAuthUser();
  if (!u) throw new Error("Not signed in.");
  const { error } = await supabase.from("profiles").update(updates).eq("id", u.id);
  if (error) throw new Error(error.message);
}

/** Change the signed-in user's password (they are already authenticated). */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** A friendly display label for the current user: their name, else their email. */
export function displayNameFor(profile: Pick<MyProfile, "full_name" | "email"> | null): string {
  if (!profile) return "";
  const name = profile.full_name?.trim();
  return name && name.length > 0 ? name : profile.email;
}
