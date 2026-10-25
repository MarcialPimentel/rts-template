/**
 * Client side of the NetProtocol layer: typed messages over the browser's WebSocket.
 * Game code never touches the socket directly.
 */
import { parseServerMessage, type ClientMessage, type ServerMessage } from "../../../shared/protocol";

export type MessageHandler = (message: ServerMessage) => void;

export class Connection {
  private handler: MessageHandler = () => {};
  private closeHandler: () => void = () => {};
  private closedByUs = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      const message = parseServerMessage(e.data);
      if (message) this.handler(message);
    });
    socket.addEventListener("close", () => {
      if (!this.closedByUs) this.closeHandler();
    });
  }

  /** Opens a connection, resolving once connected or rejecting if it fails or times out. */
  static open(url: string, timeoutMs = 8000): Promise<Connection> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }
      const timer = window.setTimeout(() => {
        socket.close();
        reject(new Error("timeout"));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        window.clearTimeout(timer);
        resolve(new Connection(socket));
      });
      socket.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("connection failed"));
      });
    });
  }

  /** Sets who receives incoming messages (screens swap this as the player moves through them). */
  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  /** Called if the connection drops without us closing it. */
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.closedByUs = true;
    this.socket.close();
  }
}
