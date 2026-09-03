import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AskProposal } from "@shared/schemas/ask";
import type { ContactDetail } from "@shared/types";
import { internalFetch } from "../app-ref";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { ByteBudget } from "../services/ask/limits";
import type { ToolCtx, ToolDef } from "../services/ask/tool-def";
import { TOOLS, executeTool } from "../services/ask/tools";
import { authenticateToken } from "../services/tokens";

/**
 * Model Context Protocol server over stateless Streamable HTTP: one POST per
 * JSON-RPC message, JSON responses, no sessions or server-initiated streams.
 * Authenticated with an API token (Account → API tokens). Read tools are the
 * Ask read tools; write tools run the Ask proposal tools and apply the result
 * immediately through the app's own API as the token's user.
 */
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_VERSION = "2025-06-18";
const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `opsec▮ is a personal CRM: people, pets and organisations with typed relationships, interactions (calls, meals, notes…), life events, tags, contact methods and notes. Ids are ULIDs; always search_contacts first and use ids from results. A relationship reads "from is the <type> of to". Dates: birthdays and "met on" use partial dates (YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD, --MM); interactions use ISO-8601 datetimes and default to now. Write tools apply immediately (they need a write-scoped token); destructive ones must be called again with confirm: true.`;

/** Proposal tool → MCP write tool name. */
const WRITE_NAMES: Record<string, string> = {
  propose_interaction: "create_interaction",
  propose_contact_note: "append_contact_note",
  propose_contact_update: "update_contact",
  propose_contact_create: "create_contact",
  propose_tags: "set_tags",
  propose_contact_method: "contact_method",
  propose_relationship: "relationship",
  propose_life_event: "life_event",
  propose_interaction_update: "update_interaction",
  propose_interaction_delete: "delete_interaction",
  propose_archive: "archive_contact",
};
const DESTRUCTIVE = new Set(["delete_interaction"]);

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The Ask tool behind it. */
  tool: ToolDef<z.ZodObject>;
  write: boolean;
}

function jsonSchemaOf(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return rest;
}

function writeDescription(t: ToolDef<z.ZodObject>, name: string): string {
  const base = t.description
    .replace(/\s*Shown to the user[^.]*\./g, "")
    .replace(/;?\s*nothing is saved by you\.?/g, ".")
    .replace(/^Draft (a |an |changes |adding|archiving|deleting|text )?/i, (m) => m.replace(/^Draft /i, ""))
    .replace(/\.\./g, ".");
  const tail = DESTRUCTIVE.has(name) || name === "archive_contact" || /remove/.test(t.description) ? " Removals, deletions and archiving require confirm: true." : "";
  return `Applies immediately (no review step). ${base.charAt(0).toUpperCase()}${base.slice(1)}${tail}`;
}

function buildTools(): McpTool[] {
  const out: McpTool[] = [];
  for (const t of TOOLS) {
    if (t.name.startsWith("propose_")) {
      const name = WRITE_NAMES[t.name];
      if (!name) continue;
      const schema = t.schema.extend({ confirm: z.boolean().optional().describe("Required (true) for removals, deletions and archiving") });
      out.push({ name, description: writeDescription(t, name), inputSchema: jsonSchemaOf(schema), tool: t, write: true });
    } else {
      out.push({ name: t.name, description: t.description, inputSchema: jsonSchemaOf(t.schema), tool: t, write: false });
    }
  }
  return out;
}
let toolsCache: McpTool[] | null = null;
const mcpTools = () => (toolsCache ??= buildTools());

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const textResult = (text: string, isError = false) => ({ content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) });

type C = Context<AppEnv>;

const app = new Hono<AppEnv>();

app.use("/mcp", async (c, next) => {
  c.set("db", getDb(c.env.DB));
  const auth = await authenticateToken(c.get("db"), c.env, c.req.header("authorization"));
  if (!auth) {
    c.header("WWW-Authenticate", 'Bearer realm="opsec", error="invalid_token"');
    return c.json(rpcError(null, -32001, "Unauthorized: send an API token (Account → API tokens) as Authorization: Bearer <token>"), 401);
  }
  c.set("user", auth.user);
  c.set("actor", auth.user.sub);
  c.set("tokenScope", auth.scope);
  await next();
});

app.get("/mcp", (c) => c.json({ error: "Stateless MCP server: POST JSON-RPC messages to /mcp" }, 405));
app.delete("/mcp", (c) => c.body(null, 405));

