# Reference

## Data model

Text ULID primary keys, ISO-8601 UTC timestamps.

| Table | Purpose |
|---|---|
| `contacts` | kind = person / pet / organization, names (plus `other_names` JSON: Chinese name, English name, maiden name…), how we met (`met_on` partial date, `met_where`, `met_how`, `met_via_contact_id`), work (`job_title`, `employer_contact_id` → an organisation; setting it maintains the employer ↔ employee relationship), birthday / founded (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `--MM-DD` or `--MM`, whichever parts are known), notes, custom_fields JSON, archived_at, `deceased_at` + `deceased_on` (people and pets; an archive-like state that keeps relationships) |
| `contact_methods` | phone / email / address / social / url / other, with label and is_primary. For `social`, the label is a platform key and the value the canonical profile URL (see `src/shared/social.ts`; icons from simple-icons). An `address` may carry `lat` / `lng` and an optional `radius_m` (exposed as `coordinates`, with `radius` in metres for "somewhere around here") and is then a pin on the map |
| `tags`, `contact_tags` | case-insensitive tags |
| `relationship_types` | seeded lookup with `inverse_key` (parent ↔ child, owner ↔ pet, …) and `from_kinds` / `to_kinds` saying which contact kinds each end may be (an organisation can be an employer or a supplier, not a parent) |
| `relationships` | one directed row per link: "from is the `type` of to" |
| `interactions`, `interaction_contacts` | call / text / meal / … with one or more participants, a free-text `location` and optional `lat` / `lng` / `radius_m` (exposed as `coordinates`) for the map |
| `life_events` | milestones per contact in five categories (work & education, family & relationships, home & living, health & wellness, travel & experiences) with a partial date; shown in the feed at that date |
| `reminders` | a to-do with a `title`, `notes`, the next `due_on` day and, if recurring, `repeat_every` × `repeat_unit` (day / week / month / year) with an optional `repeat_until`, anchored on `start_on` so month and year rules do not drift; optional `contact_id`; `completed_at` once nothing is left, plus `last_completed_on` and `completed_count` |
| `gifts` | a gift with one contact: `name`, `status` (`idea` / `given` / `received`), optional `occasion`, `given_on` day (null for an idea), `price`, `url`, `notes` |
| `bets` | a wager with one contact: the user's `prediction` (the contact takes the other side), optional `wager`, `made_on` and `review_on` days, `details`; open until `outcome` (`me` / `them` / `void`) is set with `settled_at` and a `settled_note` on how it fell |
| `calendar_feeds` | iCalendar subscription feeds per user: `name`, `sources` JSON (which record types it carries), the secret `key` in the URL, `last_fetched_at` |
| `files` | R2 object metadata: `avatar` (cropped 512×512 WebP), `avatar_original` (the untouched upload, viewable full-size), `attachment` |
| `activity` | append-only event log per contact with versioned JSON payloads |

Interaction details and notes are markdown. `[@Name](/contacts/<id>)` mentions a contact
(the editor inserts these when you type `@`), and `#tag` links to the contacts list filtered
by that tag. Mentioning a contact who is not a participant adds an `interaction.mentioned`
entry to their activity feed.

The activity log is written in the same D1 batch as the change it describes, so it
never drifts from the data. Payload shapes are the zod union in
`src/shared/schemas/activity.ts`; `GET /api/activity?since=<ulid>` streams the log
for programmatic consumers.

Relationship rows are stored once. Reading a contact's relationships returns each
link from that contact's perspective: `typeLabel` is the *other* contact's role
(on Alice's page Rex reads "Pet"; on Rex's page Alice reads "Owner").

## API

