// The current auth credential, set by IdentityContext whenever the
// signed-in state changes. api/client.js reads this on every request -
// kept as a plain module-scoped value (not React state) since callApi() is
// a plain function, not a component. Two independent login methods exist
// (task #28 v3 - Google Sign-In and an office email+password fallback for
// devices that don't have the shared Google account signed in), so this
// tracks whichever one is currently active rather than a single token.
let current = null; // { kind: 'google', idToken } | { kind: 'password', email, password } | null

export function setGoogleAuth(idToken) {
  current = idToken ? { kind: 'google', idToken } : null;
}

export function setPasswordAuth(email, password) {
  current = email && password ? { kind: 'password', email, password } : null;
}

export function clearAuth() {
  current = null;
}

// Fields to spread into the request body - shaped to match whichever check
// Code.gs's resolveAuthenticatedEmail runs first (id_token, then auth).
export function getAuthFields() {
  if (!current) return {};
  if (current.kind === 'google') return { id_token: current.idToken };
  return { auth: { email: current.email, password: current.password } };
}
