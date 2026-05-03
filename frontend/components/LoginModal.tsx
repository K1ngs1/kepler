'use client';

import { useState } from 'react';
import { createClient, isConfigured } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Props {
  onClose: () => void;
  onSuccess: (user: { name: string; email: string }) => void;
}

export default function LoginModal({ onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const router = useRouter();

  const notConfigured = !isConfigured();

  const handleEmailAuth = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (notConfigured) {
      setError('Supabase is not configured yet. Please add your project credentials.');
      return;
    }
    setError('');
    setLoading(true);
    const supabase = createClient()!;
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setDone(true);
        setTimeout(() => { onSuccess({ name: email.split('@')[0], email }); router.refresh(); }, 1200);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        setDone(true);
        const name = data.user?.user_metadata?.full_name || email.split('@')[0];
        setTimeout(() => { onSuccess({ name, email }); router.refresh(); }, 1200);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

  const handleGoogle = async () => {
    if (notConfigured) { setError('Supabase is not configured yet.'); return; }
    if (!googleEnabled) {
      setError('Google login requires setup in your Supabase dashboard. Use email/password below, or see the instructions to enable Google OAuth.');
      return;
    }
    setLoading(true);
    setError('');
    const supabase = createClient()!;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    });
    if (err) { setError(err.message); setLoading(false); }
  };

  if (done) {
    return (
      <div className="modal-bg">
        <div className="login-modal" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div className="login-success-icon">✓</div>
          <div className="login-success-title">You&apos;re signed in!</div>
          <div className="login-success-sub">Welcome to Kepler.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-close" onClick={onClose}>×</button>
        <div className="login-logo">Kepler</div>
        <div className="login-heading">{isSignUp ? 'Create your account' : 'Sign in to your account'}</div>
        <div className="login-sub">Access bids, trades, and your collection.</div>

        {notConfigured && (
          <div className="auth-error" style={{ marginBottom: 16 }}>
            Supabase credentials not configured. Add your project URL and anon key to <code>.env.local</code>.
          </div>
        )}

        <button className="login-google-btn" onClick={handleGoogle} disabled={loading || notConfigured} style={!googleEnabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}} title={!googleEnabled ? 'Google OAuth not yet enabled — use email/password below' : ''}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div className="login-divider">
          <div className="login-divider-line" />
          <div className="login-divider-txt">or sign in with email</div>
          <div className="login-divider-line" />
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

        <label className="login-field-label">Email address</label>
        <input
          className="login-field-input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
        />

        <label className="login-field-label">Password</label>
        <input
          className="login-field-input"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
        />
        {!isSignUp && <a className="login-forgot">Forgot password?</a>}

        <button className="login-submit-btn" onClick={handleEmailAuth} disabled={loading}>
          {loading ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        <div className="login-register-txt">
          {isSignUp ? (
            <>Already have an account? <a onClick={() => setIsSignUp(false)}>Sign in</a></>
          ) : (
            <>Don&apos;t have an account? <a onClick={() => setIsSignUp(true)}>Create one free</a></>
          )}
        </div>
      </div>
    </div>
  );
}
