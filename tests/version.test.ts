import { describe, expect, it } from "vitest";
import { buildsMatch } from "../client/src/net/version";

describe("buildsMatch", () => {
  it("matches equal builds and dev builds, and rejects different builds", () => {
    expect(buildsMatch("abc1234", "abc1234")).toBe(true);
    expect(buildsMatch("dev", "abc1234")).toBe(true);
    expect(buildsMatch("abc1234", "dev")).toBe(true);
    expect(buildsMatch("abc1234", "def5678")).toBe(false);
  });
});
