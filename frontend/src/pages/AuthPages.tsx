import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import type { User, WorkspaceSummary } from '../lib/types';
import { Button } from '../components/ui/button';

async function loadMe() {
  const me = await api<{ user: User; workspaces: WorkspaceSummary[] }>('/auth/me');
  useAuth.getState().setMe(me.user, me.workspaces);
  return me;
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">📋</div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-[13px] text-ink-soft">Matrika Dashboard — Agentic Project Management</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'mt-1 w-full rounded-md border border-line-strong px-3 py-2 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function LoginPage() {
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: { identifier, password } });
      useAuth.getState().setSession(res.access_token, res.user);
      await loadMe();
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Masuk">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[13px] font-medium">
          Email atau username
          <input className={inputCls} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="block text-[13px] font-medium">
          Password
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>
      <p className="mt-4 text-center text-[13px] text-ink-soft">
        Belum punya akun?{' '}
        <Link to="/register" className="text-accent hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: form });
      useAuth.getState().setSession(res.access_token, res.user);
      await loadMe();
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Buat akun">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[13px] font-medium">
          Nama tampilan
          <input className={inputCls} value={form.display_name} onChange={set('display_name')} required autoFocus />
        </label>
        <label className="block text-[13px] font-medium">
          Username
          <input className={inputCls} value={form.username} onChange={set('username')} pattern="[A-Za-z0-9_]{3,32}" title="3–32 karakter: huruf, angka, underscore" required />
        </label>
        <label className="block text-[13px] font-medium">
          Email
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label className="block text-[13px] font-medium">
          Password
          <input className={inputCls} type="password" value={form.password} onChange={set('password')} minLength={10} required />
          <span className="mt-1 block text-[12px] font-normal text-ink-faint">Minimal 10 karakter, mengandung huruf dan angka.</span>
        </label>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? 'Memproses…' : 'Daftar'}
        </Button>
      </form>
      <p className="mt-4 text-center text-[13px] text-ink-soft">
        Sudah punya akun?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}

export { loadMe };
