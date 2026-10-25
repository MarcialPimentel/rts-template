import { edgeDistance } from "../geometry";
import type { System } from "../step";
import type { Entity } from "../world";

/** How far past sight range an engaged unit keeps chasing before giving up. */
const LEASH = 1.5;

/**
 * Chooses what each fighting unit is attacking:
 * - "attack" order: its ordered target, or idle once that target is gone.
 * - "move" order: nothing (moving units ignore enemies).
 * - idle or "attack_move": keep the current target while it's within the leash,
 *   otherwise the nearest enemy in sight, preferring enemies that can fight back.
 */
export const targeting: System = (world, game) => {
  const all = Object.values(world.entities);
  for (const e of all) {
    const def = game.defs[e.type]!;
    if (!def.attack) continue;

    if (e.order.kind === "attack") {
      if (world.entities[e.order.target]) {
        e.target = e.order.target;
      } else {
        e.order = { kind: "idle" };
        e.target = null;
      }
      continue;
    }
    if (e.order.kind === "move") {
      e.target = null;
      continue;
    }

    const current = e.target !== null ? world.entities[e.target] : undefined;
    if (current && edgeDistance(e, current, game) <= def.sight * LEASH) continue;

    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const other of all) {
      if (other.owner === e.owner) continue;
      const d = edgeDistance(e, other, game);
      if (d > def.sight) continue;
      // Threats first: anything that can't attack counts as farther away.
      const score = d + (game.defs[other.type]!.attack ? 0 : def.sight);
      if (score < bestScore) {
        best = other;
        bestScore = score;
      }
    }
    e.target = best ? best.id : null;
  }
};
