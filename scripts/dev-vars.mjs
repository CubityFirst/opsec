// Names set in .dev.vars.development or .dev.vars (the first that exists, as the Vite plugin
// reads them). Used by cloudflare.config.ts to declare a local secret per key under `cf dev`.
//
// Plain JavaScript on purpose: cloudflare.config.ts is also type-checked by the Worker project
// (the generated .cloudflare/types import it), which has no Node types, so the config itself
// must not import node:* modules. dev-vars.d.mts gives this file its type.
import { readFileSync } from "node:fs";

export function devVarNames() {
	for (const file of [".dev.vars.development", ".dev.vars"]) {
		let text;
		try {
			// Relative to the working directory, like the Vite plugin's envDir (the project root).
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		return [...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1]);
	}
	return [];
}
