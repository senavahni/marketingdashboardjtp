import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { TokenService } from '../auth/token.service';
import { AccessService } from '../core/access.service';
import { rooms } from './realtime.events';
import { RealtimeService } from './realtime.service';

const roomSchema = z.object({ type: z.enum(['project', 'task']), id: z.uuid() });
type Ack = { ok: true } | { ok: false; error: string };

const corsOrigins = (process.env.APP_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim());

/**
 * Gateway Socket.IO namespace /realtime.
 * Auth: io(url, { auth: { token } }) — token invalid → connect_error dengan message TOKEN_EXPIRED/UNAUTHENTICATED.
 * Klien join room via 'room.join' { type, id }.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: corsOrigins, credentials: true } })
export class RealtimeGateway implements OnGatewayInit<Namespace>, OnGatewayConnection<Socket> {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
    // Autentikasi di middleware: event "connect" di klien baru terjadi setelah token valid
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((err: unknown) => {
          const code = err instanceof AppException ? err.code : 'UNAUTHENTICATED';
          next(Object.assign(new Error(code), { data: { code } }));
        });
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    if (client.data.userId) await client.join(rooms.user(client.data.userId as string));
  }

  private async authenticate(socket: Socket): Promise<void> {
    const raw = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.headers.authorization?.replace(/^Bearer /, '');
    if (!raw) throw new Error('UNAUTHENTICATED');
    const userId = this.tokens.verifyAccess(raw);
    const user = await this.prisma.users.findUnique({ where: { id: userId }, select: { id: true, is_active: true } });
    if (!user?.is_active) throw new Error('UNAUTHENTICATED');
    socket.data.userId = user.id;
  }

  @SubscribeMessage('room.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = roomSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'UNAUTHENTICATED' };
    try {
      if (parsed.data.type === 'project') await this.access.assertProject(userId, parsed.data.id);
      else await this.access.assertTask(userId, parsed.data.id);
      await client.join(parsed.data.type === 'project' ? rooms.project(parsed.data.id) : rooms.task(parsed.data.id));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof AppException ? err.code : 'INTERNAL_ERROR' };
    }
  }

  @SubscribeMessage('room.leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = roomSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };
    await client.leave(parsed.data.type === 'project' ? rooms.project(parsed.data.id) : rooms.task(parsed.data.id));
    return { ok: true };
  }
}
