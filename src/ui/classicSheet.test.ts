import { describe, expect, it } from "vitest";
import { classicSheetState } from "./classicSheet";

describe("classic sheet history", () => {
  it("resumes the puzzle when Back leaves Pause", () => {
    expect(classicSheetState(undefined)).toEqual({ paused: false, settings: false });
  });

  it("keeps Pause open when Back closes Settings", () => {
    expect(classicSheetState("pause")).toEqual({ paused: true, settings: false });
  });

  it("keeps both Pause and Settings while the settings entry is current", () => {
    expect(classicSheetState("settings")).toEqual({ paused: true, settings: true });
  });
});
