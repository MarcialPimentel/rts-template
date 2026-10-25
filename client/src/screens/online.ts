import { PLAYER_COLORS } from "../../../shared/lobby";
import { ROOM_CODE_LENGTH, type ServerMessage } from "../../../shared/protocol";
import { serverHttpUrl, serverUrl } from "../config";
import { GameScreen } from "../game/game_screen";
import { Connection } from "../net/connection";
import { OnlineSession } from "../net/online_session";
import { buildsMatch } from "../net/version";

/** Show the wake screen if the server hasn't answered by then (GDD: 2 seconds). */
const WAKE_HINT_AFTER_MS = 2000;
/** How long a sleeping Render free service usually takes to boot. */
const EXPECTED_WAKE_MS = 60_000;
const ATTEMPT_TIMEOUT_MS = 6000;
const RETRY_EVERY_MS = 2500;
const GIVE_UP_AFTER_MS = 150_000;

export interface OnlineOptions {
  container: HTMLElement;
  /** Room code to join straight away (from a shared ?join= link). */
  joinCode?: string;
  /** Return to the title screen. */
  onExit(): void;
}

type RoomMessage = Extract<ServerMessage, { t: "room" }>;

/**
 * The online flow: connect → online menu (create or join) → lobby (pick colours, ready up) →
 * countdown → match → back to the lobby. Owns the connection and routes server messages to
 * whichever screen is open.
 */
export class OnlineController {
  private conn: Connection | null = null;
  private screen: HTMLDivElement | null = null;
  private game: GameScreen | null = null;
  private session: OnlineSession | null = null;
  private disposed = false;

  constructor(private readonly opts: OnlineOptions) {
    void this.connect();
  }

  dispose(): void {
    this.disposed = true;
    window.clearInterval(this.screenTimer);
    this.game?.dispose();
    this.game = null;
    this.conn?.close();
    this.conn = null;
    this.screen?.remove();
  }

  /**
   * Connects, retrying while a sleeping free-tier server boots (about a minute). After 2 seconds
   * without an answer the wake screen explains the wait instead of a silent hang (GDD MUST).
   */
  private async connect(): Promise<void> {
    const started = performance.now();
    this.show(`<div class="spinner"></div><p>Connecting to the server…</p>`);
    const wakeHint = window.setTimeout(() => this.showWaking(started), WAKE_HINT_AFTER_MS);
    this.pokeServer();

    let conn: Connection | null = null;
    while (!conn && !this.disposed) {
      try {
        conn = await Connection.open(serverUrl(), ATTEMPT_TIMEOUT_MS);
      } catch {
        if (performance.now() - started > GIVE_UP_AFTER_MS) break;
        this.pokeServer();
        await new Promise((r) => window.setTimeout(r, RETRY_EVERY_MS));
      }
    }
    window.clearTimeout(wakeHint);

    if (this.disposed) {
      conn?.close();
      return;
    }
    if (!conn) {
      this.showError("The game server didn't respond. It may be down; try again in a few minutes.");
      return;
    }
    this.conn = conn;
    this.conn.onMessage((m) => this.onMessage(m));
    this.conn.onClose(() => this.onConnectionLost());
  }

  /** An HTTP request wakes a sleeping Render service even if WebSocket attempts are refused. */
  private pokeServer(): void {
    fetch(`${serverHttpUrl()}/healthz`, { cache: "no-store" }).catch(() => {});
  }

  private showWaking(started: number): void {
    this.show(`
      <div class="spinner"></div>
      <h1>Waking up the server</h1>
      <p>The free server sleeps when nobody is playing. This can take up to a minute.</p>
      <div class="progress"><i></i></div>
      <p class="build" data-field="elapsed"></p>
      <div class="buttons"><button data-action="back">Cancel</button></div>`);
    this.on("back", () => this.opts.onExit());
    const update = () => {
      const elapsed = performance.now() - started;
      const bar = this.screen?.querySelector<HTMLElement>(".progress i");
      if (bar) bar.style.width = `${Math.min(95, (elapsed / EXPECTED_WAKE_MS) * 100)}%`;
      const label = this.screen?.querySelector('[data-field="elapsed"]');
      if (label) label.textContent = `${Math.floor(elapsed / 1000)} s`;
    };
    update();
    this.screenTimer = window.setInterval(update, 250);
  }

