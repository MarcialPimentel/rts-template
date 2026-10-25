import { endIfDecided } from "../match";
import type { System } from "../step";

/** A player with no headquarters left is defeated; the match ends when one player remains. */
export const winCheck: System = (world, game) => {
  const hasHeadquarters = new Set<number>();
  for (const e of Object.values(world.entities)) {
    if (game.defs[e.type]!.isHeadquarters) hasHeadquarters.add(e.owner);
  }
  for (const p of world.players) {
    if (!p.defeated && !hasHeadquarters.has(p.id)) p.defeated = true;
  }
  endIfDecided(world, "headquarters_destroyed");
};
