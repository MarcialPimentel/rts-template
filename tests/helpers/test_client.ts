import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";

type Msg<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;

/** A scripted player for server integration tests: records messages and waits for them. */
export class TestClient {
  readonly inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const m = JSON.parse(data.toString()) as ServerMessage;
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      const client = new TestClient(socket);
      socket.once("open", () => resolve(client));
      socket.once("error", reject);
    });
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  /** Resolves with the first message of type `t` (already received or future) matching `pred`. */
  waitFor<T extends ServerMessage["t"]>(
    t: T,
    pred: (m: Msg<T>) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<Msg<T>> {
    const match = (m: ServerMessage) => m.t === t && pred(m as Msg<T>);
    const existing = this.inbox.find(match);
    if (existing) return Promise.resolve(existing as Msg<T>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${t}`)), timeoutMs);
      this.waiters.push({
        pred: match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Msg<T>);
        },
      });
    });
  }

  /** Forgets received messages so later waits only see new ones. */
  clear(): void {
    this.inbox.length = 0;
  }

  close(): void {
    this.socket.close();
  }
}
