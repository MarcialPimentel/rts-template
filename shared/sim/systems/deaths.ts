import type { System } from "../step";

/** Removes entities at 0 HP and clears every reference to them. */
export const deaths: System = (world) => {
  const dead = new Set<number>();
  for (const e of Object.values(world.entities)) {
    if (e.hp <= 0) dead.add(e.id);
  }
  if (dead.size === 0) return;
  for (const id of dead) delete world.entities[id];
  for (const e of Object.values(world.entities)) {
    if (e.target !== null && dead.has(e.target)) e.target = null;
    if (e.order.kind === "attack" && dead.has(e.order.target)) e.order = { kind: "idle" };
  }
};
