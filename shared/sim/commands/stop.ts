import { ownedMovableUnits } from "./helpers";
import type { CommandHandler } from "./types";

/** Stop and stand idle (idle units still defend themselves). */
export const stop: CommandHandler<"stop"> = {
  validate(world, player, cmd, game) {
    const units = ownedMovableUnits(world, player, cmd.units, game);
    if (units.length === 0) return null;
    return { type: "stop", units };
  },
  apply(world, _player, cmd) {
    for (const id of cmd.units) {
      const e = world.entities[id]!;
      e.order = { kind: "idle" };
      e.target = null;
    }
  },
};
