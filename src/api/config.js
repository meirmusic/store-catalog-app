// Filled in once the Apps Script Web App (SPEC.md tasks #1-#3) is deployed.
// Left empty for now: the sync engine treats a missing URL as "offline
// forever" - writes queue up locally and the UI shows the sync-problem
// indicator, per SPEC.md's failure policy. Nothing breaks; it just can't
// reach a backend that doesn't exist yet.
export const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

// The lightweight shared-secret header described in SPEC.md's
// "הגנה קלה על ה-URL" section - not real security, just a deterrent.
export const SHARED_SECRET = import.meta.env.VITE_SHARED_SECRET || '';
