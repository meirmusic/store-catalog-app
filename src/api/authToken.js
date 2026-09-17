// The current Google ID token, set by IdentityContext whenever the signed-in
// state changes. api/client.js reads this on every request - kept as a
// plain module-scoped value (not React state) since callApi() is a plain
// function, not a component.
let currentToken = null;

export function setAuthToken(token) {
  currentToken = token;
}

export function getAuthToken() {
  return currentToken;
}
