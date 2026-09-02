/**
 * Social platform registry. A `social` contact method stores the platform
 * key in `label` and the canonical profile URL in `value` (or just the handle
 * for platforms without profile URLs, such as Discord and Signal). Everything
 * else — icon, colour, handle display — is derived from this table.
 */
export interface SocialPlatform {
  key: string;
  name: string;
  /** simple-icons export name (e.g. "siX"); null when no brand icon is available. */
  icon: string | null;
  /** Brand colour hex without '#'. */
  color: string;
  /** Hostnames (without www.) that identify this platform in a pasted URL. */
  hosts: string[];
  /** Canonical profile URL for a handle; null for platforms without profile pages. */
  profileUrl: ((handle: string) => string) | null;
  /** Pull the handle out of a URL path, e.g. "/@alice/videos" → "alice". */
  handleFromPath?: (path: string) => string | null;
  placeholder: string;
}

const firstSegment = (path: string, strip: RegExp | null = null): string | null => {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let h = decodeURIComponent(parts[0]!);
  if (strip) h = h.replace(strip, "");
  return h || null;
};
const afterPrefix = (prefixes: string[]) => (path: string) => {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2 && prefixes.includes(parts[0]!.toLowerCase())) return decodeURIComponent(parts[1]!);
  if (parts.length >= 1 && parts[0]!.startsWith("@")) return decodeURIComponent(parts[0]!.slice(1));
  return null;
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "x", name: "X (Twitter)", icon: "siX", color: "000000", hosts: ["x.com", "twitter.com", "mobile.twitter.com"], profileUrl: (h) => `https://x.com/${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@handle or profile URL" },
  { key: "youtube", name: "YouTube", icon: "siYoutube", color: "FF0000", hosts: ["youtube.com", "m.youtube.com", "youtu.be"], profileUrl: (h) => (h.startsWith("UC") && h.length > 20 ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`), handleFromPath: (p) => afterPrefix(["channel", "c", "user"])(p) ?? firstSegment(p, /^@/), placeholder: "@channel or channel URL" },
  { key: "facebook", name: "Facebook", icon: "siFacebook", color: "0866FF", hosts: ["facebook.com", "m.facebook.com", "fb.com", "fb.me"], profileUrl: (h) => `https://www.facebook.com/${h}`, handleFromPath: (p) => afterPrefix(["people", "profile.php"])(p) ?? firstSegment(p), placeholder: "username or profile URL" },
  { key: "instagram", name: "Instagram", icon: "siInstagram", color: "FF0069", hosts: ["instagram.com", "instagr.am"], profileUrl: (h) => `https://www.instagram.com/${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@handle or profile URL" },
  { key: "linkedin", name: "LinkedIn", icon: null, color: "0A66C2", hosts: ["linkedin.com"], profileUrl: (h) => `https://www.linkedin.com/in/${h}`, handleFromPath: afterPrefix(["in", "company", "school"]), placeholder: "profile slug or URL" },
  { key: "tiktok", name: "TikTok", icon: "siTiktok", color: "000000", hosts: ["tiktok.com", "vm.tiktok.com"], profileUrl: (h) => `https://www.tiktok.com/@${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@handle or profile URL" },
  { key: "threads", name: "Threads", icon: "siThreads", color: "000000", hosts: ["threads.net", "threads.com"], profileUrl: (h) => `https://www.threads.net/@${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@handle or profile URL" },
  { key: "bluesky", name: "Bluesky", icon: "siBluesky", color: "1185FE", hosts: ["bsky.app"], profileUrl: (h) => `https://bsky.app/profile/${h}`, handleFromPath: afterPrefix(["profile"]), placeholder: "handle.bsky.social or profile URL" },
  { key: "mastodon", name: "Mastodon", icon: "siMastodon", color: "6364FF", hosts: ["mastodon.social", "mastodon.online", "mstdn.social", "fosstodon.org", "hachyderm.io", "mas.to"], profileUrl: (h) => { const m = /^@?([^@]+)@(.+)$/.exec(h); return m ? `https://${m[2]}/@${m[1]}` : `https://mastodon.social/@${h.replace(/^@/, "")}`; }, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@user@instance or profile URL" },
  { key: "reddit", name: "Reddit", icon: "siReddit", color: "FF4500", hosts: ["reddit.com", "old.reddit.com"], profileUrl: (h) => `https://www.reddit.com/user/${h}`, handleFromPath: afterPrefix(["user", "u"]), placeholder: "u/username or profile URL" },
  { key: "github", name: "GitHub", icon: "siGithub", color: "181717", hosts: ["github.com"], profileUrl: (h) => `https://github.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or profile URL" },
  { key: "gitlab", name: "GitLab", icon: "siGitlab", color: "FC6D26", hosts: ["gitlab.com"], profileUrl: (h) => `https://gitlab.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or profile URL" },
  { key: "twitch", name: "Twitch", icon: "siTwitch", color: "9146FF", hosts: ["twitch.tv", "m.twitch.tv"], profileUrl: (h) => `https://www.twitch.tv/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "channel or URL" },
  { key: "kick", name: "Kick", icon: "siKick", color: "53FC19", hosts: ["kick.com"], profileUrl: (h) => `https://kick.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "channel or URL" },
  { key: "discord", name: "Discord", icon: "siDiscord", color: "5865F2", hosts: ["discord.com", "discord.gg", "discordapp.com"], profileUrl: null, placeholder: "username" },
  { key: "telegram", name: "Telegram", icon: "siTelegram", color: "26A5E4", hosts: ["t.me", "telegram.me", "telegram.dog"], profileUrl: (h) => `https://t.me/${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@username or t.me link" },
  { key: "whatsapp", name: "WhatsApp", icon: "siWhatsapp", color: "25D366", hosts: ["wa.me", "api.whatsapp.com", "whatsapp.com"], profileUrl: (h) => `https://wa.me/${h.replace(/[^\d]/g, "")}`, handleFromPath: (p) => firstSegment(p), placeholder: "phone number in international format" },
  { key: "signal", name: "Signal", icon: "siSignal", color: "3B45FD", hosts: ["signal.me"], profileUrl: null, placeholder: "username or number" },
  { key: "snapchat", name: "Snapchat", icon: "siSnapchat", color: "FFFC00", hosts: ["snapchat.com"], profileUrl: (h) => `https://www.snapchat.com/add/${h}`, handleFromPath: afterPrefix(["add", "u"]), placeholder: "username or URL" },
  { key: "pinterest", name: "Pinterest", icon: "siPinterest", color: "BD081C", hosts: ["pinterest.com", "pinterest.co.uk", "pin.it"], profileUrl: (h) => `https://www.pinterest.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "tumblr", name: "Tumblr", icon: "siTumblr", color: "36465D", hosts: ["tumblr.com"], profileUrl: (h) => `https://${h}.tumblr.com`, handleFromPath: (p) => firstSegment(p), placeholder: "blog name or URL" },
  { key: "spotify", name: "Spotify", icon: "siSpotify", color: "1ED760", hosts: ["open.spotify.com", "spotify.com"], profileUrl: (h) => `https://open.spotify.com/user/${h}`, handleFromPath: afterPrefix(["user", "artist"]), placeholder: "user id or profile URL" },
  { key: "soundcloud", name: "SoundCloud", icon: "siSoundcloud", color: "FF5500", hosts: ["soundcloud.com"], profileUrl: (h) => `https://soundcloud.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "steam", name: "Steam", icon: "siSteam", color: "000000", hosts: ["steamcommunity.com"], profileUrl: (h) => (/^\d{17}$/.test(h) ? `https://steamcommunity.com/profiles/${h}` : `https://steamcommunity.com/id/${h}`), handleFromPath: afterPrefix(["id", "profiles"]), placeholder: "custom id or profile URL" },
  { key: "strava", name: "Strava", icon: "siStrava", color: "FC4C02", hosts: ["strava.com"], profileUrl: (h) => `https://www.strava.com/athletes/${h}`, handleFromPath: afterPrefix(["athletes"]), placeholder: "athlete id or URL" },
  { key: "letterboxd", name: "Letterboxd", icon: "siLetterboxd", color: "202830", hosts: ["letterboxd.com"], profileUrl: (h) => `https://letterboxd.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "goodreads", name: "Goodreads", icon: "siGoodreads", color: "1E1914", hosts: ["goodreads.com"], profileUrl: (h) => `https://www.goodreads.com/${h}`, handleFromPath: (p) => p.split("/").filter(Boolean).slice(0, 2).join("/") || null, placeholder: "user/12345-name or URL" },
  { key: "lastfm", name: "Last.fm", icon: "siLastdotfm", color: "D51007", hosts: ["last.fm"], profileUrl: (h) => `https://www.last.fm/user/${h}`, handleFromPath: afterPrefix(["user"]), placeholder: "username or URL" },
  { key: "medium", name: "Medium", icon: "siMedium", color: "000000", hosts: ["medium.com"], profileUrl: (h) => `https://medium.com/@${h}`, handleFromPath: (p) => firstSegment(p, /^@/), placeholder: "@handle or URL" },
  { key: "substack", name: "Substack", icon: "siSubstack", color: "FF6719", hosts: ["substack.com"], profileUrl: (h) => `https://${h}.substack.com`, handleFromPath: afterPrefix(["@"]), placeholder: "publication name or URL" },
  { key: "patreon", name: "Patreon", icon: "siPatreon", color: "000000", hosts: ["patreon.com"], profileUrl: (h) => `https://www.patreon.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "creator name or URL" },
  { key: "kofi", name: "Ko-fi", icon: "siKofi", color: "FF6433", hosts: ["ko-fi.com"], profileUrl: (h) => `https://ko-fi.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "vimeo", name: "Vimeo", icon: "siVimeo", color: "1AB7EA", hosts: ["vimeo.com"], profileUrl: (h) => `https://vimeo.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "flickr", name: "Flickr", icon: "siFlickr", color: "0063DC", hosts: ["flickr.com"], profileUrl: (h) => `https://www.flickr.com/people/${h}`, handleFromPath: afterPrefix(["people", "photos"]), placeholder: "username or URL" },
  { key: "behance", name: "Behance", icon: "siBehance", color: "1769FF", hosts: ["behance.net"], profileUrl: (h) => `https://www.behance.net/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "dribbble", name: "Dribbble", icon: "siDribbble", color: "EA4C89", hosts: ["dribbble.com"], profileUrl: (h) => `https://dribbble.com/${h}`, handleFromPath: (p) => firstSegment(p), placeholder: "username or URL" },
  { key: "stackoverflow", name: "Stack Overflow", icon: "siStackoverflow", color: "F58025", hosts: ["stackoverflow.com"], profileUrl: (h) => `https://stackoverflow.com/users/${h}`, handleFromPath: (p) => p.split("/").filter(Boolean).slice(1, 3).join("/") || null, placeholder: "users/12345/name or URL" },
  { key: "untappd", name: "Untappd", icon: "siUntappd", color: "FFC000", hosts: ["untappd.com"], profileUrl: (h) => `https://untappd.com/user/${h}`, handleFromPath: afterPrefix(["user"]), placeholder: "username or URL" },
  { key: "duolingo", name: "Duolingo", icon: "siDuolingo", color: "58CC02", hosts: ["duolingo.com"], profileUrl: (h) => `https://www.duolingo.com/profile/${h}`, handleFromPath: afterPrefix(["profile"]), placeholder: "username or URL" },
  { key: "website", name: "Other / website", icon: null, color: "6B7280", hosts: [], profileUrl: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`), placeholder: "https://…" },
];

export const SOCIAL_BY_KEY: ReadonlyMap<string, SocialPlatform> = new Map(SOCIAL_PLATFORMS.map((p) => [p.key, p]));

function parseUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s) ? `https://${s}` : null;
  if (!withScheme) return null;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/** Identify the platform from a pasted URL and extract the handle. */
export function detectSocial(input: string): { platform: SocialPlatform; handle: string | null } | null {
  const url = parseUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const p of SOCIAL_PLATFORMS) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      if (p.key === "mastodon") {
        const h = p.handleFromPath?.(url.pathname) ?? null;
        return { platform: p, handle: h ? `${h}@${host}` : null };
      }
      return { platform: p, handle: p.handleFromPath?.(url.pathname) ?? null };
    }
  }
  // Fediverse instances not in the list: "/@user" on an unknown host.
  const m = /^\/@([^/]+)/.exec(url.pathname);
  if (m) return { platform: SOCIAL_BY_KEY.get("mastodon")!, handle: `${decodeURIComponent(m[1]!)}@${host}` };
  return null;
}

export interface NormalizedSocial {
  /** Platform key for `label`. */
  platformKey: string;
  /** Canonical URL, or the bare handle for URL-less platforms, for `value`. */
  value: string;
  handle: string | null;
}

/**
 * Turn whatever the user entered (URL or handle) plus an optional platform
 * into the stored form. Unknown input is stored as given under "website".
 */
export function normalizeSocial(platformKey: string | null | undefined, input: string): NormalizedSocial {
  const raw = input.trim();
  const detected = detectSocial(raw);
  // A recognisable URL identifies the platform; the given key only decides how a bare handle is read.
  const platform = detected?.platform || (platformKey && SOCIAL_BY_KEY.get(platformKey)) || SOCIAL_BY_KEY.get("website")!;
  let handle: string | null = null;
  if (detected && detected.platform.key === platform.key) handle = detected.handle;
  else if (!detected) handle = raw.replace(/^@/, "") || null;
  if (platform.key === "website") return { platformKey: "website", value: platform.profileUrl!(raw), handle: null };
  if (!platform.profileUrl) return { platformKey: platform.key, value: handle ?? raw, handle: handle ?? raw };
  if (handle) return { platformKey: platform.key, value: platform.profileUrl(handle), handle };
  // A URL on the right host whose handle we could not parse: keep the URL as given.
  return { platformKey: platform.key, value: detected ? raw : platform.profileUrl(raw), handle: detected ? null : raw };
}

/** Human-readable handle for display, derived from a stored social method. */
export function describeSocial(label: string | null, value: string): { platform: SocialPlatform; handle: string; href: string | null } {
  const platform = (label && SOCIAL_BY_KEY.get(label)) || detectSocial(value)?.platform || SOCIAL_BY_KEY.get("website")!;
  const detected = detectSocial(value);
  const handle = detected?.handle ?? value.replace(/^https?:\/\/(www\.)?/, "");
  const href = /^https?:\/\//i.test(value) ? value : platform.profileUrl ? platform.profileUrl(value) : null;
  return { platform, handle: platform.key === "mastodon" || !handle.startsWith("@") ? handle : handle, href };
}
