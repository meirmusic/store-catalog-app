import { db } from '../db/db.js';

// SPEC.md 26.2: an unsaved form is kept as a draft on this device, so an
// interruption (the app closed, the phone off, a crash) loses nothing.
// One draft at a time; it holds only the fields that were changed, so
// restoring it never overwrites what someone else changed meanwhile in
// another field.
const ID = 'current';

export async function saveDraft(draft) {
  await db.drafts.put({ ...draft, id: ID, saved_at: new Date().toISOString() });
}

export async function getDraft() {
  return (await db.drafts.get(ID)) || null;
}

export async function clearDraft() {
  await db.drafts.delete(ID);
}
