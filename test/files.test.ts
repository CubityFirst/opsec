import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ApiErrorBody, ContactDetail, FeedResult, FileOut, ListResult } from "@shared/types";
import { api, createContact, createInteraction, json, multipart } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("files", () => {
  it("uploads a cropped avatar plus the original, streams both, replaces on re-upload and clears on delete", async () => {
    const c = await createContact({ firstName: "Pic" });
    const up = await api(`/api/contacts/${c.id}/avatar`, {
      method: "POST",
      body: multipart([
        { name: "avatar.webp", content: PNG, type: "image/webp" },
        { name: "holiday.png", content: new Uint8Array([...PNG, 9, 9, 9]), type: "image/png", field: "original" },
      ]),
    });
    expect(up.status).toBe(201);
    const file = (await up.json()) as FileOut;
    expect(file.kind).toBe("avatar");

    let detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.avatarUrl).toBe(file.url);
    expect(detail.body.avatarFullUrl).not.toBeNull();
    expect(detail.body.avatarFullUrl).not.toBe(file.url);

    const cropped = await api(file.url);
    expect(cropped.status).toBe(200);
    expect(cropped.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await cropped.arrayBuffer())).toEqual(PNG);
    const full = await api(detail.body.avatarFullUrl!);
    expect(full.headers.get("content-type")).toBe("image/png");
    expect((await full.arrayBuffer()).byteLength).toBe(PNG.length + 3);
    const etag = cropped.headers.get("etag");
    expect(etag).toBeTruthy();
    expect((await api(file.url, { headers: { "if-none-match": etag! } })).status).toBe(304);

    const files = await json<ListResult<FileOut>>(`/api/contacts/${c.id}/files`);
    expect(files.body.items.map((f) => f.kind).sort()).toEqual(["avatar", "avatar_original"]);
    expect((await env.BUCKET.list({ prefix: `avatars/${c.id}/` })).objects).toHaveLength(2);

    // Re-upload without an original: both old objects go, no full photo remains.
    const again = await api(`/api/contacts/${c.id}/avatar`, { method: "POST", body: multipart([{ name: "new.png", content: PNG, type: "image/png" }]) });
    expect(again.status).toBe(201);
    expect((await env.BUCKET.list({ prefix: `avatars/${c.id}/` })).objects).toHaveLength(1);
    expect((await api(file.url)).status).toBe(404);
    detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.avatarFullUrl).toBeNull();

    const del = await api(`/api/contacts/${c.id}/avatar`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await env.BUCKET.list({ prefix: `avatars/${c.id}/` })).objects).toHaveLength(0);
    detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.avatarUrl).toBeNull();
  });

  it("deleting the original via /files clears only the full-photo link", async () => {
    const c = await createContact({ firstName: "Orig" });
    await api(`/api/contacts/${c.id}/avatar`, {
      method: "POST",
      body: multipart([
        { name: "a.png", content: PNG, type: "image/png" },
        { name: "o.png", content: PNG, type: "image/png", field: "original" },
      ]),
    });
    const files = await json<ListResult<FileOut>>(`/api/contacts/${c.id}/files`);
    const original = files.body.items.find((f) => f.kind === "avatar_original")!;
    expect((await api(`/api/files/${original.id}`, { method: "DELETE" })).status).toBe(204);
    const detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.avatarFullUrl).toBeNull();
    expect(detail.body.avatarUrl).not.toBeNull();
  });

  it("rejects non-image avatars", async () => {
    const c = await createContact({ firstName: "Doc" });
    const up = await api(`/api/contacts/${c.id}/avatar`, { method: "POST", body: multipart([{ name: "x.txt", content: "hi", type: "text/plain" }]) });
    expect(up.status).toBe(400);
    expect(((await up.json()) as ApiErrorBody).error.code).toBe("bad_request");
  });

  it("attaches files to an interaction and lists them under each participant", async () => {
    const a = await createContact({ firstName: "A" });
    const b = await createContact({ firstName: "B" });
    const it1 = await createInteraction([a.id, b.id]);
    const up = await api(`/api/interactions/${it1.id}/files`, {
      method: "POST",
      body: multipart([
        { name: "notes.txt", content: "hello", type: "text/plain" },
        { name: "photo.png", content: PNG, type: "image/png" },
      ]),
    });
    expect(up.status).toBe(201);
    const { items } = (await up.json()) as ListResult<FileOut>;
    expect(items).toHaveLength(2);

    for (const id of [a.id, b.id]) {
      const files = await json<ListResult<FileOut>>(`/api/contacts/${id}/files`);
      expect(files.body.items.map((f) => f.filename).sort()).toEqual(["notes.txt", "photo.png"]);
      const feed = await json<FeedResult>(`/api/contacts/${id}/activity`);
      expect(feed.body.items.filter((i) => i.kind === "event" && i.event.eventType === "file.uploaded")).toHaveLength(2);
    }
    const detail = await json<{ attachments: FileOut[] }>(`/api/interactions/${it1.id}`);
    expect(detail.body.attachments).toHaveLength(2);

    const dl = await api(`${items[0].url}?download=1`);
    expect(dl.headers.get("content-disposition")).toContain("attachment");

    const del = await api(`/api/files/${items[0].id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await api(items[0].url)).status).toBe(404);
    expect((await env.BUCKET.list({ prefix: `attachments/${it1.id}/` })).objects).toHaveLength(1);

    // Deleting the interaction removes the remaining object too.
    await api(`/api/interactions/${it1.id}`, { method: "DELETE" });
    expect((await env.BUCKET.list({ prefix: `attachments/${it1.id}/` })).objects).toHaveLength(0);
  });
});
