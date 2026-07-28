// Number handling for the Love Jar.
//
// The game stays inside IEEE doubles on purpose: a hard ceiling of 1e300
// keeps every calculation cheap and keeps saves small, and the progression is
// tuned so that ceiling is a genuine end-of-content wall rather than
// something a normal player trips over. Every arithmetic helper clamps, so a
// bad multiplier produces a big number instead of Infinity or NaN spreading
// through the save file.

export const NUMBER_CEILING = 1e300;

export type NumberFormat = "short" | "scientific" | "engineering" | "full";

const SUFFIXES = [
  "", "K", "M", "B", "T",
  "Qa", "Qi", "Sx", "Sp", "Oc", "No",
  "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc",
  "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg",
  "Tg", "UTg", "DTg", "TTg", "QaTg", "QiTg", "SxTg", "SpTg", "OcTg", "NoTg",
];

/** Clamp anything the game produces into a finite, non-negative range. */
export function safe(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return value > 0 ? NUMBER_CEILING : -NUMBER_CEILING;
  if (value > NUMBER_CEILING) return NUMBER_CEILING;
  if (value < -NUMBER_CEILING) return -NUMBER_CEILING;
  return value;
}

export function add(a: number, b: number): number {
  return safe(a + b);
}

export function mul(a: number, b: number): number {
  return safe(a * b);
}

/** a * (b ^ c), clamped. Used everywhere for exponential cost curves. */
export function scale(base: number, growth: number, level: number): number {
  if (level <= 0) return safe(base);
  const logValue = Math.log10(Math.max(1e-300, base)) + level * Math.log10(Math.max(1e-300, growth));
  if (logValue > 300) return NUMBER_CEILING;
  return safe(base * Math.pow(growth, level));
}

/**
 * How many more levels are affordable given a budget, for an exponential
 * cost curve. Solved directly rather than looped so "max affordable" on a
 * cheap upgrade with a huge balance stays instant.
 */
export function affordableLevels(
  balance: number,
  base: number,
  growth: number,
  owned: number,
  cap: number,
): number {
  if (balance <= 0) return 0;
  const remaining = cap === Infinity ? Infinity : Math.max(0, cap - owned);
  if (remaining === 0) return 0;
  if (growth <= 1) {
    const each = Math.max(1e-9, base);
    return Math.min(remaining, Math.floor(balance / each));
  }
  const first = scale(base, growth, owned);
  if (first > balance) return 0;
  // Sum of a geometric series: balance >= first * (g^n - 1) / (g - 1)
  const ratio = (balance * (growth - 1)) / first + 1;
  if (ratio <= 1) return 0;
  const n = Math.floor(Math.log(ratio) / Math.log(growth));
  return Math.max(0, Math.min(remaining, n));
}

/** Total cost of buying `count` levels starting from `owned`. */
export function bulkCost(base: number, growth: number, owned: number, count: number): number {
  if (count <= 0) return 0;
  if (growth === 1) return safe(base * count);
  const first = scale(base, growth, owned);
  return safe((first * (Math.pow(growth, count) - 1)) / (growth - 1));
}

function trim(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

/** Human readable amount, for example 1.2K, 4.5M, 8.7B. */
export function formatNumber(value: number, format: NumberFormat = "short"): string {
  const n = safe(value);
  if (!Number.isFinite(n)) return "a lot";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (abs < 1 && abs > 0) return sign + trim(abs, abs < 0.01 ? 3 : 2);
  if (abs < 1000) return sign + (Number.isInteger(abs) ? String(abs) : trim(abs, abs < 10 ? 2 : 1));

  if (format === "full") {
    return sign + Math.floor(abs).toLocaleString();
  }
  if (format === "scientific") {
    const exp = Math.floor(Math.log10(abs));
    return `${sign}${trim(abs / Math.pow(10, exp), 3)}e${exp}`;
  }
  if (format === "engineering") {
    const exp = Math.floor(Math.log10(abs) / 3) * 3;
    return `${sign}${trim(abs / Math.pow(10, exp), 3)}e${exp}`;
  }

  const tier = Math.floor(Math.log10(abs) / 3);
  if (tier >= SUFFIXES.length) {
    const exp = Math.floor(Math.log10(abs));
    return `${sign}${trim(abs / Math.pow(10, exp), 2)}e${exp}`;
  }
  const scaled = abs / Math.pow(10, tier * 3);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${sign}${trim(scaled, digits)}${SUFFIXES[tier]}`;
}

/** Percentages that stay readable at both 0.5% and 400%. */
export function formatPercent(fraction: number, digits = 0): string {
  const pct = fraction * 100;
  if (Math.abs(pct) < 1 && pct !== 0) return `${trim(pct, 2)}%`;
  return `${trim(pct, digits)}%`;
}

/** Multipliers written the way players read them: x2.5, x1.05. */
export function formatMultiplier(value: number): string {
  if (value >= 100) return `x${formatNumber(value)}`;
  return `x${trim(value, value < 10 ? 2 : 1)}`;
}

export function formatDurationShort(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Deterministic pseudo random from a string seed, so both phones agree. */
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}
