import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mwaIdentity } from "./mwa";

describe("wallet identity icon", () => {
  it("points at a real icon file and the page advertises that file", () => {
    expect(mwaIdentity).toEqual({ name: "Soldoku", icon: "brand/soldoku-logo.png" });
    const png = readFileSync(`public/${mwaIdentity.icon}`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(`rel="icon" href="/${mwaIdentity.icon}"`);
    expect(html).toContain('type="image/png"');
  });
});
