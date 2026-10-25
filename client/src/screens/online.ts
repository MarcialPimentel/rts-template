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

/**
 * The online flow: connect → online menu (create or join) → waiting room with the code →
 * countdown → match. Owns the connection and routes server messages to whichever screen is open.
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
        this.startGame(m.you, m.typeIds);
        break;
      case "room_closed":
        this.showOnlineMenu("The room was closed.");
        break;
    }
  }

  private roomCode = "";

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

  private showRoom(m: Extract<ServerMessage, { t: "room" }>): void {
    this.roomCode = m.code;
    if (m.phase === "countdown") {
      const endsAt = performance.now() + (m.startsInMs ?? 0);
      this.show(`<h1>Opponent found</h1><p class="code">${m.code}</p><p data-field="count"></p>`);
      const update = () => {
        const s = Math.max(1, Math.ceil((endsAt - performance.now()) / 1000));
        const el = this.screen?.querySelector('[data-field="count"]');
        if (el) el.textContent = `Match starts in ${s}…`;
      };
      update();
      this.screenTimer = window.setInterval(update, 100);
      return;
    }
    if (m.phase !== "waiting") return;
    const link = `${location.origin}${location.pathname}?join=${m.code}`;
    this.show(`
      <h1>Waiting for an opponent</h1>
      <p>Share this room code:</p>
      <p class="code">${m.code}</p>
      <div class="buttons">
        <button data-action="copy">Copy invite link</button>
        <button data-action="cancel">Cancel</button>
      </div>
      <p class="build">${escapeHtml(link)}</p>`);
    this.on("copy", (button) => {
      void navigator.clipboard?.writeText(link).then(() => (button.textContent = "Link copied"));
    });
    this.on("cancel", () => {
      this.conn?.send({ t: "leave" });
      this.showOnlineMenu();
    });
  }

  private startGame(you: number, typeIds: string[]): void {
    if (!this.conn) return;
    window.clearInterval(this.screenTimer);
    this.screen?.remove();
    this.screen = null;
    this.session = new OnlineSession(this.conn, you, typeIds, this.roomCode);
    this.game = new GameScreen(this.opts.container, this.session, {
      endActions: [
        { label: "Rematch", run: () => this.requestRematch() },
        { label: "Back to menu", run: () => this.leaveToMenu() },
      ],
    });
  }

  private requestRematch(): void {
    this.conn?.send({ t: "rematch" });
    this.game?.setEndNote("Waiting for your opponent…");
  }

  /** After a match: show rematch status, and switch to the countdown once both players agree. */
  private onRoomDuringGame(m: Extract<ServerMessage, { t: "room" }>): void {
    if (m.phase === "countdown") {
      this.game?.dispose(); // also disposes the session
      this.game = null;
      this.session = null;
      this.showRoom(m);
      return;
    }
    if (m.phase !== "ended" || !this.game) return;
    const opponent = 1 - m.you;
    if (!m.connected[opponent]) this.game.setEndNote("Your opponent left the room.");
    else if (m.rematch[m.you]) this.game.setEndNote("Waiting for your opponent…");
    else if (m.rematch[opponent]) this.game.setEndNote("Your opponent wants a rematch!");
  }

  private leaveToMenu(): void {
    this.conn?.send({ t: "leave" });
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
