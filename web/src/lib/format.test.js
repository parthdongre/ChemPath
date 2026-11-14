import { expect, test } from "vitest";
import { engineTime } from "./format.js";

test("engineTime picks µs below 1 ms and ms above", () => {
  expect(engineTime(0.0042)).toEqual({ value: "4", unit: "µs" });
  expect(engineTime(0.0000001)).toEqual({ value: "1", unit: "µs" });
  expect(engineTime(3.14159)).toEqual({ value: "3.14", unit: "ms" });
  expect(engineTime(42.26)).toEqual({ value: "42.3", unit: "ms" });
  expect(engineTime("n/a")).toEqual({ value: "—" });
});
