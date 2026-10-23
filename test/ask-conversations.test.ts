import { describe, expect, it } from "vitest";
import type { AskConversationOut, AskConversationSummary, AskStoredTurn } from "@shared/schemas/ask";
import { conversationTitle } from "../src/worker/services/ask/conversations";
import { api, apiAs, json } from "./helpers";

const OTHER = { sub: "someone-else", roles: ["admin"] };

const answer = (text: string): AskStoredTurn => ({
  role: "assistant",
  text,
  trail: [{ id: "t1", name: "search_contacts", label: "Searched contacts", input: { query: "Alice" }, ok: true, summary: "1 contact" }],
  proposals: [{ id: "p1", kind: "contact_note", contact: { id: "c1", displayName: "Alice" }, appendText: "Likes tea", applied: true }],
  suggestions: ["Yes", "No"],
  done: { stop: "end_turn", iterations: 2 },
});

async function create(turns: AskStoredTurn[]): Promise<AskConversationSummary> {
  const { status, body } = await json<AskConversationSummary>("/api/ask/conversations", { method: "POST", body: { turns } });
  if (status !== 201) throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

describe("conversation titles", () => {
  it("uses the first question on one line, with plain mentions, cut to length", () => {
    expect(conversationTitle([{ role: "user", text: "  When did I last see\n[@Alice Smith](/contacts/01JABCDEFGHJKMNPQRSTVWXYZ0)?  " }])).toBe("When did I last see @Alice Smith?");
    const long = conversationTitle([{ role: "user", text: "word ".repeat(40) }]);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("Ask conversations", () => {
  it("saves, lists, reopens and overwrites a conversation", async () => {
    const created = await create([{ role: "user", text: "Who is Rex?" }]);
    expect(created.title).toBe("Who is Rex?");

    const turns: AskStoredTurn[] = [{ role: "user", text: "Who is Rex?", images: 2 }, answer("Rex is a dog."), { role: "user", text: "And his vet?" }];
    const saved = await json<AskConversationSummary>(`/api/ask/conversations/${created.id}`, { method: "PUT", body: { turns } });
    expect(saved.status).toBe(200);
    expect(saved.body.updatedAt >= created.updatedAt).toBe(true);

    const got = await json<AskConversationOut>(`/api/ask/conversations/${created.id}`);
    expect(got.status).toBe(200);
    expect(got.body.turns).toEqual(turns);

    const list = await json<{ items: AskConversationSummary[] }>("/api/ask/conversations");
    expect(list.body.items[0]).toMatchObject({ id: created.id, title: "Who is Rex?" });
    expect(list.body.items[0]).not.toHaveProperty("turns");
  });

  it("lists the most recently updated first", async () => {
    const a = await create([{ role: "user", text: "First" }]);
    const b = await create([{ role: "user", text: "Second" }]);
    await json(`/api/ask/conversations/${a.id}`, { method: "PUT", body: { turns: [{ role: "user", text: "First" }, answer("Hello")] } });
    const ids = (await json<{ items: AskConversationSummary[] }>("/api/ask/conversations")).body.items.map((c) => c.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it("refuses transcripts without a question or with an unknown shape", async () => {
    for (const turns of [[], [answer("Hi")], [{ role: "user", text: "   " }], [{ role: "system", text: "x" }]]) {
      expect((await json("/api/ask/conversations", { method: "POST", body: { turns } })).status).toBe(400);
    }
    const bad = { role: "assistant", text: "x", trail: [], proposals: [{ id: "p", kind: "nope" }] };
    expect((await json("/api/ask/conversations", { method: "POST", body: { turns: [{ role: "user", text: "q" }, bad] } })).status).toBe(400);
  });

  it("deletes a conversation", async () => {
    const c = await create([{ role: "user", text: "Delete me" }]);
    expect((await api(`/api/ask/conversations/${c.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/ask/conversations/${c.id}`)).status).toBe(404);
    expect((await api(`/api/ask/conversations/${c.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("keeps each user's conversations to themselves", async () => {
    const mine = await create([{ role: "user", text: "Private question" }]);
    const theirs = await apiAs(OTHER, "/api/ask/conversations");
    expect(((await theirs.json()) as { items: AskConversationSummary[] }).items.find((c) => c.id === mine.id)).toBeUndefined();
    expect((await apiAs(OTHER, `/api/ask/conversations/${mine.id}`)).status).toBe(404);
    const put = await apiAs(OTHER, `/api/ask/conversations/${mine.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turns: [{ role: "user", text: "Hijacked" }] }),
    });
    expect(put.status).toBe(404);
    expect((await apiAs(OTHER, `/api/ask/conversations/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await json<AskConversationOut>(`/api/ask/conversations/${mine.id}`)).body.title).toBe("Private question");
    expect((await api("/api/ask/conversations", { anonymous: true })).status).toBe(401);
  });
});
