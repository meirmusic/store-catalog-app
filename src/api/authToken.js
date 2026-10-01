// The current auth credential, set by IdentityContext whenever the
// signed-in state changes. api/client.js reads this on every request -
// kept as a plain module-scoped value (not React state) since callApi() is
// a plain function, not a component. Two independent login methods exist
// (task #28 v3 - Google Sign-In and an office email+password fallback for
// devices that don't have the shared Google account signed in), so this
// tracks whichever one is currently active rather than a single token.
// (Google Sign-In has since been removed - SPEC.md section 15, REG-036.)
let current = null; // { kind: 'password', email, password } | null

export function setPasswordAuth(email, password) {
  current = email && password ? { kind: 'password', email, password } : null;
}

export function clearAuth() {
  current = null;
}

// Fields to spread into the request body - what Code.gs's
// resolveAuthenticatedEmail checks.
export function getAuthFields() {
  if (!current) return {};
  return { auth: { email: current.email, password: current.password } };
}
