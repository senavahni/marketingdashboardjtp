import { CheckCircle2, Globe, LogIn, Plus, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  SITE_KEY,
  SITE_LABEL,
  isLoginActive,
  useBrowserLogin,
  useBrowserProfileActions,
  useBrowserProfiles,
  type BrowserProfile,
  type LoginSite,
} from '../../hooks/browser-profile-queries';
import { errorMessage } from '../../lib/api';
import { cn, timeAgo } from '../../lib/utils';
import { Button } from '../ui/button';
import { Spinner } from '../ui/misc';

const GOOGLE_PROFILE = 'google-utama';
const LOGIN_SITES: LoginSite[] = ['google', 'x', 'threads'];

/** Profil Chrome scraper + login manual akun Google/X/Threads (Admin/Owner). */
export function BrowserProfilesSection({ workspaceId }: { workspaceId: string }) {
  const { data: profiles, isLoading, error } = useBrowserProfiles(workspaceId, true);
  const actions = useBrowserProfileActions(workspaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const login = useBrowserLogin(workspaceId, jobId);
  const active = isLoginActive(login.data) || actions.startLogin.isPending;
  const googleProfile = profiles?.find((p) => p.logged_in_sites.includes(SITE_KEY.google));

  const start = async (name: string, site: LoginSite) => {
    try {
      const out = await actions.startLogin.mutateAsync({ name, sites: [site] });
      setJobId(out.job_id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const createGoogle = async () => {
    try {
      await actions.create.mutateAsync({ name: GOOGLE_PROFILE, sites: ['google'] });
      await start(GOOGLE_PROFILE, 'google');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#0F2340]">
        <Globe size={15} /> Profil browser untuk scraping
      </h2>
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-ink-soft">
        Scraper Web memakai profil yang sudah login Google agar terlihat seperti pengguna nyata, bukan bot. Login dilakukan di jendela Chrome
        biasa yang terbuka <b>di komputer tempat MCP berjalan</b>; password tidak pernah disimpan Dashboard maupun MCP.
      </p>

      {login.data && <LoginStatus login={login.data} onCancel={() => actions.cancelLogin.mutate(login.data.job_id)} onClose={() => setJobId(null)} />}

      {isLoading ? (
        <Spinner className="h-5 w-5" />
      ) : error ? (
        <p className="rounded-xl bg-[#FDECE7] px-4 py-3 text-[13px] text-[#9A3412]">{errorMessage(error)}</p>
      ) : (
        <div className="space-y-2">
          {profiles?.map((p) => (
            <ProfileRow key={p.name} profile={p} usedByWeb={p.name === googleProfile?.name} disabled={active || p.locked} onLogin={(site) => void start(p.name, site)} />
          ))}
          {!googleProfile && !profiles?.some((p) => p.name === GOOGLE_PROFILE) && (
            <button
              type="button"
              disabled={active || actions.create.isPending}
              onClick={() => void createGoogle()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0E9384] bg-[#F3FBF9] px-4 py-3 text-[13px] font-medium text-[#0B7A6E] hover:bg-[#E7F6F3] disabled:opacity-50"
            >
              <Plus size={14} /> Buat profil & login akun Google
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileRow({ profile: p, usedByWeb, disabled, onLogin }: { profile: BrowserProfile; usedByWeb: boolean; disabled: boolean; onLogin: (site: LoginSite) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E3E7ED] bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-[13px] font-semibold text-ink">{p.name}</code>
          {usedByWeb && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F6F3] px-2 py-0.5 text-[11px] font-medium text-[#0B7A6E]">
              <ShieldCheck size={12} /> Dipakai scraper Web
            </span>
          )}
          {p.locked && <span className="rounded-full bg-[#FEF6E7] px-2 py-0.5 text-[11px] text-[#92400E]">Sedang dipakai</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-soft">
          {p.allowed_sites.length === 0 && <span>Tanpa login (scraping umum)</span>}
          {p.allowed_sites.map((site) => {
            const ok = p.logged_in_sites.includes(site);
            const checked = p.login_checked_at[site];
            return (
              <span key={site} className="inline-flex items-center gap-1">
                {ok ? <CheckCircle2 size={12} className="text-[#15803D]" /> : <XCircle size={12} className="text-[#C2410C]" />}
                {SITE_LABEL[site] ?? site}: {ok ? 'login' : 'belum login'}
                {checked && <span className="text-ink-faint">· dicek {timeAgo(checked)}</span>}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1.5">
        {LOGIN_SITES.map((site) => (
          <Button key={site} size="sm" variant={site === 'google' ? 'outline' : 'ghost'} disabled={disabled} onClick={() => onLogin(site)}>
            <LogIn size={13} /> {SITE_LABEL[SITE_KEY[site]]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LoginStatus({ login, onCancel, onClose }: { login: NonNullable<ReturnType<typeof useBrowserLogin>['data']>; onCancel: () => void; onClose: () => void }) {
  const active = isLoginActive(login);
  const ok = login.status === 'succeeded' && login.checks.every((c) => c.logged_in);
  return (
    <div
      role="status"
      className={cn(
        'mb-3 rounded-2xl border px-4 py-3 text-[13px]',
        active ? 'border-[#BFD7F2] bg-[#EEF5FD] text-[#1D4ED8]' : ok ? 'border-[#BFE6DC] bg-[#F3FBF9] text-[#0B7A6E]' : 'border-[#F5C9BB] bg-[#FDF3EF] text-[#9A3412]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {active && <Spinner className="h-4 w-4" />}
          <b>Profil {login.profile}</b>
          <span>
            {login.status === 'queued' && 'Menunggu worker MCP membuka Chrome…'}
            {login.status === 'running' && (login.message ?? 'Jendela Chrome terbuka: login, lalu tutup jendelanya')}
            {login.status === 'succeeded' && (ok ? 'Login berhasil diverifikasi.' : 'Jendela ditutup, tetapi login belum terdeteksi.')}
            {login.status === 'cancelled' && 'Sesi login dibatalkan.'}
            {login.status === 'failed' && (login.error ?? 'Sesi login gagal.')}
          </span>
        </div>
        {active ? (
          <Button size="sm" onClick={onCancel}>
            Batalkan
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Tutup
          </Button>
        )}
      </div>
      {login.status === 'running' && (
        <p className="mt-1 text-[12px]">Selesaikan login (termasuk verifikasi 2 langkah) di jendela Chrome, lalu tutup jendela itu — status dicek otomatis.</p>
      )}
      {login.checks.length > 0 && (
        <ul className="mt-1 text-[12px]">
          {login.checks.map((c) => (
            <li key={c.site}>
              {SITE_LABEL[c.site] ?? c.site}: {c.logged_in ? 'login ✓' : 'belum login'} ({c.detail})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
