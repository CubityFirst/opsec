import { GlobeIcon } from "lucide-react";
import {
  siBehance,
  siBluesky,
  siDiscord,
  siDribbble,
  siDuolingo,
  siFacebook,
  siFlickr,
  siGithub,
  siGitlab,
  siGoodreads,
  siInstagram,
  siKick,
  siKofi,
  siLastdotfm,
  siLetterboxd,
  siMastodon,
  siMedium,
  siPatreon,
  siPinterest,
  siReddit,
  siSignal,
  siSnapchat,
  siSoundcloud,
  siSpotify,
  siStackoverflow,
  siSteam,
  siStrava,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siTumblr,
  siTwitch,
  siUntappd,
  siVimeo,
  siWhatsapp,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";
import { SOCIAL_BY_KEY } from "@shared/social";
import { cn } from "@/lib/utils";

const ICONS: Record<string, SimpleIcon> = {
  siBehance, siBluesky, siDiscord, siDribbble, siDuolingo, siFacebook, siFlickr, siGithub, siGitlab, siGoodreads, siInstagram, siKick, siKofi,
  siLastdotfm, siLetterboxd, siMastodon, siMedium, siPatreon, siPinterest, siReddit, siSignal, siSnapchat, siSoundcloud, siSpotify, siStackoverflow,
  siSteam, siStrava, siSubstack, siTelegram, siThreads, siTiktok, siTumblr, siTwitch, siUntappd, siVimeo, siWhatsapp, siX, siYoutube,
};

/**
 * Brand icon for a social platform key, drawn from simple-icons. Platforms
 * without an icon (LinkedIn, generic websites) get a fallback glyph.
 * `brand` colours the icon with the platform's hex; otherwise it uses currentColor.
 */
export function SocialIcon({ platformKey, className, brand = false }: { platformKey: string; className?: string; brand?: boolean }) {
  const platform = SOCIAL_BY_KEY.get(platformKey);
  const icon = platform?.icon ? ICONS[platform.icon] : undefined;
  if (!icon) {
    if (platformKey === "linkedin") {
      return (
        <span
          aria-hidden
          className={cn("inline-flex items-center justify-center rounded-[3px] text-[0.55em] font-bold leading-none text-white", className)}
          style={{ backgroundColor: brand ? "#0A66C2" : "currentColor" }}
        >
          in
        </span>
      );
    }
    return <GlobeIcon className={className} aria-hidden />;
  }
  return (
    <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" className={className} fill={brand ? `#${icon.hex}` : "currentColor"}>
      <path d={icon.path} />
    </svg>
  );
}
