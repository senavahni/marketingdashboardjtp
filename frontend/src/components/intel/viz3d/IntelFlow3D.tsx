/**
 * Visualisasi 3D live (M3_TASK_011): Stream (kiri) → Node sumber (tengah) → Jaringan/awan titik (kanan).
 * Dimuat malas lewat IntelFlow3DPanel agar three.js tidak masuk bundle awal.
 * Kinerja: awan titik memakai satu InstancedMesh (≤ 2.000 titik, material tanpa pencahayaan).
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { INTEL_COLORS, SOURCE_META } from '../../../lib/intel-format';
import { cn } from '../../../lib/utils';
import {
  SCENE,
  SOURCES,
  branchSegments,
  flowActivity,
  isRunning,
  layoutCloud,
  limitPoints,
  pointColor,
  sanitizeTokens,
  sentimentLabel,
  sourceColor,
  sourceNodePosition,
  streamControlPoints,
  visibleCount,
} from './mapping';
import type { IntelFlow3DProps, ProjectionPoint } from './types';

type Activity = ReturnType<typeof flowActivity>;

const toVec = (v: readonly [number, number, number]) => new THREE.Vector3(v[0], v[1], v[2]);

/** Sprite teks dari kanvas 2D: tanpa font eksternal/jaringan, sehingga tetap jalan offline. */
function makeLabelSprite(text: string, color: string, height: number): THREE.Sprite {
  const px = 40;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `600 ${px * 0.6}px system-ui, sans-serif`;
  if (ctx) {
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  } else {
    canvas.width = 16;
  }
  canvas.height = px;
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 8, px / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set((canvas.width / px) * height, height, 1);
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

function makeLine(points: THREE.Vector3[], color: string, opacity: number): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function disposeLine(line: THREE.Line) {
  line.geometry.dispose();
  (line.material as THREE.Material).dispose();
}

/** Stream: kurva berwarna per sumber + potongan kata yang meluncur ke node. */
function Streams({ tokens, activity }: { tokens: string[]; activity: Activity }) {
  const curves = useMemo(
    () =>
      SOURCES.map((_, i) => {
        const [p0, p1, p2, p3] = streamControlPoints(i, SOURCES.length);
        return new THREE.CubicBezierCurve3(toVec(p0), toVec(p1), toVec(p2), toVec(p3));
      }),
    [],
  );
  const lines = useMemo(
    () => curves.map((c, i) => makeLine(c.getPoints(48), sourceColor(SOURCES[i]), 0.55)),
    [curves],
  );
  const sprites = useMemo(
    () =>
      tokens.map((text, i) => ({
        sprite: makeLabelSprite(text, sourceColor(SOURCES[i % SOURCES.length]), 0.45),
        curve: i % SOURCES.length,
        phase: i / Math.max(tokens.length, 1),
      })),
    [tokens],
  );
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);

  useEffect(() => () => lines.forEach(disposeLine), [lines]);
  useEffect(() => () => sprites.forEach((s) => disposeSprite(s.sprite)), [sprites]);

  useFrame((_, dt) => {
    clock.current += dt * 0.12 * activity.stream;
    const active = activity.stream > 0;
    sprites.forEach(({ sprite, curve, phase }) => {
      const t = (clock.current + phase) % 1;
      curves[curve].getPoint(t, sprite.position);
      sprite.position.y += 0.35;
      sprite.material.opacity = Math.sin(Math.PI * t);
      sprite.visible = active;
    });
    dots.current.forEach((dot, i) => {
      if (!dot) return;
      dot.visible = active;
      curves[i].getPoint((clock.current * 1.6 + i * 0.25) % 1, dot.position);
    });
  });

  return (
    <group>
      {lines.map((l, i) => (
        <primitive key={SOURCES[i]} object={l} />
      ))}
      {SOURCES.map((s, i) => (
        <mesh key={s} ref={(m) => void (dots.current[i] = m)}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshBasicMaterial color={sourceColor(s)} toneMapped={false} />
        </mesh>
      ))}
      {sprites.map((s, i) => (
        <primitive key={`${i}-${s.sprite.uuid}`} object={s.sprite} />
      ))}
    </group>
  );
}

