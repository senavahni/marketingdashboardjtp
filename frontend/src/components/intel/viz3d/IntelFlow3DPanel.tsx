import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FALLBACK_MESSAGE, FpsMonitor, detectStaticFallback } from './fallback';
import type { FallbackReason, IntelFlow3DProps } from './types';

// Chunk terpisah: three.js hanya diunduh saat panel 3D benar-benar dirender
const IntelFlow3D = lazy(() => import('./IntelFlow3D').then((m) => ({ default: m.IntelFlow3D })));

type PanelProps = Omit<IntelFlow3DProps, 'onFrame' | 'onContextLost'> & {
  /** Timeline 2D yang ditampilkan sebagai fallback. */
  children: ReactNode;
};

/** Gagal memuat chunk / render 3D → fallback 2D, bukan layar kosong. */
class Viz3dBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Pembungkus visualisasi 3D. Menampilkan `children` (timeline 2D) bila WebGL tidak ada,
 * `prefers-reduced-motion` aktif, FPS < 30 selama 3 detik, atau chunk 3D gagal dimuat.
 */
export function IntelFlow3DPanel({ children, ...flowProps }: PanelProps) {
  const [reason, setReason] = useState<FallbackReason | null>(() => detectStaticFallback());
  const monitor = useRef(new FpsMonitor());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => mq.matches && setReason('reduced-motion');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const onFrame = useCallback((nowMs: number) => {
    if (monitor.current.tick(nowMs)) setReason((r) => r ?? 'low-fps');
  }, []);
  const onContextLost = useCallback(() => setReason((r) => r ?? 'no-webgl'), []);

  if (reason) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-[#475569]" role="status">
          Tampilan 3D dinonaktifkan. {FALLBACK_MESSAGE[reason]}
        </p>
        {children}
      </div>
    );
  }

  return (
    <Viz3dBoundary onError={() => setReason('no-webgl')}>
      <Suspense
        fallback={
          <div className="flex h-[420px] items-center justify-center rounded-lg bg-[#0F2340] text-[13px] text-white/80" role="status">
            Memuat visualisasi 3D…
          </div>
        }
      >
        <IntelFlow3D {...flowProps} onFrame={onFrame} onContextLost={onContextLost} />
      </Suspense>
    </Viz3dBoundary>
  );
}
