import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * One socket for the whole app.
 *
 * Every subscriber shares it. Opening a connection per listener would give the server a
 * dozen clients for one browser tab and make the "who is connected" question meaningless.
 */
export function getSocket(): Socket {
  socket ??= io({ path: '/events', transports: ['websocket'] });
  return socket;
}

export function closeSocket(): void {
  socket?.close();
  socket = null;
}
