# Ask and MCP

## Ask

The **Ask** tab is a chat over your CRM data ("When did I last speak to Alice, and what about?"). The model investigates with read-only tools (`search_contacts`, `get_contact`, `list_interactions`, `get_interaction`, `get_activity`, `list_life_events`, `list_bets`, `list_gifts`, `list_reminders`) and can *propose* any change (new interactions and contacts; edits to names, pronouns, birthday, how-we-met, job and employer, custom fields, tags, contact methods, relationships, life events, bets, gifts, reminders and existing interactions; settling bets; giving gift ideas; completing, skipping and reopening reminders; marking someone as deceased; archiving and deletions) that you apply with a button; it never writes on its own. When it needs a decision first ("Nobody called Sam Lee exists. Shall I create them?") it can offer a few one-tap replies under the question; tapping one sends it as your next message. Conversations live in the browser only. You can paste or attach a screenshot and ask the model to describe or log it.

The backend speaks the **OpenAI Chat Completions** wire format, so any compatible server works: Cloudflare AI Gateway, Anthropic's compatibility layer, llama.cpp, OpenRouter… Provider choice is pure configuration.

| Setting | Where | Meaning |
|---|---|---|
| `AI_BASE_URL` | var | OpenAI-compatible base URL (requests go to `{base}/chat/completions`) |
| `AI_MODEL` | var | Model name as the provider expects it |
| `AI_LABEL` | var | Shown in the Ask header |
| `AI_EXTRA_BODY` | var, optional JSON object | Merged into every request, e.g. `{"thinking":{"type":"adaptive"}}` |
| `AI_API_KEY` | secret | Provider key. `none` (or empty) sends **no** `Authorization` header, which is what BYOK gateways need to substitute their stored key and what llama.cpp expects |
| `AI_EXTRA_HEADERS` | secret, optional JSON object | Extra headers, e.g. `{"cf-aig-authorization":"Bearer <token>"}` |
| `TIMEZONE` | var, optional | IANA zone you live in (`Europe/London`), so "9am" in a question means 9am there. The Ask tab sends the browser's zone with every question and only falls back to this; MCP clients have nothing else, so set it if you use them. Unset = UTC |

Set vars in `wrangler.jsonc`, secrets with `npx wrangler secret put <NAME>`; locally put all of them in `.dev.vars`. These are the deployment defaults.

**Changing the provider on the fly:** admins get an **Ask provider** card on the Account page. Pick a preset (Cloudflare AI Gateway, OpenAI, Anthropic, OpenRouter, llama.cpp, custom), fill in the base URL, model, key and any extra headers or request fields, press **Test** to run a one-token completion against the unsaved values, then **Save**. Saved settings take effect on the next question without a redeploy and override the vars above; **Use deployment settings** removes them again. They live in the `app_settings` table; the API key and extra headers are encrypted with AES-GCM under a key derived from `SESSION_SECRET` and are never returned to the browser (the UI only shows whether they are set). Rotating `SESSION_SECRET` therefore also invalidates the stored secrets; re-enter them.

Presets:

1. **Cloudflare AI Gateway compat + BYOK (default in `wrangler.jsonc`)** — base `https://gateway.ai.cloudflare.com/v1/<account>/opsec/compat`, model `{provider}/{model}` such as `openai/gpt-5.6-luna` (current default) or `anthropic/claude-sonnet-5`, key `none`, headers `{"cf-aig-authorization":"Bearer <AI Gateway Run token>"}`. Setup steps below. Note for `gpt-5.6-luna`: OpenAI rejects function tools on `/chat/completions` unless `reasoning_effort` is `none` (the alternative is the Responses API, which Ask does not speak), so the default sets `AI_EXTRA_BODY={"reasoning_effort":"none"}`; drop that field when using another model.
2. **AI Gateway → Anthropic compat** — base `https://gateway.ai.cloudflare.com/v1/<account>/opsec/anthropic/v1`, model `claude-sonnet-5`, same headers. Use this if the compat endpoint does not pass tool calls or images through.
3. **Anthropic direct** — base `https://api.anthropic.com/v1`, model `claude-sonnet-5`, key = your Anthropic API key.
4. **llama.cpp** — base `http://host:8080/v1`, key `none`, `AI_EXTRA_BODY={"parallel_tool_calls":true}` if the model supports it. Start `llama-server --jinja` with a tool-capable chat template (and `--mmproj` for images). A deployed Worker needs a tunnel (e.g. `cloudflared`) to reach a LAN box; `npm run dev` can use `localhost` directly.
5. **OpenRouter / other gateways** — their base URL, key and model naming.