/** Node sumber vertikal + garis distribusi ke pusat jaringan. */
function SourceNodes({ activity }: { activity: Activity }) {
  const nodes = useRef<(THREE.Group | null)[]>([]);
  const labels = useMemo(
    () => SOURCES.map((s) => makeLabelSprite(SOURCE_META[s].label, INTEL_COLORS.ink, 0.5)),
    [],
  );
  const links = useMemo(
    () =>
      SOURCES.map((s, i) => {
        const from = toVec(sourceNodePosition(i, SOURCES.length));
        const hub = toVec(SCENE.networkCenter);
        const mid = from.clone().lerp(hub, 0.5).add(new THREE.Vector3(0, (i - 1.5) * 0.8, 0));
        return makeLine(new THREE.QuadraticBezierCurve3(from, mid, hub).getPoints(32), sourceColor(s), 0.35);
      }),
    [],
  );
  useEffect(() => () => labels.forEach(disposeSprite), [labels]);
  useEffect(() => () => links.forEach(disposeLine), [links]);

  useFrame(({ clock }) => {
    const pulse = 1 + 0.15 * Math.sin(clock.elapsedTime * 3) * activity.nodes;
    nodes.current.forEach((n) => n?.scale.setScalar(pulse));
  });

  return (
    <group>
      {SOURCES.map((s, i) => {
        const [x, y, z] = sourceNodePosition(i, SOURCES.length);
        return (
          <group key={s} position={[x, y, z]}>
            <group ref={(g) => void (nodes.current[i] = g)}>
              <mesh>
                <sphereGeometry args={[0.35, 20, 14]} />
                <meshBasicMaterial color={sourceColor(s)} toneMapped={false} />
              </mesh>
            </group>
            <primitive object={labels[i]} position={[0, -0.7, 0]} />
          </group>
        );
      })}
      {links.map((l, i) => (
        <primitive key={SOURCES[i]} object={l} />
      ))}
    </group>
  );
}

interface CloudProps {
  points: ProjectionPoint[];
  positions: Float32Array;
  count: number;
  selectedIndex: number | null;
  onHover: (index: number | null, e?: PointerEvent) => void;
  onSelect: (index: number | null) => void;
}

