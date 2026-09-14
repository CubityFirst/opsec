# Contributing

Thanks for looking. This is a personal CRM on a single Cloudflare Worker; `README.md` explains what
it is and how to deploy your own, and `CLAUDE.md` holds the conventions that are easy to get wrong.

## Before you open a pull request

```bash
npm install
npm run dev          # Vite + Worker in workerd, local D1/R2 under .wrangler/state
npm run typecheck    # all three TS projects
npm test             # API tests (vitest + @cloudflare/vitest-pool-workers)
npm run build        # must pass before anything ships
```

Storage is shared within a test file, so never assume an empty database. Schema changes follow
README → Schema changes: edit `src/worker/db/schema.ts`, `npm run db:generate`, read the SQL,
`npm run db:migrate:local`, and commit the migration with the code that needs it.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The subject line is:

```
<type>(<scope>): <summary>
```

- **type** — one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, `revert`.
- **scope** — optional, the part of the app: `contacts`, `interactions`, `life-events`, `reminders`,
  `bets`, `gifts`, `timeline`, `map`, `tags`, `ask`, `mcp`, `calendar`, `auth`, `files`, `dashboard`,
  `pwa`, `db`, `deps`. Use the closest existing one rather than inventing a synonym.
- **summary** — imperative mood, lower case, no full stop, 72 characters or fewer:
  `feat(contacts): show country of origin as a flag in the list`.

Put the reasoning in the body, wrapped at about 100 characters, and say what you decided *not* to do
where that is interesting. Long bodies are welcome — this repository's history is meant to explain
itself years later. Note a migration by number (`migration 0028`) and mention the tests you added.

Breaking changes get a `!` after the type (`feat(api)!: …`) and a `BREAKING CHANGE:` footer
explaining the migration path.

```
feat(contacts): add a country of origin with a flag in the list

Free text like the religion field, so "Kurdistan" is kept as typed; the ICU name list
(npm run countries) only powers the picker and the flag lookup. Ambiguous short forms
("Congo") deliberately resolve to nothing rather than guessing between two countries.

migration 0027; tests in test/countries.test.ts
```

## Style

- Validate input with zod in `src/shared/schemas`; response shapes are types in `src/shared/types.ts`.
- Every multi-table write goes through `runBatch` — D1 has no interactive transactions.
- Match the surrounding code: comments explain *why*, not what, and the existing files set the bar.
- Keep secrets out of API responses, tests and commit messages.
