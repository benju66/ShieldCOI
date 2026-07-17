// ShieldCOI — scheduled COI-expiration reminders (Phase D).
//
// Runs on a daily pg_cron schedule. Because cron is not an authenticated user,
// this function uses the SERVICE-ROLE key (auto-injected into the edge runtime)
// to bypass Row-Level Security and iterate every org explicitly.
//
// For each org it reads `org_settings.reminder_settings`, finds the latest COI
// on file for each subcontractor (on an active project), and — for the current
// reminder step ("30 days out", "7 days out", "expired") — creates an in-app
// notification for the team. Each cert is notified at most once per step per
// channel, enforced by the `coi_reminder_log` ledger (unique index backstop).
//
// Email is an optional, off-by-default channel: it only sends when the org has
// `email_enabled` AND a RESEND_API_KEY + REMINDER_FROM_EMAIL secret are set.
// Until then the whole thing is in-app only (no external mail, no account).
//
// Debug affordances (both optional): POST { "dryRun": true } computes and
// reports what it *would* do without writing anything; { "today": "YYYY-MM-DD" }
// overrides the reference date (handy for testing against the sample data).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMINDER_FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") ?? "";

interface ReminderSettings {
  enabled: boolean;
  days_before: number[];
  also_on_expiry: boolean;
  notify_team: boolean;
  notify_vendor: boolean;
  email_enabled: boolean;
}

const DEFAULTS: ReminderSettings = {
  enabled: true,
  days_before: [30, 7],
  also_on_expiry: true,
  notify_team: true,
  notify_vendor: false,
  email_enabled: false,
};

function normalize(raw: unknown): ReminderSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const days = Array.isArray(r.days_before)
    ? (r.days_before as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : DEFAULTS.days_before;
  return {
    enabled: r.enabled !== false,
    days_before: days.length ? days : DEFAULTS.days_before,
    also_on_expiry: r.also_on_expiry !== false,
    notify_team: r.notify_team !== false,
    notify_vendor: r.notify_vendor === true,
    email_enabled: r.email_enabled === true,
  };
}

