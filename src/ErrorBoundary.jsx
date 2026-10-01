import { Component } from 'react';
import { reportError } from './errors/errorReporting.js';

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
    this.state = { hasError: false, code: null, details: '', copied: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // SPEC.md section 17: logged like any other error (sent on the next load's
  // first sync), and the code + details are shown so they can be reported.
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] component stack', info?.componentStack);
    const { code, details } = reportError('crash', error);
    this.setState({ code, details });
  }

  copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`${this.state.code} · ${this.state.details}`);
      this.setState({ copied: true });
    } catch {
      // clipboard blocked - the text is on screen to copy by hand
    }
  };

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
          {(this.state.code || this.state.details) && (
            <div style={{ marginTop: 20, fontSize: '.78rem', color: '#666', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <span>קוד תקלה: <bdi>{this.state.code}</bdi></span>
              <span>פרטים טכניים: <bdi dir="ltr" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{this.state.details}</bdi></span>
              <button
                type="button"
                onClick={this.copyDetails}
                style={{ background: 'none', border: '1px solid #999', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', color: '#444' }}
              >
                {this.state.copied ? 'הועתק ✓' : 'העתקה'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
