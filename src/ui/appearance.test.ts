import { describe, expect, it } from "vitest";
import { appearance } from "./feel";

describe("appearance", () => {
  it("leaves the default type off the document flags", () => {
    expect(appearance("system", "default")).toEqual({ font: "", text: "" });
  });

  it("maps the curated font and the large text step", () => {
    expect(appearance("modern", "large")).toEqual({ font: "modern", text: "large" });
    expect(appearance("readable", "default")).toEqual({ font: "readable", text: "" });
  });
});
