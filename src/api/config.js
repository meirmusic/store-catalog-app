// Filled in once the Apps Script Web App (SPEC.md tasks #1-#3) is deployed.
// Left empty for now: the sync engine treats a missing URL as "offline
// forever" - writes queue up locally and the UI shows the sync-problem
// indicator, per SPEC.md's failure policy. Nothing breaks; it just can't
// reach a backend that doesn't exist yet.
export const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

// OAuth Client ID from Google Cloud Console (Credentials > OAuth client ID
// > Web application) - see task #28. Used to initialize "Sign In With
// Google" and must match the same value Code.gs checks the token's `aud`
// claim against, or every request will be rejected as forbidden.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
