import type { CompiledGame } from "../../../shared/data";
import type { ViewEntity, ViewState } from "../../../shared/view";
import type { Camera } from "./camera";
import { COLORS, teamColor } from "./colors";

export interface RenderOptions {
  localPlayer: number;
  selection: ReadonlySet<number>;
  /** Selection box in screen pixels while dragging. */
  dragBox: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** Draws the map and every entity as simple shapes (GDD: art beyond shapes is out of scope). */
export function renderWorld(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  camera: Camera,
  game: CompiledGame,
  opts: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#0b0f0a";
  ctx.fillRect(0, 0, width, height);

  drawGround(ctx, camera, game);

  // Buildings first so units draw on top of them.
  const sorted = [...view.entities].sort(
    (a, b) => kindOrder(game, a) - kindOrder(game, b) || a.id - b.id,
  );

  for (const e of sorted) {
    if (opts.selection.has(e.id) && e.rally && e.owner === opts.localPlayer) {
      drawRally(ctx, camera, e);
    }
  }
  for (const e of sorted) drawEntity(ctx, camera, game, e, opts);

  if (opts.dragBox) {
    const { x0, y0, x1, y1 } = opts.dragBox;
    ctx.fillStyle = COLORS.boxFill;
    ctx.strokeStyle = COLORS.boxLine;
    ctx.lineWidth = 1;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
}

function kindOrder(game: CompiledGame, e: ViewEntity): number {
  return game.defs[e.type]?.kind === "building" ? 0 : 1;
}

function drawGround(ctx: CanvasRenderingContext2D, camera: Camera, game: CompiledGame): void {
  const a = camera.toScreen(0, 0);
  const b = camera.toScreen(game.map.width, game.map.height);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(left, top, w, h);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= game.map.width; gx += 100) {
    const s = camera.toScreen(gx, 0);
    ctx.moveTo(Math.round(s.x) + 0.5, top);
    ctx.lineTo(Math.round(s.x) + 0.5, top + h);
  }
  for (let gy = 0; gy <= game.map.height; gy += 100) {
    const s = camera.toScreen(0, gy);
    ctx.moveTo(left, Math.round(s.y) + 0.5);
    ctx.lineTo(left + w, Math.round(s.y) + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
}

function drawRally(ctx: CanvasRenderingContext2D, camera: Camera, e: ViewEntity): void {
  const from = camera.toScreen(e.x, e.y);
  const to = camera.toScreen(e.rally!.x, e.rally!.y);
  ctx.save();
  ctx.strokeStyle = COLORS.rally;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Flag
  ctx.fillStyle = COLORS.rally;
  ctx.fillRect(to.x - 1, to.y - 16, 2, 16);
  ctx.beginPath();
  ctx.moveTo(to.x + 1, to.y - 16);
  ctx.lineTo(to.x + 11, to.y - 12);
  ctx.lineTo(to.x + 1, to.y - 8);
  ctx.fill();
  ctx.restore();
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  game: CompiledGame,
  e: ViewEntity,
  opts: RenderOptions,
): void {
  const def = game.defs[e.type];
  if (!def) return;
  const p = camera.toScreen(e.x, e.y);
  const r = def.radius * camera.scale;
  const color = teamColor(e.owner, opts.localPlayer);
  const selected = opts.selection.has(e.id);

  if (selected) {
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + (def.kind === "unit" ? r * 0.3 : 0), r + 4, (r + 4) * (def.kind === "unit" ? 0.7 : 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (def.kind === "building") {
    const size = r * 1.6;
    ctx.fillStyle = color.dark;
    ctx.strokeStyle = color.fill;
    ctx.lineWidth = 3;
    roundRect(ctx, p.x - size / 2, p.y - size / 2, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `600 ${Math.max(11, 14 * camera.scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.name, p.x, p.y);
    if (e.queue.length > 0) {
      const w = size * 0.8;
      ctx.fillStyle = COLORS.hpBack;
      ctx.fillRect(p.x - w / 2, p.y + size / 2 - 12, w, 5);
      ctx.fillStyle = COLORS.rally;
      ctx.fillRect(p.x - w / 2, p.y + size / 2 - 12, w * e.progress, 5);
    }
  } else {
    ctx.fillStyle = color.fill;
    ctx.strokeStyle = color.dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (e.hp < def.hp) {
    const w = Math.max(20, r * 2);
    const y = p.y - (def.kind === "building" ? r * 0.8 + 10 : r + 8);
    const frac = Math.max(0, e.hp / def.hp);
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(p.x - w / 2, y, w, 4);
    ctx.fillStyle = frac > 0.6 ? COLORS.hpGood : frac > 0.3 ? COLORS.hpMid : COLORS.hpLow;
    ctx.fillRect(p.x - w / 2, y, w * frac, 4);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
