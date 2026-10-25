import { GAME, type CompiledGame } from "../data";
import { SYSTEMS } from "./systems";
import type { World } from "./world";

/** A system advances one aspect of the world by one tick. */
export type System = (world: World, game: CompiledGame) => void;

/**
 * Advances the world by exactly one 50 ms tick, running every system in the GDD's tick order.
 * Does nothing once the match has ended.
 */
export function step(world: World, game: CompiledGame = GAME): void {
  if (world.status === "ended") return;
  for (const system of SYSTEMS) system(world, game);
  world.tick++;
}
