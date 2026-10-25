/**
 * Server side of the NetProtocol layer: game code sends and receives typed messages through
 * `Connection` and never touches the WebSocket directly, so the transport can change later.
 */
import type { WebSocket } from "ws";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "../../shared/protocol";

export interface Connection {
  readonly id: number;
  send(message: ServerMessage): void;
  /** Sends an already-serialized message (used to share one encoding between recipients). */
  sendRaw(json: string): void;
  close(): void;
}

let nextConnectionId = 1;

export interface ConnectionHandlers {
  onMessage(conn: Connection, message: ClientMessage): void;
  onBadMessage(conn: Connection): void;
  onClose(conn: Connection): void;
}

/** Wraps a WebSocket in a Connection and routes parsed messages to the handlers. */
export function wrapSocket(socket: WebSocket, handlers: ConnectionHandlers): Connection {
  const conn: Connection = {
    id: nextConnectionId++,
    send(message) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    sendRaw(json) {
      if (socket.readyState === socket.OPEN) socket.send(json);
    },
    close() {
      socket.close();
    },
  };
  socket.on("message", (data, isBinary) => {
    if (isBinary) return handlers.onBadMessage(conn);
    const message = parseClientMessage(data.toString());
    if (message) handlers.onMessage(conn, message);
    else handlers.onBadMessage(conn);
  });
  socket.on("close", () => handlers.onClose(conn));
  socket.on("error", () => socket.close());
  return conn;
}
