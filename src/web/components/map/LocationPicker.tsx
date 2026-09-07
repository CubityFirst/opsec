import { LocateFixedIcon, MapPinIcon, SearchIcon, XIcon } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCoordinates, formatRadius, roundRadius, type Coordinates } from "@shared/schemas/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useGeocode, useReverseGeocode } from "@/lib/queries/map";

const MapView = lazy(() => import("./MapView").then((m) => ({ default: m.MapView })));

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Precision choices, in metres; 0 is an exact spot. */
const PRECISIONS = [0, 250, 1000, 5000, 25_000, 100_000];

/** A device fix looser than this is shown as an area rather than a spot. */
const POINT_LIKE_M = 150;

function withRadius(c: Pick<Coordinates, "lat" | "lng">, radius: number | null | undefined): Coordinates {
  return radius ? { lat: c.lat, lng: c.lng, radius } : { lat: c.lat, lng: c.lng };
}

/**
 * A form control for coordinates: search for a place (through the Worker's
 * geocoder), use the device's location, or pin a spot on a small map.
 * Every button is `type="button"` and Enter in the search box does not submit
 * the surrounding dialog form.
 */
export function LocationPicker({
  value,
  onChange,
  initialQuery,
  onLabel,
}: {
  value: Coordinates | null;
  onChange: (v: Coordinates | null) => void;
  /** Text to search for when the box is empty (the address or location the user typed above). */
  initialQuery?: string;
  /** A human-readable name for the chosen spot; the caller decides whether to fill its text field with it. */
  onLabel?: (label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [reverseFor, setReverseFor] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const search = useGeocode(submitted);
  const reverse = useReverseGeocode(reverseFor);

  useEffect(() => {
    if (reverseFor && reverse.data) {
      if (reverse.data.result) onLabel?.(reverse.data.result.label);
      setReverseFor(null);
    }
    if (reverseFor && reverse.isError) setReverseFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverse.data, reverse.isError]);

  const find = () => {
    const q = (query || initialQuery || "").trim();
    if (q.length < 3) {
      toast.error("Type at least three characters to search");
      return;
    }
    if (!query) setQuery(q);
    setSubmitted(q);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const accuracy = pos.coords.accuracy;
        const c = withRadius({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }, accuracy > POINT_LIKE_M ? roundRadius(accuracy) : null);
        onChange(c);
        setSubmitted("");
        setMapOpen(true);
        setReverseFor(c);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location access was refused" : "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const results = submitted ? (search.data?.items ?? []) : [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              find();
            }
          }}
          placeholder={initialQuery?.trim() ? "Search for a place (or find the text above)" : "Search for a place"}
          aria-label="Search for a place"
        />
        <Button type="button" variant="outline" size="icon" aria-label="Find" onClick={find} disabled={search.isFetching}>
          <SearchIcon />
        </Button>
        {"geolocation" in navigator && (
          <Button type="button" variant="outline" size="icon" aria-label="Use my location" title="Use my location" onClick={locate} disabled={locating}>
            <LocateFixedIcon />
          </Button>
        )}
        <Button type="button" variant={mapOpen ? "secondary" : "outline"} size="icon" aria-label="Pin on map" title="Pin on map" onClick={() => setMapOpen((o) => !o)}>
          <MapPinIcon />
        </Button>
      </div>

      {submitted && search.isPending && <p className="text-xs text-muted-foreground">Searching…</p>}
      {submitted && search.isError && <p className="text-xs text-destructive">{errorMessage(search.error)}</p>}
      {submitted && search.data && results.length === 0 && <p className="text-xs text-muted-foreground">Nothing found for “{submitted}”.</p>}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  // A town or region becomes an area of its own size; a house stays a spot.
                  onChange(withRadius({ lat: round(r.lat), lng: round(r.lng) }, r.radius));
                  onLabel?.(r.label);
                  setSubmitted("");
                  setMapOpen(true);
                }}
              >
                <span>{r.label}</span>
                {(r.kind || r.radius) && (
                  <span className="text-xs text-muted-foreground">
                    {[r.kind?.replace(/_/g, " "), r.radius ? `about ${formatRadius(r.radius)} across` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(mapOpen || value) && (
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <MapView pins={[]} editable={{ value, onChange: (c) => onChange(withRadius(c, value?.radius)) }} scrollWheelZoom="focus" className="h-48" />
        </Suspense>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {value ? (
          <>
            <span className="font-mono">{formatCoordinates(value)}</span>
            <span className="flex items-center gap-1">
              <Select value={String(value.radius ?? 0)} onValueChange={(v) => onChange(withRadius(value, Number(v)))}>
                <SelectTrigger size="sm" className="h-6 text-xs" aria-label="Precision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(value.radius && !PRECISIONS.includes(value.radius) ? [...PRECISIONS, value.radius].sort((a, b) => a - b) : PRECISIONS).map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r === 0 ? "Exact spot" : `Within ${formatRadius(r)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="xs" onClick={() => onChange(null)}>
                <XIcon /> Clear
              </Button>
            </span>
          </>
        ) : (
          <span>{mapOpen ? "Click the map to place a pin." : "Search, use your location, or pin a spot on the map."}</span>
        )}
      </div>
    </div>
  );
}