All routes are under `/api`, JSON in and out. Lists return `{ items, total }`;
errors return `{ error: { code, message, issues? } }`. API tokens (see [Ask and MCP](ask.md#mcp-server-and-api-tokens)) work as `Authorization: Bearer …`.

- `GET/POST /contacts` (`?archived=true`, `?deceased=true`; the default list is living, unarchived contacts), `GET/PATCH/DELETE /contacts/:id`, `POST /contacts/:id/archive|unarchive`, `POST /contacts/:id/deceased` (`{ on?: partial date }`) / `DELETE /contacts/:id/deceased`, `PUT /contacts/:id/tags`, `POST /contacts/bulk` (`{ ids, action: addTags|removeTags|archive|unarchive|delete|setFields, tagNames?, fields? }`)
- `GET/POST /contacts/:id/methods`, `PATCH/DELETE /contacts/:id/methods/:methodId`
- `GET /contacts/:id/relationships`, `POST /relationships`, `GET/PATCH/DELETE /relationships/:id`, `GET /relationship-types`
- `GET /contacts/:id/interactions`, `GET/POST /interactions`, `GET/PATCH/DELETE /interactions/:id`
- `GET/POST /contacts/:id/life-events`, `GET/PATCH/DELETE /life-events/:id`
- `GET /gifts` (`?status=idea|given|received`; ideas first, then by date; the response also carries `counts` of idea / given / received), `GET/POST /contacts/:id/gifts`, `GET/PATCH/DELETE /gifts/:id`, `POST /gifts/:id/give` (`{ on?, occasion?, price? }`, idea → given), `POST /gifts/:id/revert` (back to an idea)
- `GET /bets` (`?status=open|settled`, `?dueBy=YYYY-MM-DD` for open bets whose review date has arrived; open first, then settled; the response also carries a `record` of open / won / lost / void), `GET/POST /contacts/:id/bets`, `GET/PATCH/DELETE /bets/:id`, `POST /bets/:id/settle` (`{ outcome: me|them|void, note? }`), `POST /bets/:id/reopen`
- `GET /reminders` (`?status=open|done`, `?dueBy=YYYY-MM-DD` for open reminders due by that day, `?contactId=`; open first by due day, then done; the response also carries open / done `counts`), `POST /reminders` (`{ contactId?, title, notes?, dueOn, repeat?: { every, unit, until? } }`), `GET /contacts/:id/reminders`, `GET/PATCH/DELETE /reminders/:id`, `POST /reminders/:id/complete` (a one-off is done; a recurring one moves to the first occurrence after today or its due day), `POST /reminders/:id/skip` (recurring only, no completion recorded), `POST /reminders/:id/reopen`
- `GET /map/pins` (`?contactId=` for one contact's addresses and the interactions they took part in, `?archived=true` to add archived contacts; the response carries `counts` of contact and interaction pins), `GET /geocode?q=` (address search, at most five results), `GET /geocode/reverse?lat=&lng=` (the place at a position, or `null`)
- `GET /timeline?from=YYYY-MM-DD&to=YYYY-MM-DD` (`&kinds=interaction,lifeEvent,gift,bet` to narrow; at most 400 days; items newest first plus per-kind `counts` for the whole range)
- `GET /contacts/:id/activity` (merged feed), `GET /activity` (raw log)
- `POST/DELETE /contacts/:id/avatar` (multipart `file` = cropped avatar, optional `original` = full photo), `POST /interactions/:id/files`, `GET /contacts/:id/files`, `GET /files/:id`, `DELETE /files/:id`
- `GET /search?q=`, `GET/POST /tags`, `PATCH/DELETE /tags/:id`
- `GET/POST /calendar-feeds`, `PATCH/DELETE /calendar-feeds/:id`, `POST /calendar-feeds/:id/rotate` (new secret URL); the feed itself is `GET /calendar/<key>.ics` outside `/api` (see [Calendar feeds](#calendar-feeds))
- `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout`
- `GET /branding` (public: the sign-in page needs the name), `PUT /branding`, `DELETE /branding` (admin only; DELETE restores the defaults)
- `POST /dev/seed` (only when `ENVIRONMENT=development`)

## Calendar feeds

**Account → Calendar feeds** publishes your data as iCalendar (`.ics`) subscriptions for Google Calendar, Apple Calendar, Outlook or anything else that reads the format. Create as many feeds as you like, each with its own name and its own choice of sources, so one calendar can carry only birthdays and reminders while another shows the full interaction history:

- **Interactions**: every logged interaction, past and planned (an interaction dated in the future is simply a plan), as a one-hour event at `occurredAt`, with the participants in the title, the body and location, and a link back to the interaction page.
- **Reminders**: open reminders as all-day events on their next due day; a recurring reminder becomes an `RRULE` (month and year rules keep the app's "31st, or the last day of a shorter month" semantics via `BYMONTHDAY=31,-1;BYSETPOS=1`). Completed reminders are not included.
- **Birthdays**: a yearly all-day event for every living, unarchived person or pet whose birthday has a known month and day (29 February falls on the 28th in common years).
- **Life events** with a full date, **bets** that are still open (on their review day) and **gifts** that were given or received (on that day), all as all-day events.

Timed events are always written in UTC (`…Z`); your calendar app converts them to its own zone. All-day events are dates without a zone. Every event has a stable `UID`, so a refresh updates events in place.

Each feed lives at `/calendar/<key>.ics`, where the key is a random 256-bit secret and the only credential: calendar clients send no cookies or headers. Treat the URL like a password; **New URL** replaces the key so the old link stops working, and deleting the feed does the same. Feeds are per user and, in `oidc` mode, stop working if the owner's account is no longer allowed in. They cannot be managed with an API token. The **Subscribe** button opens the `webcal://` form of the URL for Apple Calendar and Outlook; for Google Calendar paste the `https://` URL under *Other calendars → From URL* (Google refreshes subscribed calendars only every several hours).

## Map

The **Map** page (and the Locations card on a contact's Overview tab, which also lists the contact's addresses with add, edit, remove and "Show on map") shows contacts at their addresses and interactions where they happened. Coordinates are optional on any address contact method and on any interaction; set them from the address or interaction dialog by searching for a place, pressing *use my location*, or clicking a spot on the small map. A pin can be approximate: choose a precision (about 1 km, 10 km, …) and it is drawn as a circle, and picking a town or region from the search sets one automatically from the size of the place. Right-click (or long-press) either map to log an interaction or add an address at that spot, and open a pin to unpin it or delete the interaction. Contact and interaction layers can be toggled, pins at the same spot are grouped, and "Show on map" links from an address or an interaction focus their pin.

What the map sends to OpenStreetMap is described in [Security and privacy](security.md#outside-services-the-map).

## Branding

**Account → Branding** (admin only) decides what the instance calls itself. Four fields, all optional except the first:

- **Name** — the wordmark in the sidebar, on the sign-in card, in the "Added to …" line of a contact's history and anywhere else the app names itself. Defaults to `opsec▮`.
- **Browser tab title** — the `<title>`; blank uses the name.
- **Short name** — what sits under the icon on a home screen; blank uses the name.
- **Sign-in tagline** — the line under the name on the sign-in page; blank hides it.

The settings live in one `app_settings` row, so they are per instance rather than per user, and `GET /api/branding` is public because the sign-in page is rendered before there is a session. The Worker serves `/manifest.webmanifest` by taking the file in `public/` and overriding `name` and `short_name`, so an installed PWA picks the new name up on its next refresh. Icons, colours and the `<title>` in `index.html` (the one shown before the app boots) are still files in `public/` and the repo — change those to go further.
