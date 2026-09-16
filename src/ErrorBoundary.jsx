import { Component } from 'react';

// Test-only hook for tests/e2e/error-boundary.spec.js: inert for every real
// user (nothing in the app ever sets window.__testCrash), lets that test
// deterministically prove ErrorBoundary actually catches a render error
// instead of relying on organically corrupting data to crash something.
export function CrashTestHook() {
  if (typeof window !== 'undefined' && window.__testCrash) {
    throw new Error('Intentional test crash (window.__testCrash)');
  }
  return null;
}

// UI_STANDARD_GAP_ANALYSIS.md STA-06/07: without this, an unexpected render
// error anywhere in the tree would blank the whole app with no way back
// short of a manual reload the user has no reason to think to try. Plain
// hardcoded Hebrew, no useI18n() - a crash could originate inside
// I18nProvider itself, so this cannot depend on it being intact.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught a render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f7f6f3',
          direction: 'rtl',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>😕</div>
          <h1 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>קרתה תקלה בלתי צפויה</h1>
          <p style={{ color: '#666', fontSize: '.92rem', margin: '0 0 20px' }}>
            הנתונים שלך בטוחים - הם שמורים על המכשיר. נסה לרענן את הדף.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              background: '#2f2a24',
              color: '#fff',
              fontSize: '.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            רענון הדף
          </button>
        </div>
      </div>
    );
  }
}
