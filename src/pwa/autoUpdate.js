// SPEC.md section 9 (REG-035): when a new version may install itself.
// Pure decision logic, no React or service worker - unit-tested in
// tests/unit/auto-update.spec.js.
//
// - arm(): the app was just opened, or the user came back to it. A new
//   version found within AUTO_WINDOW_MS of that installs by itself.
// - setNeedRefresh(true): a new version is waiting.
// - setBusy(true): the user is typing somewhere (item form, lists screen,
//   sign-in) - never reload under them; install right after that closes.
// A new version found during continuous use (the hourly check) only shows
// the banner, and installs at the next return to the app.
export const AUTO_WINDOW_MS = 60 * 1000;

export function createAutoUpdater({ apply, now = () => Date.now() }) {
  let armedUntil = 0;
  let needRefresh = false;
  let busy = false;
  let afterBusy = false;
  let applied = false;

  function evaluate() {
    if (!needRefresh || applied) return;
    const armed = now() <= armedUntil;
    if (!armed && !afterBusy) return;
    if (busy) {
      afterBusy = true;
      return;
    }
    applied = true;
    apply();
  }

  return {
    arm() { armedUntil = now() + AUTO_WINDOW_MS; evaluate(); },
    setNeedRefresh(value) { needRefresh = value; evaluate(); },
    setBusy(value) { busy = value; evaluate(); },
  };
}
