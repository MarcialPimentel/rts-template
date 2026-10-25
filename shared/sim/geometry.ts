import type { CompiledGame } from "../data";
import type { Entity } from "./world";

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Gap between the edges of two entities' circles (negative when overlapping). */
export function edgeDistance(a: Entity, b: Entity, game: CompiledGame): number {
  return distance(a.x, a.y, b.x, b.y) - game.defs[a.type]!.radius - game.defs[b.type]!.radius;
}

/**
 * Offsets that spread a group around one destination so units don't fight over a single point.
 * Slot 0 is the centre, then rings outward. Deterministic for a given slot.
 */
export function formationOffset(slot: number, spacing: number): { dx: number; dy: number } {
  if (slot === 0) return { dx: 0, dy: 0 };
  let ring = 1;
  let first = 1;
  while (slot >= first + ring * 6) {
    first += ring * 6;
    ring++;
  }
  const indexInRing = slot - first;
  const angle = (indexInRing / (ring * 6)) * Math.PI * 2;
  return { dx: Math.cos(angle) * spacing * ring, dy: Math.sin(angle) * spacing * ring };
}
