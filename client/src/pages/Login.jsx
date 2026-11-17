import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { BrandMark } from '../components/Layout.jsx';
import { tw } from '../components/tw.js';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] max-md:grid-cols-1">
      <div className="relative overflow-hidden bg-pine text-pine-text px-10 py-9 flex flex-col justify-between max-md:px-4 max-md:py-5">
        <BrandMark />
        <div className="max-md:hidden">
          {/* An oversized asset tag — the one decorative moment in the app */}
          <div className="relative w-[300px] rounded-2xl border border-pine-3 bg-pine-2 p-6 shadow-pop rotate-[-4deg]">
            <span className="absolute top-5 right-5 w-4 h-4 rounded-full bg-pine border border-pine-3" />
            <p className="text-pine-dim text-xs">Property of Aspire Globus</p>
            <p className="mt-6 font-mono text-[28px] text-white tracking-tight">AST-00125</p>
            <div className="mt-6 grid grid-cols-2 gap-y-1 text-[13px]">
              <span className="text-pine-dim">Item</span><span className="text-white">Dell Latitude 5550</span>
              <span className="text-pine-dim">Issued to</span><span className="text-white">EMP-00125</span>
            </div>
          </div>
          <h2 className="mt-12 !text-white text-[28px] leading-tight max-w-[380px]">
            Know where every laptop, monitor and headset is.
          </h2>
          <p className="mt-3 text-pine-dim max-w-[360px] leading-relaxed">
            Stock, assignments and returns for the whole organisation, in one register.
          </p>
        </div>
      </div>

      <div className="grid place-items-center px-4 py-8 bg-paper">
        <form className="w-full max-w-[380px] flex flex-col gap-4" onSubmit={submit}>
          <div>
            <h1>Sign in</h1>
            <p className="mt-1 text-muted">Use your Aspire account.</p>
          </div>
          {error && <div className="px-3 py-2.5 rounded-lg bg-danger-soft text-danger text-[13px]">{error}</div>}
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password" required>
            <div className="flex [&_input]:!rounded-r-none">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="px-3 border border-l-0 border-[#D3D9D5] bg-white rounded-r-lg text-xs font-semibold text-muted"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <button className={`${tw.btnPrimary} !h-11 w-full`} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-center text-[12.5px] text-muted">Forgot your password? An administrator can reset it.</p>
        </form>
      </div>
    </div>
  );
}
