import type { CompiledGame } from "../../../shared/data";
import type { Command } from "../../../shared/sim/commands";
import type { ViewEntity, ViewState } from "../../../shared/view";
import type { Camera } from "./camera";
import type { Session } from "./session";

export type FeedbackKind = "move" | "attack" | "rally" | "train" | "stop";

export interface InputCallbacks {
  /** Called the moment a command is issued, before the simulation has seen it. */
  onCommand(kind: FeedbackKind, world: { x: number; y: number } | null): void;
}

const DRAG_THRESHOLD = 5;

/**
 * Standard RTS controls (GDD): left-click/drag to select, Shift to add, right-click to move,
 * attack or set a rally point, A then left-click to attack-move, S to stop, Q to train.
 * Input only ever produces commands; it never changes the world.
 */
export class Input {
  readonly selection = new Set<number>();
  attackMoveArmed = false;
  /** Screen-space drag rectangle while selecting. */
  dragBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Mouse position over the canvas, or null when outside the window. */
  mouse: { x: number; y: number } | null = null;
  keyPan = { x: 0, y: 0 };

  private dragStart: { x: number; y: number } | null = null;
  private keysDown = new Set<string>();
  private latest: ViewState | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly session: Session,
    private readonly game: CompiledGame,
    private readonly callbacks: InputCallbacks,
  ) {
    this.listen(canvas, "mousedown", (e) => this.onMouseDown(e as MouseEvent));
    this.listen(window, "mousemove", (e) => this.onMouseMove(e as MouseEvent));
    this.listen(window, "mouseup", (e) => this.onMouseUp(e as MouseEvent));
    this.listen(document, "mouseleave", () => (this.mouse = null));
    this.listen(canvas, "contextmenu", (e) => e.preventDefault());
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, "keyup", (e) => this.onKeyUp(e as KeyboardEvent));
    this.listen(window, "blur", () => {
      this.keysDown.clear();
      this.keyPan = { x: 0, y: 0 };
      this.mouse = null;
    });
  }

  /** Called every frame with the world being drawn, so selection stays valid. */
  update(view: ViewState): void {
    this.latest = view;
    const alive = new Set(view.entities.map((e) => e.id));
    for (const id of this.selection) if (!alive.has(id)) this.selection.delete(id);
  }

  dispose(): void {
    for (const c of this.cleanups) c();
  }

  selectedEntities(): ViewEntity[] {
    return (this.latest?.entities ?? []).filter((e) => this.selection.has(e.id));
  }

  /** Own units in the selection. */
  selectedUnits(): number[] {
    return this.selectedEntities()
      .filter((e) => e.owner === this.session.localPlayer && this.isUnit(e))
      .map((e) => e.id);
  }

  /** Own producers in the selection. */
  selectedProducers(): ViewEntity[] {
    return this.selectedEntities().filter(
      (e) => e.owner === this.session.localPlayer && (this.game.defs[e.type]?.produces.length ?? 0) > 0,
    );
  }

  train(): void {
    for (const b of this.selectedProducers()) {
      const unit = this.game.defs[b.type]!.produces[0]!;
      this.issue({ type: "train", building: b.id, unit }, "train", null);
    }
  }

  stop(): void {
    const units = this.selectedUnits();
    if (units.length) this.issue({ type: "stop", units }, "stop", null);
  }

  armAttackMove(): void {
    if (this.selectedUnits().length) this.attackMoveArmed = true;
  }

  private issue(command: Command, kind: FeedbackKind, at: { x: number; y: number } | null): void {
    this.session.send(command);
    this.callbacks.onCommand(kind, at);
  }

  private isUnit(e: ViewEntity): boolean {
    return this.game.defs[e.type]?.kind === "unit";
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  private canvasPoint(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private entityAt(sx: number, sy: number): ViewEntity | null {
    if (!this.latest) return null;
    const w = this.camera.toWorld(sx, sy);
    let best: ViewEntity | null = null;
    let bestScore = Infinity;
    for (const e of this.latest.entities) {
      const def = this.game.defs[e.type];
      if (!def) continue;
      const reach = def.radius * (def.kind === "building" ? 0.85 : 1) + 6 / this.camera.scale;
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d > reach) continue;
      // Prefer units over the building they stand next to.
      const score = d + (def.kind === "building" ? 1000 : 0);
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private onMouseDown(e: MouseEvent): void {
    const p = this.canvasPoint(e);
    if (e.button === 0) {
      if (this.attackMoveArmed) {
        const units = this.selectedUnits();
        const w = this.camera.toWorld(p.x, p.y);
        if (units.length) this.issue({ type: "attack_move", units, ...w }, "attack", w);
        this.attackMoveArmed = false;
        return;
      }
      this.dragStart = p;
      this.dragBox = null;
    } else if (e.button === 2) {
      this.attackMoveArmed = false;
      this.onRightClick(p.x, p.y);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const p = this.canvasPoint(e);
    const inside = p.x >= 0 && p.y >= 0 && p.x <= this.canvas.clientWidth && p.y <= this.canvas.clientHeight;
    this.mouse = inside ? p : null;
    if (this.dragStart) {
      const moved = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
      if (moved > DRAG_THRESHOLD || this.dragBox) {
        this.dragBox = { x0: this.dragStart.x, y0: this.dragStart.y, x1: p.x, y1: p.y };
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 || !this.dragStart) return;
    const additive = e.shiftKey;
    if (this.dragBox) {
      this.boxSelect(this.dragBox, additive);
    } else {
      const hit = this.entityAt(this.dragStart.x, this.dragStart.y);
      if (!additive) this.selection.clear();
      if (hit) {
        if (additive && this.selection.has(hit.id)) this.selection.delete(hit.id);
        else this.selection.add(hit.id);
      }
    }
    this.dragStart = null;
    this.dragBox = null;
  }

  private boxSelect(box: { x0: number; y0: number; x1: number; y1: number }, additive: boolean): void {
    if (!this.latest) return;
    const minX = Math.min(box.x0, box.x1);
    const maxX = Math.max(box.x0, box.x1);
    const minY = Math.min(box.y0, box.y1);
    const maxY = Math.max(box.y0, box.y1);
    const inBox = this.latest.entities.filter((ent) => {
      if (ent.owner !== this.session.localPlayer || !this.isUnit(ent)) return false;
      const s = this.camera.toScreen(ent.x, ent.y);
      return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
    });
    if (!additive) this.selection.clear();
    for (const ent of inBox) this.selection.add(ent.id);
  }

  private onRightClick(sx: number, sy: number): void {
    const w = this.camera.toWorld(sx, sy);
    const units = this.selectedUnits();
    if (units.length) {
      const hit = this.entityAt(sx, sy);
      if (hit && hit.owner !== this.session.localPlayer) {
        this.issue({ type: "attack", units, target: hit.id }, "attack", { x: hit.x, y: hit.y });
      } else {
        this.issue({ type: "move", units, ...w }, "move", w);
      }
      return;
    }
    const producers = this.selectedProducers();
    if (producers.length) {
      for (const b of producers) this.issue({ type: "set_rally", building: b.id, ...w }, "rally", w);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (key === "tab") e.preventDefault();
    if (this.keysDown.has(key)) return;
    this.keysDown.add(key);
    switch (key) {
      case "a":
        this.armAttackMove();
        break;
      case "s":
        this.stop();
        break;
      case "q":
        this.train();
        break;
      case "escape":
        if (this.attackMoveArmed) this.attackMoveArmed = false;
        else this.selection.clear();
        break;
      case "tab":
        if (this.session.switchPlayer) {
          this.session.switchPlayer();
          this.selection.clear();
        }
        break;
    }
    this.updateKeyPan();
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.key.toLowerCase());
    this.updateKeyPan();
  }

  private updateKeyPan(): void {
    const k = this.keysDown;
    this.keyPan = {
      x: (k.has("arrowright") ? 1 : 0) - (k.has("arrowleft") ? 1 : 0),
      y: (k.has("arrowdown") ? 1 : 0) - (k.has("arrowup") ? 1 : 0),
    };
  }
}
