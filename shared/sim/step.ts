import { GAME, type CompiledGame } from "../data";
import { applyCommand, type PlayerCommand } from "./commands";
import { SYSTEMS } from "./systems";
import type { World } from "./world";

/** A system advances one aspect of the world by one tick. */
export type System = (world: World, game: CompiledGame) => void;

/**
 * Advances the world by exactly one 50 ms tick:
 * 1. apply queued commands in arrival order (invalid ones are dropped),
 * 2. run every system in the GDD's tick order.
 * Does nothing once the match has ended.
 */
export function step(world: World, commands: PlayerCommand[] = [], game: CompiledGame = GAME): void {
  if (world.status === "ended") return;
  for (const { player, command } of commands) applyCommand(world, player, command, game);
  for (const system of SYSTEMS) system(world, game);
  world.tick++;
}