  private onMessage(m: ServerMessage): void {
    if (this.session) {
      this.session.handle(m);
      if (m.t === "room_closed") this.leaveToMenu();
      if (m.t === "room") this.onRoomDuringGame(m);
      return;
    }
    switch (m.t) {
      case "hello":
        if (!buildsMatch(__BUILD_ID__, m.build)) {
          this.showVersionMismatch(m.build);
          return;
        }
        this.showOnlineMenu();
        if (this.opts.joinCode) this.join(this.opts.joinCode);
        break;
      case "room":
        this.showRoom(m);
        break;
      case "error":
        this.showOnlineMenu(m.message);
        break;
      case "match_start":
        this.startGame(m.you, m.typeIds, m.colors);
        break;
      case "room_closed":
        this.showOnlineMenu("The room was closed.");
        break;
    }
  }

  private roomCode = "";
  /** The latest lobby state, so "Back to lobby" after a match can redraw it. */
  private lastRoom: RoomMessage | null = null;

  private showOnlineMenu(error = ""): void {
    this.show(`
      <h1>Play online</h1>
      <div class="buttons">
        <button class="primary" data-action="create">Create a room</button>
        <div class="row">
          <input data-field="code" maxlength="${ROOM_CODE_LENGTH}" placeholder="CODE" autocomplete="off" spellcheck="false" />
          <button data-action="join">Join</button>
        </div>
        <button data-action="back">Back</button>
      </div>
      <p class="error">${escapeHtml(error)}</p>`);
    const input = this.screen!.querySelector<HTMLInputElement>('[data-field="code"]')!;
    this.on("create", () => this.conn?.send({ t: "create_room" }));
    this.on("join", () => this.join(input.value));
    this.on("back", () => this.opts.onExit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.join(input.value);
    });
  }

  private join(code: string): void {
    const clean = code.trim().toUpperCase();
    if (clean.length !== ROOM_CODE_LENGTH) {
      this.showOnlineMenu(`Room codes are ${ROOM_CODE_LENGTH} letters.`);
      return;
    }
    this.conn?.send({ t: "join_room", code: clean });
  }

  /** The lobby: room code and invite link, both players with their colours, Ready, countdown. */
  private showRoom(m: RoomMessage): void {
    this.roomCode = m.code;
    this.lastRoom = m;
    if (m.phase === "playing") return;
    const link = `${location.origin}${location.pathname}?join=${m.code}`;
    const me = m.you;
    const opponent = 1 - me;
    const counting = m.phase === "countdown";

    const card = (slot: number) => {
      const color = PLAYER_COLORS[m.colors[slot] ?? slot]!;
      const here = m.connected[slot];
      const status = !here ? "Waiting for a player…" : m.ready[slot] ? "Ready" : "Not ready";
      return `
        <div class="player-card ${here ? "" : "empty"} ${m.ready[slot] ? "is-ready" : ""}" style="--pc:${color.fill}">
          <span class="swatch"></span>
          <div>
            <div class="title">Player ${slot + 1}${slot === me ? " (you)" : ""}</div>
            <div class="status">${here ? `${color.name} · ` : ""}${status}</div>
          </div>
        </div>`;
    };

    const swatches = PLAYER_COLORS.map((c, i) => {
      const takenByOpponent = m.connected[opponent] && m.colors[opponent] === i;
      const mine = m.colors[me] === i;
      return `<button class="color-pick ${mine ? "selected" : ""}" data-color="${i}" title="${c.name}" style="--pc:${c.fill}" ${takenByOpponent || counting ? "disabled" : ""}></button>`;
    }).join("");

    const bothHere = m.connected.every(Boolean);
    const hint = counting
      ? `<p class="countdown" data-field="count"></p>`
      : !bothHere
        ? `<p>Share the code or invite link with your opponent.</p>`
        : m.ready[me]
          ? `<p>Waiting for your opponent to press Ready…</p>`
          : `<p>Press Ready when you're set. The match starts when both players are ready.</p>`;

    this.show(`
      <h1>Lobby</h1>
      <p class="code">${m.code}</p>
      <div class="buttons"><button data-action="copy">Copy invite link</button></div>
      <div class="players">${card(0)}${card(1)}</div>
      <div class="colors"><span>Your colour</span>${swatches}</div>
      ${hint}
      <div class="buttons">
        <button class="${m.ready[me] ? "" : "primary"}" data-action="ready">${m.ready[me] ? (counting ? "Cancel" : "Not ready") : "Ready"}</button>
        <button data-action="leave">Leave room</button>
      </div>`);

    this.on("copy", (button) => {
      void navigator.clipboard?.writeText(link).then(() => (button.textContent = "Link copied"));
    });
    this.on("ready", () => this.conn?.send({ t: "set_ready", ready: !m.ready[me] }));
    this.on("leave", () => {
      this.conn?.send({ t: "leave" });
      this.lastRoom = null;
      this.showOnlineMenu();
    });
    for (const b of this.screen!.querySelectorAll<HTMLButtonElement>(".color-pick")) {
      b.addEventListener("click", () => this.conn?.send({ t: "set_color", color: Number(b.dataset.color) }));
    }

    if (counting) {
      const endsAt = performance.now() + (m.startsInMs ?? 0);
      const update = () => {
        const s = Math.max(1, Math.ceil((endsAt - performance.now()) / 1000));
        const el = this.screen?.querySelector('[data-field="count"]');
        if (el) el.textContent = `Match starts in ${s}…`;
      };
      update();
      this.screenTimer = window.setInterval(update, 100);
    }
  }

  private startGame(you: number, typeIds: string[], colors: number[]): void {
    if (!this.conn) return;
    window.clearInterval(this.screenTimer);
    this.screen?.remove();
    this.screen = null;
    this.session = new OnlineSession(this.conn, you, typeIds, colors, this.roomCode);
    this.game = new GameScreen(this.opts.container, this.session, {
      endActions: [
        { label: "Back to lobby", run: () => this.backToLobby() },
        { label: "Leave room", run: () => this.leaveToMenu() },
      ],
    });
  }

  /** After a match: close the game screen and show the lobby for another round. */
  private backToLobby(): void {
    this.game?.dispose(); // also disposes the session
    this.game = null;
    this.session = null;
    if (this.lastRoom) this.showRoom(this.lastRoom);
    else this.showOnlineMenu();
  }

  /** Lobby updates that arrive while the result screen is still open. */
  private onRoomDuringGame(m: RoomMessage): void {
    this.lastRoom = m;
    if (m.phase !== "waiting" || !this.game) return;
    const opponent = 1 - m.you;
    if (!m.connected[opponent]) this.game.setEndNote("Your opponent left the room.");
    else if (m.ready[opponent]) this.game.setEndNote("Your opponent is ready for another round.");
  }

  private leaveToMenu(): void {
    this.conn?.send({ t: "leave" });
    this.lastRoom = null;
    this.game?.dispose(); // also disposes the session
    this.game = null;
    this.session = null;
    this.showOnlineMenu();
  }

  private onConnectionLost(): void {
    this.conn = null;
    if (this.session) {
      this.session.markConnectionLost();
      return;
    }
    this.showError("Lost the connection to the server.");
  }

  /** GDD: a client and server on different builds show "please refresh" instead of connecting. */
  private showVersionMismatch(serverBuild: string): void {
    this.conn?.close();
    this.conn = null;
    this.show(`
      <h1>New version available</h1>
      <p>The game was just updated. Refresh to load the latest version.</p>
      <p class="build">Your version ${escapeHtml(__BUILD_ID__)} · server ${escapeHtml(serverBuild)}</p>
      <p class="build">If this keeps happening, the server is still restarting. Try again in a minute.</p>
      <div class="buttons">
        <button class="primary" data-action="refresh">Refresh</button>
        <button data-action="back">Back</button>
      </div>`);
    this.on("refresh", () => location.reload());
    this.on("back", () => this.opts.onExit());
  }

  private showError(message: string): void {
    this.show(`
      <h1>Offline</h1>
      <p class="error">${escapeHtml(message)}</p>
      <div class="buttons">
        <button class="primary" data-action="retry">Try again</button>
        <button data-action="back">Back</button>
      </div>`);
    this.on("retry", () => void this.connect());
    this.on("back", () => this.opts.onExit());
  }

  private screenTimer = 0;

  private show(html: string): void {
    window.clearInterval(this.screenTimer);
    if (!this.screen) {
      this.screen = document.createElement("div");
      this.screen.className = "menu";
      this.opts.container.append(this.screen);
    }
    this.screen.innerHTML = `${html}<p class="build">build ${__BUILD_ID__}</p>`;
  }

  private on(action: string, fn: (button: HTMLButtonElement) => void): void {
    const button = this.screen?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    button?.addEventListener("click", () => fn(button));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
