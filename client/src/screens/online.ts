import { ROOM_CODE_LENGTH, type ServerMessage } from "../../../shared/protocol";
import { serverUrl } from "../config";
import { GameScreen } from "../game/game_screen";
import { Connection } from "../net/connection";
import { OnlineSession } from "../net/online_session";

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
    window.clearInterval(this.countdownTimer);
    this.game?.dispose();
    this.game = null;
    this.conn?.close();
    this.conn = null;
    this.screen?.remove();
  }

  private async connect(): Promise<void> {
    this.show(`<div class="spinner"></div><p>Connecting to the server…</p>`);
    try {
      this.conn = await Connection.open(serverUrl());
    } catch {
      if (this.disposed) return;
      this.showError("Couldn't reach the game server.");
      return;
    }
    if (this.disposed) {
      this.conn.close();
      return;
    }
    this.conn.onMessage((m) => this.onMessage(m));
    this.conn.onClose(() => this.onConnectionLost());
  }

  private onMessage(m: ServerMessage): void {
    if (this.session) {
      this.session.handle(m);
      if (m.t === "room_closed") this.leaveToMenu();
      return;
    }
    switch (m.t) {
      case "hello":
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
      this.countdownTimer = window.setInterval(update, 100);
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
    window.clearInterval(this.countdownTimer);
    this.screen?.remove();
    this.screen = null;
    this.session = new OnlineSession(this.conn, you, typeIds, this.roomCode);
    this.game = new GameScreen(this.opts.container, this.session, {
      endActions: [{ label: "Back to menu", run: () => this.leaveToMenu() }],
    });
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

  private countdownTimer = 0;

  private show(html: string): void {
    window.clearInterval(this.countdownTimer);
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
