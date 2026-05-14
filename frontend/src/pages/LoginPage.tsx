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
    <div className="flex min-h-screen items-center justify-center bg-bark-50 p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mb-2 font-serif text-4xl text-bark-600">譜</div>
          <h1 className="text-xl font-semibold">{vi.auth.loginTitle}</h1>
          <p className="mt-1 text-sm text-stone-500">{vi.appName}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
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
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? vi.auth.loading : vi.auth.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
