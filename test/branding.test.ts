import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_BRANDING, type BrandingOut } from "@shared/schemas/branding";
import { api, apiAs, json } from "./helpers";

const CUSTOM = { name: "Rolodex", shortName: "rolo", title: "Rolodex — people", tagline: "Everyone you know." };

describe("branding", () => {
  // Storage is shared across a file, so leave the instance as we found it.
  afterAll(async () => {
    await json("/api/branding", { method: "DELETE" });
  });

  it("serves the defaults to anyone, including signed-out visitors", async () => {
    const { status, body } = await json<BrandingOut>("/api/branding", { anonymous: true });
    expect(status).toBe(200);
    expect(body).toEqual({ branding: DEFAULT_BRANDING, source: "default", updatedAt: null });
  });

  it("is admin-only to change", async () => {
    const user = { sub: "plain-user", roles: ["user"], email: "allowed@example.com", emailVerified: true };
    expect((await apiAs(user, "/api/branding")).status).toBe(200);
    expect((await apiAs(user, "/api/branding", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(CUSTOM) })).status).toBe(403);
    expect((await api("/api/branding", { method: "PUT", anonymous: true, headers: { "content-type": "application/json" }, body: JSON.stringify(CUSTOM) })).status).toBe(401);
  });

  it("rejects a blank or oversized name", async () => {
    expect((await json("/api/branding", { method: "PUT", body: { ...CUSTOM, name: "  " } })).status).toBe(400);
    expect((await json("/api/branding", { method: "PUT", body: { ...CUSTOM, name: "x".repeat(41) } })).status).toBe(400);
  });

  it("saves a rename, serves it publicly and puts it in the manifest", async () => {
    const saved = await json<BrandingOut>("/api/branding", { method: "PUT", body: CUSTOM });
    expect(saved.status).toBe(200);
    expect(saved.body.source).toBe("db");
    expect(saved.body.updatedAt).toBeTruthy();
    expect(saved.body.branding).toEqual(CUSTOM);

    const anon = await json<BrandingOut>("/api/branding", { anonymous: true });
    expect(anon.body.branding.name).toBe("Rolodex");

    const manifest = await api("/manifest.webmanifest", { anonymous: true });
    expect(manifest.status).toBe(200);
    const m = (await manifest.json()) as Record<string, unknown>;
    expect(m.name).toBe("Rolodex");
    expect(m.short_name).toBe("rolo");
    // Everything else still comes from the file.
    expect(m.start_url).toBe("/");
    expect(Array.isArray(m.icons)).toBe(true);
  });

  it("falls back to the name when the optional fields are blank", async () => {
    const { body } = await json<BrandingOut>("/api/branding", { method: "PUT", body: { name: "Rolodex" } });
    expect(body.branding).toEqual({ name: "Rolodex", shortName: "", title: "", tagline: "" });
    const m = (await (await api("/manifest.webmanifest", { anonymous: true })).json()) as Record<string, unknown>;
    expect(m.short_name).toBe("Rolodex");
  });

  it("resets to the defaults", async () => {
    const { body } = await json<BrandingOut>("/api/branding", { method: "DELETE" });
    expect(body).toEqual({ branding: DEFAULT_BRANDING, source: "default", updatedAt: null });
    const m = (await (await api("/manifest.webmanifest", { anonymous: true })).json()) as Record<string, unknown>;
    expect(m.name).toBe(DEFAULT_BRANDING.name);
  });
});
