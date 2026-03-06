import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Join session room ──────────────────────────────
    socket.on('join_session', ({ sessionId, visitorId }: { sessionId: string; visitorId: string }) => {
      const room = `session:${sessionId}`;
      socket.join(room);
      console.log(`[Socket] ${visitorId} joined room ${room}`);
    });

    // ── Join admin room (agents watching dashboard) ────
    socket.on('join_admin', ({ agentId }: { agentId: string }) => {
      socket.join('__admins');
      console.log(`[Socket] Agent ${agentId} joined admin broadcast room`);
    });

    // ── Typing indicators ──────────────────────────────
    socket.on('typing_start', ({ sessionId }: { sessionId: string }) => {
      socket.to(`session:${sessionId}`).emit('customer_typing', {});
    });

    socket.on('typing_stop', ({ sessionId }: { sessionId: string }) => {
      socket.to(`session:${sessionId}`).emit('customer_typing_stop', {});
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** Get the global Socket.io instance (throws if not initialized) */
export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized — call initSocket() first');
  return io;
}

/** Broadcast a notification to the admin room only (not to customer sockets) */
export function broadcastToAdmins(event: string, data: unknown): void {
  if (!io) return;
  io.to('__admins').emit(`admin:${event}`, data);
}
