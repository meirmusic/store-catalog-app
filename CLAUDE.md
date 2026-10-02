# Working rules - קטלוג הגלריה (Yossi Bitton Fine Art)

Read at the start of every session. Approved by the product manager on 02/10/2026 (SPEC.md 24.3).
These rules exist so nothing depends on what one session remembers.

## Who we work with

- **Meir** - the product manager. Not a developer. Writes in Hebrew; answer in Hebrew, in plain
  words, no code jargon. When a decision is his, offer options with a recommendation.
- The team uses the app on phones (iPhone and Android) and in the office.

## The process - every change

1. **Spec first.** Write or update the section in `SPEC.md` (what the user sees, every state,
   decisions marked ✅). Show Meir, and for anything visual send a mock.
2. **Wait for approval.** Build only after Meir explicitly approves ("מאשר", "תכניס לאפיון ותממש").
   Something he hasn't decided is a question, not an assumption.
3. **Build with tests** (checklist below).
4. **Update `TEST_PLAN.md`** - the new TC-* rows, and a REG-* row for every bug found.
5. **Run everything** - `npx playwright test` (all) and `npm run test:built` (the built app with
   its service worker). All must pass.
6. **Commit and push** to the session's branch. **A push goes live to the team immediately**
   (GitHub Pages) - never push with a failing test.
7. Tell Meir what changed, in his words, and what still waits for him.

## Checklist for every feature or fix

- [ ] **A new view of the same data, or a new capability in one view** (e.g. a card action):
      update the parity table in `SPEC.md` 24.2 **and** `tests/e2e/view-parity.spec.js`, with a
      decision for every view. This is how the missing zoom in the list view was caught.
- [ ] **A new button or action:** add it to the button inventory in `SPEC.md` section 17 -
      what it does, whether it can fail, and what the user sees when it does.
- [ ] **Anything that can fail** goes through the error mechanism (`showErrorToast` /
      `reportError`): a message, an E-XXXX code, and the ErrorLog. Never fail silently, and never
      quietly send or save something other than what the user chose.
- [ ] **Every fix:** a test that fails on the old code and passes on the new one - actually run it
      against the old code and say so in TEST_PLAN ("אומת: נכשלת בלי התיקון").
- [ ] **Every screen state** (loading, empty, failed, offline, slow): no flash of a wrong state.
      The observer tests (`tests/integration/screen-observer.spec.js`) and truth tables
      (`status-truth.spec.js`) are the pattern.
- [ ] **Phone first:** check at 390px width, in Hebrew and in English (the layout stays
      right-to-left in every language, by design - TEST_PLAN I18N-03).
- [ ] **End of feature:** an end-to-end "observer" walk-through of the real flow before pushing.
- [ ] **Things a test can't check** (real iPhone, WhatsApp, Google side): add them to
      `OPEN_ITEMS.md` for Meir.

## Never

- Never put passwords, reset codes, photo content or item data in the error log or support info.
- What is shared with clients carries only names - never SKU, serial number, location, notes,
  physical condition, or whether it was sold (SPEC.md 23).
- Never skip, disable or loosen a test to get green.
- Never use the user's email beyond identifying them.

## Things learned the hard way

- **Apps Script (`apps-script/Code.gs`) changes do nothing until Meir redeploys it by hand**
  ("ניהול פריסות ← עריכה ← גרסה חדשה", not "פריסה חדשה"). Keep `apps-script/logic.js` in step
  and list the redeploy in `OPEN_ITEMS.md`.
- **iPhone opens the share sheet only straight from the tap** - prepare files before the tap.
- **Hebrew text with numbers** (e.g. 91×132) needs direction marks, or it shows reversed.
- **Downloaded file names in English** - some browsers save a Hebrew name as "download".
- Every artwork photo: 400 on cards, 1600 when enlarged and shared.

## Where things are

| File | What |
|---|---|
| `SPEC.md` | The approved spec - the source of truth |
| `TEST_PLAN.md` | Every test case (TC-*) and every bug found (REG-*) |
| `OPEN_ITEMS.md` | What only Meir can do (Google, real phones, the team) |
| `USABILITY_BENCHMARK.md` | Comparison with leading apps |
| `assets/catalog/` | The 2025 catalog PDF - the brand language |
| `tests/` | `unit`, `integration`, `e2e`, `built` (Playwright) |
