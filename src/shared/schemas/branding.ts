import { z } from "zod";
import { nonBlank } from "./common";

/**
 * What the app calls itself. Defaults are the stock opsec▮ wording; an admin can
 * rename the whole instance from the Account page (see routes/branding.ts).
 */
export interface Branding {
  /** Wordmark in the sidebar, on the sign-in card and wherever the app names itself. */
  name: string;
  /** Home-screen / PWA name; blank falls back to {@link Branding.name}. */
  shortName: string;
  /** Browser tab title; blank falls back to {@link Branding.name}. */
  title: string;
  /** One line under the sign-in title; blank hides it. */
  tagline: string;
}

export const DEFAULT_BRANDING: Branding = {
  name: "opsec▮",
  shortName: "opsec",
  title: "",
  tagline: "Sign in to see your people.",
};

export const brandingUpdateSchema = z.object({
  name: nonBlank(40),
  shortName: z.string().trim().max(30).default(""),
  title: z.string().trim().max(80).default(""),
  tagline: z.string().trim().max(160).default(""),
});
export type BrandingUpdate = z.infer<typeof brandingUpdateSchema>;
export type BrandingInput = z.input<typeof brandingUpdateSchema>;

/** Tab title: the explicit one, else the name. */
export function brandTitle(b: Branding): string {
  return b.title || b.name;
}

/** Home-screen name: the explicit one, else the name. */
export function brandShortName(b: Branding): string {
  return b.shortName || b.name;
}

export interface BrandingOut {
  branding: Branding;
  /** Where the active branding comes from: saved in the app, or the built-in defaults. */
  source: "db" | "default";
  updatedAt: string | null;
}
