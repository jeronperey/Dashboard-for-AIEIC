const BACKEND = import.meta.env.VITE_BACKEND_URL ?? '';

interface Props {
  onLogin: () => void;
  error?: string | null;
  onDismissError?: () => void;
}

export default function LoginPage({ onLogin, error, onDismissError }: Props) {
  function signIn() {
    if (!BACKEND) {
      onLogin();
      return;
    }
    onDismissError?.();
    const next = `${window.location.origin}/auth/callback`;
    window.location.href = `${BACKEND}/api/v1/auth/microsoft/login?next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-logo">AI</div>
          <div>
            <div className="login-brand-title">AIEIC Instructor Panel</div>
            <div className="login-brand-sub">AI-Enhanced Instructional Co-pilot</div>
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <span>{error}</span>
            <button
              className="login-error-close"
              onClick={onDismissError}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className="calPoly-sso">
          <button onClick={signIn}>Sign in with Cal Poly Email</button>
        </div>
      </div>
    </div>
  );
}
