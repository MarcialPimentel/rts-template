/**
 * GAME LAYER — PoC ruleset. Replace this file for a new game.
 * Values match the GDD's "Game layer: PoC ruleset" section and are starting points for playtesting.
 */
import type { GameData } from "./types";

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1000;

/** Mirrors a left-side x coordinate to the right side of the map. */
const mirror = (x: number) => MAP_WIDTH - x;

export const POC_GAME: GameData = {
  defs: [
    {
      id: "town_hall",
      name: "Town Hall",
      kind: "building",
      radius: 60,
      hp: 2000,
      income: 5,
      isHeadquarters: true,
    },
    {
      id: "barracks",
      name: "Barracks",
      kind: "building",
      radius: 45,
      hp: 1000,
      produces: ["soldier"],
      queueMax: 5,
    },
    {
      id: "soldier",
      name: "Soldier",
      kind: "unit",
      radius: 10,
      hp: 100,
      cost: 50,
      buildTime: 5,
      speed: 90,
      attack: { damage: 10, interval: 1.0, range: 30 },
      sight: 250,
    },
  ],
  map: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    bases: [
      {
        entities: [
          { type: "town_hall", x: 200, y: 500 },
          { type: "barracks", x: 380, y: 330 },
        ],
        rally: { x: 480, y: 420 },
      },
      {
        entities: [
          { type: "town_hall", x: mirror(200), y: 500 },
          { type: "barracks", x: mirror(380), y: 330 },
        ],
        rally: { x: mirror(480), y: 420 },
      },
    ],
  },
  economy: {
    startingGold: 150,
    unitCap: 30,
  },
};
