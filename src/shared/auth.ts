/**
 * Where the browser lands after signing out: the provider's post-logout redirect (register
 * `<origin>/signed-out` for the client) and the SPA's own fallback when there is no provider
 * logout. The SPA shows the sign-in card with a "signed out" note there and never uses it as a
 * post-sign-in destination.
 */
export const SIGNED_OUT_PATH = "/signed-out";
