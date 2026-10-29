import { io, type Socket } from 'socket.io-client';
import { useEffect } from 'react';
import { refreshSession } from './api';
import { getToken } from './auth-store';

let socket: Socket | null = null;
const joined = new Map<string, number>(); // "project:<id>" → jumlah pemakai

/** Koneksi Socket.IO tunggal ke namespace /realtime (same-origin, lewat proxy). */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io('/realtime', {
    path: (import.meta.env.VITE_WS_PATH as string | undefined) || '/socket.io',
    auth: (cb) => cb({ token: getToken() }),
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => {
    // Rejoin semua room setelah reconnect
    for (const key of joined.keys()) {
      const [type, id] = key.split(':');
      socket?.emit('room.join', { type, id });
    }
  });
  socket.on('connect_error', async (err) => {
    if (err.message === 'TOKEN_EXPIRED' || err.message === 'UNAUTHENTICATED') {
      if (await refreshSession()) socket?.connect();
    }
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  joined.clear();
}

/** Join room project/task selama komponen ter-mount. */
export function useRealtimeRoom(type: 'project' | 'task', id: string | null | undefined): void {
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    const key = `${type}:${id}`;
    joined.set(key, (joined.get(key) ?? 0) + 1);
    if ((joined.get(key) ?? 0) === 1) s.emit('room.join', { type, id });
    return () => {
      const n = (joined.get(key) ?? 1) - 1;
      if (n <= 0) {
        joined.delete(key);
        s.emit('room.leave', { type, id });
      } else joined.set(key, n);
    };
  }, [type, id]);
}