app.post("/mcp", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "Parse error"), 400);
  }
  const messages = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];
  let protocolVersion = c.req.header("mcp-protocol-version") ?? DEFAULT_VERSION;
  for (const raw of messages) {
    const msg = (raw ?? {}) as JsonRpcRequest;
    const id = msg.id ?? null;
    const isNotification = msg.id === undefined;
    try {
      const result = await handle(c, msg, (v) => (protocolVersion = v));
      if (!isNotification) responses.push(rpcResult(id, result));
    } catch (e) {
      if (isNotification) continue;
      const err = e as { code?: number; message?: string };
      responses.push(rpcError(id, typeof err.code === "number" ? err.code : -32603, err.message ?? "Internal error"));
    }
  }
  c.header("MCP-Protocol-Version", SUPPORTED_VERSIONS.includes(protocolVersion) ? protocolVersion : DEFAULT_VERSION);
  if (responses.length === 0) return c.body(null, 202);
  return c.json(Array.isArray(body) ? responses : responses[0]);
});

class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle(c: C, msg: JsonRpcRequest, setVersion: (v: string) => void): Promise<unknown> {
  const params = msg.params ?? {};
  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_VERSION;
      const version = SUPPORTED_VERSIONS.includes(requested) ? requested : DEFAULT_VERSION;
      setVersion(version);
      return {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "opsec", version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      };
    }
    case "ping":
      return {};
    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/roots/list_changed":
      return null;
    case "tools/list": {
      const scope = c.get("tokenScope");
      const tools = mcpTools()
        .filter((t) => !t.write || scope === "write")
        .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      return { tools };
    }
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      const tool = mcpTools().find((t) => t.name === name);
      if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
      return tool.write ? callWrite(c, tool, args) : callRead(c, tool, args);
    }
    default:
      if (msg.method?.startsWith("notifications/")) return null;
      throw new RpcError(-32601, `Method not found: ${msg.method}`);
  }
}

function ctxFor(c: C, emit: ToolCtx["emit"] = () => {}): ToolCtx {
  return { db: c.get("db"), emit, budget: new ByteBudget(), pending: new Map() };
}

async function callRead(c: C, tool: McpTool, args: Record<string, unknown>) {
  const out = await executeTool({ id: "mcp", name: tool.tool.name, argsJson: JSON.stringify(args) }, ctxFor(c));
  return textResult(out.content, !out.ok);
}

async function callWrite(c: C, tool: McpTool, args: Record<string, unknown>) {
  if (c.get("tokenScope") !== "write") return textResult("This API token is read-only; create a write-scoped token to change data.", true);
  const { confirm, ...rest } = args;
  const proposals: AskProposal[] = [];
  const out = await executeTool({ id: "mcp", name: tool.tool.name, argsJson: JSON.stringify(rest) }, ctxFor(c, (e) => void (e.type === "proposal" && proposals.push(e.proposal))));
  if (!out.ok) return textResult(out.content, true);
  const p = proposals[0];
  if (!p) return textResult("The tool produced no change to apply.", true);

  const base = new URL(c.req.url);
  const headers = { "content-type": "application/json", authorization: c.req.header("authorization") ?? "" };
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await internalFetch(new Request(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), c.env);
    const text = await res.text();
    if (!res.ok) throw new RpcError(-32000, `Apply failed (${res.status}): ${text.slice(0, 500)}`);
    return text ? (JSON.parse(text) as unknown) : null;
  };

  if (p.kind === "action") {
    if (p.destructive && confirm !== true) {
      return textResult(`${p.title}: this cannot be undone. Call again with confirm: true to apply. Changes: ${JSON.stringify(p.changes)}`, true);
    }
    const result = await send(p.request.method, p.request.path, p.request.body);
    return textResult(JSON.stringify({ applied: p.title, changes: p.changes, result: compact(result) }));
  }
  if (p.kind === "interaction") {
    const result = await send("POST", "/api/interactions", p.input);
    return textResult(JSON.stringify({ applied: `Logged interaction “${p.input.summary}”`, result: compact(result) }));
  }
  const current = (await send("GET", `/api/contacts/${p.contact.id}`)) as ContactDetail;
  const notes = current.notes ? `${current.notes.trimEnd()}\n\n${p.appendText}` : p.appendText;
  await send("PATCH", `/api/contacts/${p.contact.id}`, { notes });
  return textResult(JSON.stringify({ applied: `Appended a note to ${p.contact.displayName}` }));
}

/** Keep apply results small: ids and names are what the caller needs next. */
function compact(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const keep = ["id", "displayName", "summary", "title", "name", "occurredAt", "kind", "updated"];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in o) out[k] = o[k];
  return Object.keys(out).length ? out : JSON.stringify(v).slice(0, 2000);
}

export default app;
