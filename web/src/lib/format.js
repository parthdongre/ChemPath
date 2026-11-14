/** C++ timings are often sub-millisecond; show them in µs so they fit and stay readable. */
export function engineTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return { value: "—" };
  if (value < 1)
    return { value: Math.max(1, Math.round(value * 1000)).toLocaleString(), unit: "µs" };
  return { value: value.toFixed(value < 10 ? 2 : 1), unit: "ms" };
}
