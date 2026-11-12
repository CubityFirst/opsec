// Apply ./drizzle to the remote D1 database of a cloudflare.config.ts mode, found by name.
//
//   node scripts/migrate-remote.mjs [--mode <mode>] [--if-exists] [--dry-run]
//
// `cf d1 migrations apply` only takes a database ID, but the template's database has none in
// the config: `cf deploy` provisions it by name on the first deploy. This looks the ID up
// with `cf d1 list` and applies the migrations to it. With --if-exists a missing database is
// not an error (the first deploy has not created it yet), so `npm run deploy` can migrate
// before uploading the new code and again afterwards for a brand-new instance.
//
// Mode `prod` (the author's instance) declares its ID, which is used as is.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const modeAt = args.indexOf("--mode");
const mode = modeAt >= 0 ? args[modeAt + 1] : "production";
const ifExists = args.includes("--if-exists");
const dryRun = args.includes("--dry-run");

// The project's own cf, run by this Node (no shell, so nothing is re-parsed on Windows).
const cfBin = fileURLToPath(new URL("../node_modules/cf/bin/cf", import.meta.url));
const cf = (cfArgs, opts = {}) => execFileSync(process.execPath, [cfBin, ...cfArgs], opts);

const { default: config } = await import("../cloudflare.config.ts");
const { worker } = await config({ mode, isPreview: false });
const db = worker.env.DB;
if (db?.type !== "d1" || !db.name) throw new Error(`mode ${mode}: no D1 binding named DB in cloudflare.config.ts`);

let id = db.id;
if (!id) {
	const found = JSON.parse(cf(["d1", "list", "--name", db.name], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
	id = found.find((d) => d.name === db.name)?.uuid;
}
if (!id) {
	if (ifExists) {
		console.log(`D1 database "${db.name}" does not exist yet; cf deploy will create it.`);
		process.exit(0);
	}
	throw new Error(`D1 database "${db.name}" not found on this account`);
}

console.log(`${dryRun ? "Pending (dry run)" : "Applying"} ./drizzle to D1 database "${db.name}" (${id})`);
cf(["d1", "migrations", dryRun ? "list" : "apply", id, "--dir", "drizzle"], { stdio: "inherit" });
