import { describe, expect, it } from "bun:test";
import { getVersion, getVersionString } from "../version";

describe("version utilities", () => {
  it("returns a version string when build-time injection is unavailable", () => {
    expect(getVersionString()).toMatch(/^oc-mon v/);
  });

  it("returns a bare version when build-time injection is unavailable", () => {
    expect(getVersion()).not.toStartWith("oc-mon v");
  });
});