/** Awan titik: satu InstancedMesh; posisi = proyeksi 3D, warna = sentimen. */
function Cloud({ points, positions, count, selectedIndex, onHover, onSelect }: CloudProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const branches = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(branchSegments(positions, positions.length / 3), 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: INTEL_COLORS.neutral, transparent: true, opacity: 0.25 }),
    );
  }, [positions]);
  useEffect(
    () => () => {
      branches.geometry.dispose();
      (branches.material as THREE.Material).dispose();
    },
    [branches],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    points.forEach((p, i) => {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.scale.setScalar(0.055);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(pointColor(p)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [points, positions]);

  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = count;
    // Cabang ikut tumbuh bersama titik yang tampak (tiap cabang = 2 vertex)
    const segments = branches.geometry.getAttribute('position').count / 2;
    branches.geometry.setDrawRange(0, Math.floor((segments * count) / Math.max(points.length, 1)) * 2);
  }, [count, points.length, branches]);

  const hoverHandler = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(e.instanceId ?? null, e.nativeEvent);
  };

  return (
    <group>
      <primitive object={branches} />
      {points.length > 0 && (
        <instancedMesh
          key={points.length}
          ref={mesh}
          args={[undefined, undefined, points.length]}
          frustumCulled={false}
          onPointerMove={hoverHandler}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onSelect(e.instanceId ?? null);
          }}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
      {selectedIndex !== null && selectedIndex < count && (
        <mesh
          position={[positions[selectedIndex * 3], positions[selectedIndex * 3 + 1], positions[selectedIndex * 3 + 2]]}
        >
          <sphereGeometry args={[0.14, 16, 12]} />
          <meshBasicMaterial color={INTEL_COLORS.ink} wireframe toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function FrameProbe({ onFrame }: { onFrame?: (nowMs: number) => void }) {
  useFrame(() => onFrame?.(performance.now()));
  return null;
}

export function IntelFlow3D({ points: rawPoints, event, running, onFrame, onContextLost, onSelect, className }: IntelFlow3DProps) {
  const points = useMemo(() => limitPoints(rawPoints), [rawPoints]);
  const positions = useMemo(() => layoutCloud(points), [points]);
  const isActive = isRunning(event, running);
  const activity = flowActivity(event, isActive);
  const tokens = useMemo(() => sanitizeTokens(event?.sample_tokens), [event?.sample_tokens]);
  const count = visibleCount(points.length, event, isActive);

  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const contextLost = useRef(onContextLost);
  contextLost.current = onContextLost;

  const handleHover = (index: number | null, e?: PointerEvent) => {
    if (index === null || !e || !container.current) return setHover(null);
    const rect = container.current.getBoundingClientRect();
    setHover({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const handleSelect = (index: number | null) => {
    setSelected(index);
    onSelect?.(index === null ? null : (points[index] ?? null));
  };

  const hovered = hover ? points[hover.index] : null;
  const picked = selected !== null ? points[selected] : null;

  return (
    <div
      ref={container}
      className={cn('relative h-[420px] w-full overflow-hidden rounded-lg border border-[#E3E7ED] bg-[#F5F7FA]', className)}
      role="img"
      aria-label={`Visualisasi 3D aliran data riset: ${points.length} titik, empat sumber.`}
      style={{ cursor: hovered ? 'pointer' : 'grab' }}
    >
      <Canvas
        flat
        dpr={[1, 1.5]}
        camera={{ position: [0, 3, 15], fov: 50 }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', () => contextLost.current?.())}
        onPointerMissed={() => handleSelect(null)}
      >
        <color attach="background" args={[INTEL_COLORS.paper]} />
        <FrameProbe onFrame={onFrame} />
        <Streams tokens={tokens} activity={activity} />
        <SourceNodes activity={activity} />
        <Cloud
          points={points}
          positions={positions}
          count={count}
          selectedIndex={selected}
          onHover={handleHover}
          onSelect={handleSelect}
        />
        <OrbitControls target={[0, 0, 0]} enableDamping minDistance={6} maxDistance={32} />
      </Canvas>

      {hovered && hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] rounded-md bg-white px-2.5 py-1.5 text-[12px] text-[#0F2340] shadow-lg"
          style={{ left: Math.min(hover.x + 12, (container.current?.clientWidth ?? 0) - 250), top: hover.y + 12 }}
        >
          <p className="font-medium break-words">{hovered.label}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#475569]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: pointColor(hovered) }} aria-hidden />
            {sentimentLabel(hovered)} · {SOURCE_META[hovered.source].label}
          </p>
        </div>
      )}

      {picked && (
        <div className="absolute right-2 bottom-2 z-10 max-w-[280px] rounded-md bg-white/95 px-2.5 py-1.5 text-[12px] text-[#0F2340] shadow">
          <p className="font-medium break-words">{picked.label}</p>
          <p className="text-[11px] text-[#475569]">
            {sentimentLabel(picked)} · {SOURCE_META[picked.source].label}
          </p>
        </div>
      )}

      <ul className="pointer-events-none absolute bottom-2 left-2 z-10 flex gap-3 text-[11px] text-[#0F2340]" aria-hidden>
        {(['positive', 'neutral', 'negative'] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: pointColor({ sentiment: s }) }} />
            {sentimentLabel({ sentiment: s })}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default IntelFlow3D;
