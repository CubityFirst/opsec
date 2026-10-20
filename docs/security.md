# Security and privacy

- **Sessions**: HS256-signed `HttpOnly; Secure; SameSite=Lax` cookies (oidc mode); the access policy is re-checked on every request. `SESSION_SECRET` must be at least 32 characters.
- **CSRF**: state-changing `/api/*` requests are refused when the browser reports a cross-site or cross-origin fetch (`Sec-Fetch-Site` / `Origin`), on top of SameSite cookies.
- **Headers**: HSTS, a CSP that allows only same-origin scripts and connections (images may also come from any HTTPS host, which is what map tiles use), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies (geolocation allowed for the app's own origin only, for the map), on every response including static assets.
- **Files**: the stored content type of an upload comes from its bytes for the formats shown inline (PNG, JPEG, GIF, WebP, PDF); anything else downloads as an attachment with a generic type, and every file response carries a sandboxing CSP. Avatars must be raster images (never SVG). Uploads require `Content-Length` and JSON bodies are capped.
- **Ask**: tools are read-only; the model can only propose changes that you apply. Markdown from notes or the model never renders remote images. Stored provider secrets are bound to the base URL's origin: changing the host clears them so the Worker cannot be used to read a key back. Provider error bodies are not echoed to the browser.
- **Calendar feeds**: `/calendar/<key>.ics` is public by design; the 256-bit key in the path is the credential, unknown keys are a plain 404, and the response is `private, no-cache`. Keys are stored as-is so the URL can be shown again; rotate a leaked one from the Account page.
- **Dev routes** (`/api/dev/*`) only exist on `localhost` with `ENVIRONMENT=development`.
- **Admin role** gates cascade deletes of contacts and tags and the provider settings. Everyone allowed in can otherwise edit and delete records; run one instance per person, or put a stricter gate in front.

## Outside services: the map

Two outside services are involved, and both are OpenStreetMap:

- **Tiles** load in the browser straight from `tile.openstreetmap.org` (already permitted by the CSP's `img-src https:`), so the tile server sees the viewer's IP address and the area being looked at. This is the one thing in the app that talks to a third party from the browser. Attribution is shown on the map as OSM's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) requires.
- **Address lookup** goes through the Worker to [Nominatim](https://nominatim.org) (`GET /api/geocode`, `GET /api/geocode/reverse`) with an identifying `User-Agent`, only when you press *Find* or *use my location*, and responses are cached for seven days. That keeps a personal instance well inside Nominatim's usage policy (one request per second, no bulk lookups). The Ask model has no geocoding tool on purpose.

*Use my location* needs a secure context (HTTPS, or `localhost` in development); the `Permissions-Policy` header allows `geolocation` for the app's own origin only.
