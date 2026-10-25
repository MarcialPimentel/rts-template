import { ownedMovableUnits } from "./helpers";
import type { CommandHandler } from "./types";

/** Attack one specific enemy entity until it dies. */
export const attack: CommandHandler<"attack"> = {
  validate(world, player, cmd, game) {
    const target = world.entities[cmd.target];
    if (!target || target.owner === player) return null;
    const units = ownedMovableUnits(world, player, cmd.units, game).filter(
      (id) => game.defs[world.entities[id]!.type]!.attack !== null,
    );
    if (units.length === 0) return null;
    return { type: "attack", units, target: cmd.target };
  },
  apply(world, _player, cmd) {
    for (const id of cmd.units) {
      const e = world.entities[id]!;
      e.order = { kind: "attack", target: cmd.target };
      e.target = cmd.target;
    }
  },
};
