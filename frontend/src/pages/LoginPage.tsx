import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api';
import { vi } from '../locales/vi';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate('/tree', { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/tree');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : vi.auth.failure;
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 h-96 w-96 rounded-full bg-bark-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-bark-300/30 blur-3xl"
      />

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-4 py-10 sm:px-6 md:grid md:grid-cols-[1.05fr_1fr] md:gap-16">
        <section
          aria-hidden="true"
          className="relative hidden flex-col items-start gap-6 md:flex"
        >
          <span className="grid h-20 w-20 place-items-center rounded-2xl bg-bark-700 font-serif text-5xl text-stone-50 shadow-lift">
            譜
          </span>
          <div className="space-y-3">
            <p className="rule-ornament font-serif text-xs uppercase tracking-[0.25em] text-bark-600">
              Cội nguồn
            </p>
            <h2 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-stone-900">
              {vi.appName}
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-stone-600">
              {vi.appTagline}. Lưu giữ phả hệ, ngày giỗ, di ảnh và lời kể của
              dòng họ — ngoại tuyến vẫn dùng được.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
            <span className="h-px w-10 bg-bark-400/60" />
            <span className="font-serif italic">Đời nối đời, người nối người</span>
          </div>
        </section>

        <section className="relative w-full max-w-sm md:max-w-md md:justify-self-end">
          <div className="card bg-white/95 p-6 shadow-lift backdrop-blur-md sm:p-8">
            <div className="mb-7 text-center md:hidden">
              <div
                aria-hidden="true"
                className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-bark-700 font-serif text-3xl text-stone-50 shadow-lift"
              >
                譜
              </div>
              <p className="mt-2 text-sm text-stone-500">{vi.appName}</p>
            </div>
            <h1 className="text-center font-serif text-2xl font-semibold tracking-tight text-stone-900 md:text-left md:text-3xl">
              {vi.auth.loginTitle}
            </h1>
            <p className="mt-1 text-center text-sm text-stone-500 md:text-left">
              Đăng nhập để bước vào gia phả dòng họ.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="username" className="label">
                  {vi.auth.username}
                </label>
                <input
                  id="username"
                  autoFocus
                  autoComplete="username"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="label">
                  {vi.auth.password}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full py-2.5 text-base"
                disabled={loading}
              >
                {loading ? vi.auth.loading : vi.auth.submit}
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.3em] text-stone-500">
            {vi.appTagline}
          </p>
        </section>
      </div>
    </div>
  );
}