### Setting up the default preset (AI Gateway + BYOK)

Wrangler has no AI Gateway commands, so the gateway side is done in the Cloudflare dashboard.

1. **Create the gateway.** Dashboard → AI → AI Gateway → *Create Gateway*, name `opsec`. The `AI_BASE_URL` in `wrangler.jsonc` already points at `…/<account>/opsec/compat`; if you pick another name, change that var.
2. **Make it authenticated.** Open the gateway → *Settings* → *Authentication*: create a token of type **AI Gateway Run**, copy it into your secret manager, and turn **Authenticated Gateway** on. BYOK requires an authenticated gateway.
3. **Store the provider key in the gateway.** Gateway → *Provider Keys* → add the provider named in `AI_MODEL` (**OpenAI** for the default, or Anthropic), alias `default`, paste its API key. The Worker never sees this key.
4. **Give the Worker the gateway token.** From the repo, paste the value at the prompt (never into a chat, shell history or commit):

   ```sh
   npx wrangler secret put AI_EXTRA_HEADERS   # {"cf-aig-authorization":"Bearer <AI Gateway Run token>"}
   npx wrangler secret put AI_API_KEY         # none
   ```

   Secrets apply immediately; no redeploy is needed. For local dev put the same two lines in `.dev.vars` (see `.dev.vars.example`).
5. **Check it.** A credential-free `POST …/opsec/compat/chat/completions` returns 401 `Unauthorized` from AI Gateway once the gateway exists and is authenticated. Then open `/ask` and ask "Who is Rex?" (after `POST /api/dev/seed` locally): the trail should show a `search_contacts` call followed by an answer. Error codes in the UI: `provider_auth` → the gateway token; `upstream 4xx` → the provider key or model name; no tool call ever appearing → the compat endpoint is not passing tools through, switch to preset 2.
6. **Optional privacy.** AI Gateway logs prompts and responses by default. Add `"cf-aig-collect-log-payload":"false"` to `AI_EXTRA_HEADERS` to keep payloads out of the gateway logs.

The request sets `max_completion_tokens` (OpenAI rejects the older `max_tokens` on current models); a server that only understands `max_tokens` can be given it through the extra request fields.

### Limits and spend

Per-request caps bound a single question; only the last 20 turns (6,000 characters each) are sent to the model. Overall spend is best managed where the bill is: a budget on the provider account, and rate limiting on the AI Gateway when you route through one.

Limits per question: 12 model iterations, 6 tool calls per iteration, 12 KB per tool result, 120 KB of tool results in total, 40 turns of history, one image up to 1568 px on the long edge. Worker logs record only counts and timings, never questions, tool payloads or images.

## MCP server and API tokens

The Worker is also a [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp` (stateless Streamable HTTP), so Claude Code, Claude Desktop, ChatGPT and other MCP clients can use your CRM directly. Create a token under **Account → API tokens**, choosing *read only* or *read and write*, then:

```sh
claude mcp add opsec --transport http https://<your host>/mcp --header "Authorization: Bearer <token>"
```

- **Read tools** are the Ask read tools: `search_contacts`, `get_contact`, `list_interactions`, `get_interaction`, `get_activity`, `list_life_events`, `list_bets`, `list_gifts`, `list_reminders`.
- **Write tools** (write-scoped tokens only) are the Ask proposal tools applied immediately through the app's own API, so validation and the activity log are identical to the UI: `create_contact`, `update_contact`, `set_tags`, `contact_method`, `relationship`, `life_event`, `bet` (add / update / settle / reopen / remove), `gift` (add / update / give / revert / remove), `reminder` (add / update / complete / skip / reopen / remove), `create_interaction`, `update_interaction`, `delete_interaction`, `append_contact_note`, `archive_contact`, `mark_deceased`. Removals, deletions and archiving must be called again with `confirm: true`.
- The same token works for the JSON API (`Authorization: Bearer …`); read-only tokens are refused for anything but GET. Tokens act as the user who created them, are stored hashed, can be revoked at any time, and cannot mint or revoke other tokens.
