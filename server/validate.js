// Shared request validation. Every value forwarded to the C++ engine passes
// through one of these helpers so routes enforce the same type and size rules.

export function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const CONTROL = /[\x00-\x1f]/;

// A single query-string value. Repeated keys (?from=a&from=b) arrive as
// arrays from Express and are rejected rather than joined into "a,b".
export function text(value, name, { max = 180, optional = false, fallback } = {}) {
  if (value === undefined || value === "") {
    if (optional) return fallback;
    throw badRequest(`'${name}' is required.`);
  }
  if (typeof value !== "string") throw badRequest(`'${name}' must be a single value.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || CONTROL.test(trimmed)) {
    throw badRequest(`'${name}' must be 1-${max} printable characters.`);
  }
  return trimmed;
}

export function integer(value, name, { min, max, optional = false, fallback } = {}) {
  if (value === undefined || value === "") {
    if (optional) return fallback;
    throw badRequest(`'${name}' is required.`);
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw badRequest(`'${name}' must be an integer from ${min} to ${max}.`);
  }
  return n;
}

// Integer clamped into range; invalid input uses the fallback. Used where the
// API historically tolerated loose values (e.g. ?iterations=abc).
export function clamped(value, fallback, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n === 0) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function oneOf(value, name, allowed, fallback) {
  const v = value === undefined ? fallback : typeof value === "string" ? value.toLowerCase() : null;
  if (!allowed.includes(v)) throw badRequest(`'${name}' must be one of: ${allowed.join(", ")}.`);
  return v;
}
