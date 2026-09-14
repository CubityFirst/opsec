import { countryFlag } from "@shared/countries";
import { cn } from "@/lib/utils";

/**
 * The flag for a contact's country of origin, or nothing at all when the text is
 * not a country we recognise (the field is free text). The emoji is decorative —
 * the country is in the label — so screen readers get the name, not "flag".
 */
export function CountryFlag({ country, className }: { country: string | null | undefined; className?: string }) {
  const flag = countryFlag(country);
  if (!flag) return null;
  return (
    <span role="img" aria-label={`From ${country}`} title={country ?? undefined} className={cn("leading-none", className)}>
      {flag}
    </span>
  );
}
