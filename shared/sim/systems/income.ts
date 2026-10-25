import type { System } from "../step";

/** Adds each income building's gold per tick to its owner. */
export const income: System = (world, game) => {
  for (const e of Object.values(world.entities)) {
    const rate = game.defs[e.type]!.incomePerTick;
    if (rate <= 0) continue;
    const owner = world.players[e.owner];
    if (owner && !owner.defeated) owner.gold += rate;
  }
};
