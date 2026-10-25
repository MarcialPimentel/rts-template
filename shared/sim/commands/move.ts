import { clampToMap, ownedMovableUnits } from "./helpers";
import type { CommandHandler } from "./types";

/** Walk to a point, ignoring enemies on the way. */
export const move: CommandHandler<"move"> = {
  validate(world, player, cmd, game) {
    const units = ownedMovableUnits(world, player, cmd.units, game);
    if (units.length === 0) return null;
    return { type: "move", units, ...clampToMap(cmd.x, cmd.y, game) };
  },
  apply(world, _player, cmd) {
    for (const id of cmd.units) {
      const e = world.entities[id]!;
      e.order = { kind: "move", x: cmd.x, y: cmd.y };
      e.target = null;
    }
  },
};
