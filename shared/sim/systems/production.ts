import { formationOffset } from "../geometry";
import type { System } from "../step";
import { spawnEntity } from "../world";

/**
 * Advances production queues. A finished unit appears at the building's edge facing its rally
 * point and walks there.
 */
export const production: System = (world, game) => {
  for (const building of Object.values(world.entities)) {
    const next = building.queue[0];
    if (next === undefined) continue;
    const unitDef = game.defs[next]!;
    building.progress++;
    if (building.progress < unitDef.buildTicks) continue;

    building.queue.shift();
    building.progress = 0;

    const rally = building.rally ?? { x: building.x, y: building.y + 1 };
    const angle = Math.atan2(rally.y - building.y, rally.x - building.x);
    const spawnDistance = game.defs[building.type]!.radius + unitDef.radius + 2;
    const unit = spawnEntity(
      world,
      building.owner,
      next,
      building.x + Math.cos(angle) * spawnDistance,
      building.y + Math.sin(angle) * spawnDistance,
      game,
    );
    if (building.rally && unitDef.speedPerTick > 0) {
      const { dx, dy } = formationOffset(unit.id % 19, unitDef.radius * 2.6);
      unit.order = { kind: "move", x: building.rally.x + dx, y: building.rally.y + dy };
    }
  }
};
