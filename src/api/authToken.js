// The current sign-in credential, set by IdentityContext whenever the
// signed-in state changes. api/client.js reads this on every request -
// kept as a plain module-scoped value (not React state) since callApi() is
// a plain function, not a component.
// SPEC.md 33.4: after the first sync with a server that supports it, a
// phone keeps a key of its own instead of the office password.
let current = null; // { kind: 'password', email, password } | { kind: 'key', email, deviceKey } | null

export function setPasswordAuth(email, password) {
  current = email && password ? { kind: 'password', email, password } : null;
}

export function setDeviceKeyAuth(email, deviceKey) {
  current = email && deviceKey ? { kind: 'key', email, deviceKey } : null;
}

export function clearAuth() {
  current = null;
}

export function currentAuthKind() {
  return current ? current.kind : null;
}

export function currentAuthEmail() {
  return current ? current.email : null;
}

function currentMember() {
  try {
    return localStorage.getItem('gallery_team_member') || '';
  } catch {
    return '';
  }
}

// Fields to spread into the request body - what Code.gs's
// resolveAuthenticatedEmail checks. With a key, the staff member's name goes
// along, for the Devices tab ("who used this phone last" - SPEC.md 33.6).
export function getAuthFields() {
  if (!current) return {};
  if (current.kind === 'key') return { auth: { email: current.email, device_key: current.deviceKey, member: currentMember() } };
  return { auth: { email: current.email, password: current.password } };
}
