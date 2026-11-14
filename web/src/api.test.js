import { expect, test } from "vitest";
import { buildPath } from "./api.js";

test("buildPath encodes every value and skips null/undefined", () => {
  expect(buildPath("/path", { from: "Acetic Acid", to: "A&B=C", algorithm: undefined })).toBe(
    "/path?from=Acetic+Acid&to=A%26B%3DC"
  );
  expect(buildPath("/catalog/search", { q: "", after: null })).toBe("/catalog/search?q=");
  expect(buildPath("/stats", null)).toBe("/stats");
});
