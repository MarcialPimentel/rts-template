import type { CompiledGame } from "../../data";
import { formationOffset } from "../geometry";
import type { Entity, World } from "../world";
import { MAX_UNITS_PER_COMMAND } from "./types";

/** Keeps only ids of living, movable units owned by `player`, without duplicates. */
export function ownedMovableUnits(
  world: World,
  player: number,
  ids: number[],
  game: CompiledGame,
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of ids.slice(0, MAX_UNITS_PER_COMMAND)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = world.entities[id];
    if (!e || e.owner !== player) continue;
    const def = game.defs[e.type];
    if (!def || def.kind !== "unit" || def.speedPerTick <= 0) continue;
    result.push(id);
  }
  return result;
}

/** Returns the building if it exists and belongs to `player`. */
export function ownedProducer(
  world: World,
  player: number,
  id: number,
  game: CompiledGame,
): Entity | null {
  const e = world.entities[id];
  if (!e || e.owner !== player) return null;
  const def = game.defs[e.type];
  if (!def || def.produces.length === 0) return null;
  return e;
}

/**
 * Spreads a group's destination into formation slots around the clicked point, so units
 * don't all fight over one spot. Returns one point per unit id, clamped to the map.
 */
export function groupDestinations(
  world: World,
  units: number[],
  x: number,
  y: number,
  game: CompiledGame,
): { x: number; y: number }[] {
  let spacing = 0;
  for (const id of units) {
    spacing = Math.max(spacing, game.defs[world.entities[id]!.type]!.radius * 2.6);
  }
  return units.map((_, slot) => {
    const { dx, dy } = formationOffset(slot, spacing);
    return clampToMap(x + dx, y + dy, game);
  });
}

export function clampToMap(x: number, y: number, game: CompiledGame): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), game.map.width),
    y: Math.min(Math.max(y, 0), game.map.height),
  };
}

/** Units alive plus units waiting in production queues, for the unit cap. */
export function unitCount(world: World, player: number, game: CompiledGame): number {
  let count = 0;
  for (const e of Object.values(world.entities)) {
    if (e.owner !== player) continue;
    if (game.defs[e.type]?.kind === "unit") count++;
    count += e.queue.length;
  }
  return count;
}
