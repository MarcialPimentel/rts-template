import { GAME } from "../../../shared/data";
import type { ViewState } from "../../../shared/view";
import { Camera } from "./camera";
import { Feedback } from "./feedback";
import { Hud } from "./hud";
import { Input, type FeedbackKind } from "./input";
import { renderWorld } from "./render";
import type { Session } from "./session";

export interface EndAction {
  label: string;
  run(): void;
}

export interface GameScreenOptions {
  /** Buttons shown on the victory/defeat screen. */
  endActions: EndAction[];
}

const HUD_TOP = 40;
const HUD_BOTTOM = 96;

/** The in-match screen: canvas, camera, input, HUD and the end-of-match overlay. */
export class GameScreen {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new Camera(GAME);
  private readonly feedback = new Feedback();
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly endOverlay: HTMLDivElement;
  private frame = 0;
  private lastFrameAt = performance.now();
  private flippedFor = -1;
  private ended = false;

  constructor(
    container: HTMLElement,
    private readonly session: Session,
    private readonly options: GameScreenOptions,
  ) {
    this.root = document.createElement("div");
    this.root.className = "game";
    this.canvas = document.createElement("canvas");
    this.root.append(this.canvas);
    container.append(this.root);
    this.ctx = this.canvas.getContext("2d")!;

    this.input = new Input(this.canvas, this.camera, session, GAME, {
      onCommand: (kind: FeedbackKind, at) => this.feedback.onCommand(kind, at),
    });
    this.hud = new Hud(this.root, GAME, session, this.input);

    this.endOverlay = document.createElement("div");
    this.endOverlay.className = "overlay hidden";
    this.root.append(this.endOverlay);

    window.addEventListener("resize", this.resize);
    this.resize();

    // Read-only hook for automated browser tests (screenshots, scripted clicks).
    (window as unknown as { __rts: unknown }).__rts = {
      toScreen: (x: number, y: number) => this.camera.toScreen(x, y),
      view: () => this.session.view(performance.now()),
      localPlayer: () => this.session.localPlayer,
    };
    this.frame = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.input.dispose();
    this.session.dispose();
    this.root.remove();
  }

  private readonly resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(w, h, HUD_BOTTOM, HUD_TOP);
  };

  private readonly loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    const view = this.session.view(now);
    if (view) this.draw(view, now, dt);
    this.frame = requestAnimationFrame(this.loop);
  };

  private draw(view: ViewState, now: number, dt: number): void {
    // Mirror the map for player 2 so the local base is always on the left.
    if (this.flippedFor !== this.session.localPlayer) {
      this.flippedFor = this.session.localPlayer;
      this.camera.flipped = this.session.localPlayer % 2 === 1;
      const hq = view.entities.find(
        (e) => e.owner === this.session.localPlayer && GAME.defs[e.type]?.isHeadquarters,
      );
      if (hq) this.camera.lookAt(hq.x + 300, hq.y);
    }

    this.input.update(view);
    this.camera.update(dt, this.input.keyPan, this.input.mouse, window.innerWidth);

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    renderWorld(ctx, view, this.camera, GAME, {
      localPlayer: this.session.localPlayer,
      selection: this.input.selection,
      dragBox: this.input.dragBox,
    });
    this.feedback.draw(ctx, this.camera, now);
    this.canvas.style.cursor = this.input.attackMoveArmed ? "crosshair" : "default";
    this.hud.update(view);

    if (view.status === "ended" && !this.ended) {
      this.ended = true;
      this.showEnd(view);
    } else if (view.status === "playing" && this.ended) {
      this.ended = false;
      this.endOverlay.classList.add("hidden");
    }
  }

  private showEnd(view: ViewState): void {
    const won = view.winner === this.session.localPlayer;
    const title = view.winner === null ? "Draw" : won ? "Victory" : "Defeat";
    const reason =
      view.endReason === "forfeit"
        ? won
          ? "Your opponent left the match."
          : "You left the match."
        : view.endReason === "headquarters_destroyed"
          ? won
            ? "You destroyed the enemy Town Hall."
            : "Your Town Hall was destroyed."
          : "";
    this.endOverlay.innerHTML = `<div class="card"><h2 class="${won ? "win" : "lose"}">${title}</h2><p>${reason}</p><div class="actions"></div></div>`;
    const actions = this.endOverlay.querySelector(".actions")!;
    for (const a of this.options.endActions) {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.addEventListener("click", () => a.run());
      actions.append(b);
    }
    this.endOverlay.classList.remove("hidden");
  }
}
