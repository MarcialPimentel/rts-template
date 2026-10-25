import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { TICK_MS } from "../../shared/sim/constants";
import { BUILD_ID } from "./build";
import { wrapSocket, type Connection } from "./net";
import { DEFAULT_TIMINGS, RoomManager, type RoomTimings } from "./rooms";

export interface ServerOptions {
  port: number;
  timings?: RoomTimings;
  /** Log connections and rooms to stdout. */
  log?: boolean;
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

/** Max size of one client message; real messages are far smaller. */
const MAX_PAYLOAD = 16 * 1024;
/** How often dead sockets are detected and dropped. */
const HEARTBEAT_MS = 15_000;

/**
 * Starts the game server: an HTTP endpoint for health checks and a WebSocket endpoint for players,
 * plus one fixed-rate loop that ticks every room at 20 ticks per second.
 */
export function startServer(options: ServerOptions): Promise<RunningServer> {
  const manager = new RoomManager(options.timings ?? DEFAULT_TIMINGS);
  const log = (...args: unknown[]) => options.log && console.log(new Date().toISOString(), ...args);

  const http: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/healthz") {
      // The client calls this cross-origin to wake a sleeping server.
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, build: BUILD_ID, rooms: manager.rooms.size }));
      return;
    }
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`RTS Template game server, build ${BUILD_ID}. Connect over WebSocket.`);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: { threshold: 512 },
  });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    const conn = wrapSocket(socket, {
      onMessage: (c, message) => {
        const now = performance.now();
        switch (message.t) {
          case "create_room": {
            const room = manager.create(c, now);
            log(`conn ${c.id} created room ${room.code}`);
            break;
          }
          case "join_room": {
            const result = manager.join(c, message.code, now);
            if (result === "room_not_found") {
              c.send({ t: "error", code: "room_not_found", message: `No room with code ${message.code}.` });
            } else if (result === "room_full") {
              c.send({ t: "error", code: "room_full", message: `Room ${message.code} is already full.` });
            } else {
              log(`conn ${c.id} joined room ${result.code}`);
            }
            break;
          }
          case "command":
            manager.roomFor(c)?.queueCommand(c, message.seq, message.cmd);
            break;
          case "ping":
            c.send({ t: "pong", id: message.id });
            break;
          case "rematch":
            // Rematches arrive in M5 (#25).
            break;
          case "leave":
            manager.leave(c, now, true);
            break;
        }
      },
      onBadMessage: (c) => c.send({ t: "error", code: "bad_message", message: "Malformed message." }),
      onClose: (c: Connection) => {
        manager.leave(c, performance.now());
        log(`conn ${c.id} closed`);
      },
    });
    conn.send({ t: "hello", build: BUILD_ID });
    log(`conn ${conn.id} connected`);
  });

  // Fixed-rate loop: run exactly one room tick per 50 ms of real time, catching up if late.
  let last = performance.now();
  const loop = setInterval(() => {
    const now = performance.now();
    if (now - last > 1000) last = now - TICK_MS; // after a long stall, don't fast-forward
    while (now - last >= TICK_MS) {
      last += TICK_MS;
      manager.tick(last);
    }
  }, TICK_MS / 5);

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);

  return new Promise((resolve) => {
    http.listen(options.port, () => {
      const port = (http.address() as AddressInfo).port;
      resolve({
        port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(loop);
            clearInterval(heartbeat);
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}
