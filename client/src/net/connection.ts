/**
 * Client side of the NetProtocol layer: typed messages over the browser's WebSocket.
 * Game code never touches the socket directly.
 */
import { parseServerMessage, type ClientMessage, type ServerMessage } from "../../../shared/protocol";

export type MessageHandler = (message: ServerMessage) => void;

/**
 * Testing aid: `?lag=150` adds 150 ms of round-trip latency (half on send, half on receive),
 * to check that the game still feels responsive on a slow connection (GDD latency test).
 */
function simulatedLagMs(): number {
  const lag = Number(new URLSearchParams(location.search).get("lag"));
  return Number.isFinite(lag) && lag > 0 ? Math.min(lag, 2000) : 0;
}

export class Connection {
  private handler: MessageHandler = () => {};
  private readonly halfLag = simulatedLagMs() / 2;
  private closeHandler: () => void = () => {};
  private closedByUs = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      const message = parseServerMessage(e.data);
      if (!message) return;
      if (this.halfLag > 0) window.setTimeout(() => this.handler(message), this.halfLag);
      else this.handler(message);
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
    const text = JSON.stringify(message);
    const go = () => {
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send(text);
    };
    if (this.halfLag > 0) window.setTimeout(go, this.halfLag);
    else go();
  }

  close(): void {
    this.closedByUs = true;
    this.socket.close();
  }
}
