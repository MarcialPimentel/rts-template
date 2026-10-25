import type { CompiledGame } from "../../../shared/data";

/** World units per second the camera pans with arrow keys or edge scrolling. */
const PAN_SPEED = 1100;
const EDGE = 18;
/** Never zoom out further than this, so units stay big enough to click. */
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.1;

/**
 * Maps world coordinates to the screen and pans over the map. When `flipped`, the map is
 * mirrored so the local player's base is on the left (GDD: the local player is always on the left).
 */
export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  flipped = false;
  private offsetX = 0;
  private offsetY = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  private top = 0;
  private bottom = 0;

  constructor(private readonly game: CompiledGame) {}

  resize(width: number, height: number, hudBottom: number, hudTop: number): void {
    const usable = height - hudBottom - hudTop;
    this.top = hudTop;
    this.bottom = height - hudBottom;
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, usable / (this.game.map.height + 40)));
    this.viewWidth = width / this.scale;
    this.viewHeight = usable / this.scale;
    const mapW = this.game.map.width * this.scale;
    const mapH = this.game.map.height * this.scale;
    this.offsetX = mapW < width ? (width - mapW) / 2 : 0;
    this.offsetY = hudTop + (mapH < usable ? (usable - mapH) / 2 : 0);
    this.clamp();
  }

  /** World x after the mirror, if any. */
  private viewX(wx: number): number {
    return this.flipped ? this.game.map.width - wx : wx;
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (this.viewX(wx) - this.x) * this.scale + this.offsetX,
      y: (wy - this.y) * this.scale + this.offsetY,
    };
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    const vx = (sx - this.offsetX) / this.scale + this.x;
    return {
      x: this.flipped ? this.game.map.width - vx : vx,
      y: (sy - this.offsetY) / this.scale + this.y,
    };
  }

  /** Pans by keyboard direction and by the mouse resting at a screen edge. */
  update(
    dt: number,
    keys: { x: number; y: number },
    mouse: { x: number; y: number } | null,
    screenWidth: number,
  ): void {
    let dx = keys.x;
    let dy = keys.y;
    if (mouse) {
      if (mouse.x <= EDGE) dx = -1;
      else if (mouse.x >= screenWidth - EDGE) dx = 1;
      // Vertical edges are thin bands just inside the HUD bars (or the very top of the window),
      // so using the HUD buttons doesn't scroll the map.
      if (mouse.y <= EDGE || (mouse.y >= this.top && mouse.y <= this.top + EDGE)) dy = -1;
      else if (mouse.y >= this.bottom - EDGE && mouse.y <= this.bottom) dy = 1;
    }
    if (dx !== 0 || dy !== 0) {
      this.x += dx * PAN_SPEED * dt;
      this.y += dy * PAN_SPEED * dt;
      this.clamp();
    }
  }

  /** Centres the view on a world position. */
  lookAt(wx: number, wy: number): void {
    this.x = this.viewX(wx) - this.viewWidth / 2;
    this.y = wy - this.viewHeight / 2;
    this.clamp();
  }

  private clamp(): void {
    this.x = Math.min(Math.max(this.x, 0), Math.max(0, this.game.map.width - this.viewWidth));
    this.y = Math.min(Math.max(this.y, 0), Math.max(0, this.game.map.height - this.viewHeight));
  }
}
