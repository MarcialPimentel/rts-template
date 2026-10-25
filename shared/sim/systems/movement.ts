import type { CompiledGame } from "../../data";
import { distance, edgeDistance } from "../geometry";
import type { System } from "../step";
import type { Entity } from "../world";

/**
 * Moves units toward their target (until in attack range) or their ordered point, then pushes
 * overlapping units apart and out of buildings so nothing stacks. Straight-line movement on an
 * open map; pathfinding is an extension point behind this system.
 */
export const movement: System = (world, game) => {
  const all = Object.values(world.entities);

  for (const e of all) {
    const def = game.defs[e.type]!;
    if (def.speedPerTick <= 0) continue;

    let goalX: number;
    let goalY: number;
    const target = e.target !== null ? world.entities[e.target] : undefined;
    if (target) {
      if (def.attack && edgeDistance(e, target, game) <= def.attack.range) continue;
      goalX = target.x;
      goalY = target.y;
    } else if (e.order.kind === "move" || e.order.kind === "attack_move") {
      goalX = e.order.x;
      goalY = e.order.y;
      const d = distance(e.x, e.y, goalX, goalY);
      if (d <= def.speedPerTick) {
        e.x = goalX;
        e.y = goalY;
        e.order = { kind: "idle" };
        continue;
      }
      // Close, but another unit already stands on the spot: stop here instead of shoving forever.
      if (d <= def.radius * 2.5 && spotTaken(all, e.id, goalX, goalY, def.radius * 1.5, game)) {
        e.order = { kind: "idle" };
        continue;
      }
    } else {
      continue;
    }

    const d = distance(e.x, e.y, goalX, goalY);
    if (d === 0) continue;
    const stepLength = Math.min(def.speedPerTick, d);
    e.x += ((goalX - e.x) / d) * stepLength;
    e.y += ((goalY - e.y) / d) * stepLength;
  }

  separate(world, game);
};

function spotTaken(
  all: Entity[],
  selfId: number,
  x: number,
  y: number,
  within: number,
  game: CompiledGame,
): boolean {
  return all.some(
    (o) => o.id !== selfId && game.defs[o.type]!.kind === "unit" && distance(o.x, o.y, x, y) < within,
  );
}

function separate(world: Parameters<System>[0], game: Parameters<System>[1]): void {
  const units = Object.values(world.entities).filter((e) => game.defs[e.type]!.kind === "unit");
  const buildings = Object.values(world.entities).filter(
    (e) => game.defs[e.type]!.kind === "building",
  );

  for (let i = 0; i < units.length; i++) {
    const a = units[i]!;
    const ra = game.defs[a.type]!.radius;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]!;
      const rb = game.defs[b.type]!.radius;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const overlap = ra + rb - d;
      if (overlap <= 0) continue;
      if (d === 0) {
        // Exactly stacked: separate along a fixed direction derived from the ids.
        const angle = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1;
      }
      const push = overlap / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
    for (const bld of buildings) {
      const rb = game.defs[bld.type]!.radius;
      const dx = a.x - bld.x;
      const dy = a.y - bld.y;
      const d = Math.hypot(dx, dy);
      const overlap = ra + rb - d;
      if (overlap <= 0) continue;
      if (d === 0) {
        a.x += ra + rb;
        continue;
      }
      a.x += (dx / d) * overlap;
      a.y += (dy / d) * overlap;
    }
  }

  for (const u of units) {
    const r = game.defs[u.type]!.radius;
    u.x = Math.min(Math.max(u.x, r), game.map.width - r);
    u.y = Math.min(Math.max(u.y, r), game.map.height - r);
  }
}
