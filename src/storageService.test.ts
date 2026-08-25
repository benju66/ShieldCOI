import { describe, it, expect, vi } from "vitest";

// storageService pulls in the Supabase client, which needs real env vars at
// import time — mock it so these pure-helper tests run hermetically.
vi.mock("./supabaseClient", () => ({
  supabase: {},
  currentOrgId: async () => "test-org",
}));

import { buildCoiDocumentPath, extensionForMime, base64ToBlob } from "./storageService";

describe("extensionForMime", () => {
  it("maps the supported upload types", () => {
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
  });

  it("is case-insensitive and falls back to bin", () => {
    expect(extensionForMime("Application/PDF")).toBe("pdf");
    expect(extensionForMime("application/zip")).toBe("bin");
    expect(extensionForMime("")).toBe("bin");
  });
});

describe("buildCoiDocumentPath", () => {
  it("builds <org>/<sub>/<uuid>.<ext> — org first so storage RLS can key on it", () => {
    const path = buildCoiDocumentPath("org-123", "sub-456", "application/pdf");
    expect(path).toMatch(/^org-123\/sub-456\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/);
  });

  it("generates a unique object name per call", () => {
    const a = buildCoiDocumentPath("o", "s", "image/png");
    const b = buildCoiDocumentPath("o", "s", "image/png");
    expect(a).not.toBe(b);
  });
});

describe("base64ToBlob", () => {
  it("round-trips bytes and carries the mime type", async () => {
    const original = "hello ACORD 25";
    const blob = base64ToBlob(btoa(original), "application/pdf");
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe(original);
  });
});