/** Reference "today" as a UTC YYYY-MM-DD string. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from `today` to `date` (both YYYY-MM-DD). Negative = past. */
function daysUntil(today: string, date: string): number {
  const a = Date.parse(today + "T00:00:00Z");
  const b = Date.parse(date + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/**
 * The single reminder step a cert is currently in, or null if it isn't due.
 * As a cert ages it moves through the tightest applicable threshold
 * (…→ "30" → "7" → "expired"), so each step fires exactly once.
 */
function pickBucket(days: number, rs: ReminderSettings): string | null {
  if (days <= 0) return rs.also_on_expiry ? "expired" : null;
  const thresholds = [...rs.days_before].sort((a, b) => a - b);
  for (const t of thresholds) if (days <= t) return String(t);
  return null;
}

function buildMessage(company: string, exp: string, days: number): { type: string; message: string } {
  if (days <= 0) {
    const ago = Math.abs(days);
    return {
      type: "danger",
      message: `COI for ${company} expired on ${exp}${ago > 0 ? ` (${ago} day${ago === 1 ? "" : "s"} ago)` : ""}. Request a renewed certificate.`,
    };
  }
  return {
    type: "warning",
    message: `COI for ${company} expires in ${days} day${days === 1 ? "" : "s"} (${exp}). Request a renewed certificate.`,
  };
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: REMINDER_FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const url = new URL(req.url);
  const dryRun = body.dryRun === true || url.searchParams.get("dryRun") === "true";
  const today = (typeof body.today === "string" && body.today) || url.searchParams.get("today") || todayUTC();
  const emailReady = RESEND_API_KEY !== "" && REMINDER_FROM_EMAIL !== "";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const summary = {
    today,
    dryRun,
    orgs_processed: 0,
    reminders_created: 0,
    emails_sent: 0,
    emails_skipped_no_provider: 0,
    by_bucket: {} as Record<string, number>,
    errors: [] as string[],
  };

  const { data: orgs, error: orgErr } = await admin.from("orgs").select("id");
  if (orgErr) {
    return new Response(JSON.stringify({ error: orgErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const org of orgs ?? []) {
    const orgId = org.id as string;

    const { data: settingsRow } = await admin
      .from("org_settings")
      .select("reminder_settings")
      .eq("org_id", orgId)
      .maybeSingle();
    const rs = normalize(settingsRow?.reminder_settings);
    if (!rs.enabled) continue;
    summary.orgs_processed += 1;

    const { data: projects } = await admin
      .from("projects")
      .select("id, name, archived")
      .eq("org_id", orgId);
    const projMap = new Map((projects ?? []).map((p) => [p.id as string, p]));

    const { data: profiles } = await admin.from("profiles").select("email").eq("org_id", orgId);
    const teamEmails = (profiles ?? []).map((p) => p.email as string).filter(Boolean);

    const { data: subs } = await admin
      .from("subcontractors")
      .select("id, project_id, company_name, contact_email")
      .eq("org_id", orgId);

    for (const sub of subs ?? []) {
      const proj = projMap.get(sub.project_id as string);
      if (!proj || proj.archived) continue; // skip subs on archived / missing projects

      const { data: cois } = await admin
        .from("coi_records")
        .select("id, policy_expiration_date_extracted, uploaded_at")
        .eq("subcontractor_id", sub.id)
        .not("policy_expiration_date_extracted", "is", null)
        .order("uploaded_at", { ascending: false })
        .limit(1);
      const coi = cois?.[0];
      if (!coi?.policy_expiration_date_extracted) continue;

      const exp = coi.policy_expiration_date_extracted as string;
      const days = daysUntil(today, exp);
      const bucket = pickBucket(days, rs);
      if (!bucket) continue;

      const company = (sub.company_name as string) || "Subcontractor";
      const { type, message } = buildMessage(company, exp, days);

      // Assemble the channels this step should fire on.
      const channels: { channel: string; recipient: string | null }[] = [];
      if (rs.notify_team) channels.push({ channel: "in_app", recipient: null });
      if (rs.email_enabled && rs.notify_team) {
        for (const e of teamEmails) channels.push({ channel: "email_team", recipient: e });
      }
      if (rs.email_enabled && rs.notify_vendor && sub.contact_email) {
        channels.push({ channel: "email_vendor", recipient: sub.contact_email as string });
      }

      for (const { channel, recipient } of channels) {
        const isEmail = channel !== "in_app";
        if (isEmail && !emailReady) {
          summary.emails_skipped_no_provider += 1;
          continue; // provider not configured — don't claim, so it sends once enabled
        }

        if (dryRun) {
          summary.by_bucket[bucket] = (summary.by_bucket[bucket] ?? 0) + 1;
          if (channel === "in_app") summary.reminders_created += 1;
          else summary.emails_sent += 1;
          continue;
        }

        // Claim the ledger slot; the unique index makes this idempotent.
        const { error: claimErr } = await admin.from("coi_reminder_log").insert({
          org_id: orgId,
          coi_record_id: coi.id,
          subcontractor_id: sub.id,
          project_id: sub.project_id,
          expiration_date: exp,
          bucket,
          channel,
          recipient,
          status: "sent",
        });
        if (claimErr) {
          // 23505 = already notified for this cert+step+channel+recipient.
          if ((claimErr as { code?: string }).code !== "23505") {
            summary.errors.push(`ledger ${channel} ${sub.id}: ${claimErr.message}`);
          }
          continue;
        }

        try {
          if (channel === "in_app") {
            const { error: notifErr } = await admin.from("notifications").insert({
              org_id: orgId,
              project_id: sub.project_id,
              project_name: (proj.name as string) ?? null,
              subcontractor_name: company,
              type,
              message,
              resolved: false,
            });
            if (notifErr) throw new Error(notifErr.message);
            summary.reminders_created += 1;
          } else {
            const subject =
              days <= 0
                ? `COI expired — ${company}`
                : `COI expiring in ${days} day${days === 1 ? "" : "s"} — ${company}`;
            await sendEmail(recipient as string, subject, message);
            summary.emails_sent += 1;
          }
          summary.by_bucket[bucket] = (summary.by_bucket[bucket] ?? 0) + 1;
        } catch (err) {
          // Delivery failed — release the slot so the next run retries.
          let del = admin
            .from("coi_reminder_log")
            .delete()
            .eq("coi_record_id", coi.id)
            .eq("bucket", bucket)
            .eq("channel", channel);
          del = recipient === null ? del.is("recipient", null) : del.eq("recipient", recipient);
          await del;
          summary.errors.push(`${channel} ${sub.id}: ${(err as Error).message}`);
        }
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
