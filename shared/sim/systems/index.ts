import type { System } from "../step";
import { combat } from "./combat";
import { deaths } from "./deaths";
import { income } from "./income";
import { movement } from "./movement";
import { production } from "./production";
import { targeting } from "./targeting";
import { winCheck } from "./win_check";

/**
 * Systems in the GDD's tick order (commands are applied before these, in `step`).
 * Order affects outcomes, so change it only deliberately and record the change in the GDD.
 */
export const SYSTEMS: System[] = [income, production, targeting, movement, combat, deaths, winCheck];
