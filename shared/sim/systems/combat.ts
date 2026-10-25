import { edgeDistance } from "../geometry";
import type { System } from "../step";

/** Units in range of their target with a ready cooldown deal one hit. */
export const combat: System = (world, game) => {
  for (const e of Object.values(world.entities)) {
    const attack = game.defs[e.type]!.attack;
    if (!attack) continue;
    if (e.cooldown > 0) e.cooldown--;
    if (e.cooldown > 0 || e.target === null) continue;
    const target = world.entities[e.target];
    if (!target || target.owner === e.owner) continue;
    if (edgeDistance(e, target, game) > attack.range) continue;
    target.hp -= attack.damage;
    e.cooldown = attack.intervalTicks;
  }
};
