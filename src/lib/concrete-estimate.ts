// Concrete volume and batch-mixer estimate for one rectangular element (docs/PROPOSALS_ENGINEERING_PAYMENT.md §A).
// Pure. An academic estimator: a simple deterministic formula, not AI, not structural or mix
// design, and not yet reviewed by a civil engineer. One batch (drum) mixer only. Cement bags are
// deliberately not estimated: they depend on a mix design and its yield, not on volume alone.
//
//   V  = L × W × D                       net volume (m³)
//   V′ = V × (1 + w / 100)               volume to produce, with the user's waste allowance
//   N  = ⌈V′ / B⌉                        batches of the mixer's rated mixed output B
//   V_last = V′ − (N − 1) × B            the final batch: 0 < V_last ≤ B
//   T  = N × t                           idealized time: one mixer, back-to-back cycles
//
// Exact arithmetic: inputs are plain decimals (the form accepts at most MAX_DECIMALS places), held
// as an integer and a decimal scale, and every step above is computed exactly with integers. So a
// genuine remainder, however small, always adds a batch, an exact multiple never does, and no
// tolerance is needed. Rounding happens only for display, where it is marked.
//
// Assumption (pending CE review): every batch, including a final partial one, takes the same
// cycle time t. That is a simplification, not an established physical rule, and not shown to be
// conservative.

export type EstimateField = 'length' | 'width' | 'depth' | 'wastePercent' | 'batchOutput' | 'cycleMinutes';
/** Accepted inputs as entered (plain decimal text). */
export type EstimateInput = Record<EstimateField, string>;

/** Supported precision: six decimal places after insignificant trailing zeros are removed. */
export const MAX_DECIMALS = 6;

export interface EstimateFieldSpec {
  key: EstimateField;
  label: string;
  unit: string;
  min: string;
  max: string;
  /** Optional fields may be left empty (read as 0). */
  optional?: boolean;
  hint?: string;
}

export const estimateFields: EstimateFieldSpec[] = [
  { key: 'length', label: 'Length', unit: 'm', min: '0.1', max: '100' },
  { key: 'width', label: 'Width', unit: 'm', min: '0.1', max: '100' },
  { key: 'depth', label: 'Depth or thickness', unit: 'm', min: '0.05', max: '3' },
  { key: 'wastePercent', label: 'Waste allowance (your assumption)', unit: '%', min: '0', max: '20', optional: true, hint: 'Optional. Leave empty for none.' },
  {
    key: 'batchOutput',
    label: 'Mixer output per batch',
    unit: 'm³',
    min: '0.05',
    max: '3',
    hint: "The batch mixer's rated mixed-concrete output per batch, not its drum volume.",
  },
  { key: 'cycleMinutes', label: 'Cycle time per batch', unit: 'min', min: '1', max: '60', hint: 'Charging, mixing and discharging one batch.' },
];

/** Fictional default inputs (the worked example in the proposal). */
export const defaultEstimateInput: EstimateInput = { length: '6', width: '4', depth: '0.1', wastePercent: '5', batchOutput: '0.2', cycleMinutes: '6' };

// ---- Exact decimals ------------------------------------------------------------------------
/** value = units / 10^scale. */
export interface Decimal {
  units: bigint;
  scale: number;
}

const pow10 = (n: number): bigint => 10n ** BigInt(n);
/** Plain decimal numbers only (no signs, exponents or hexadecimal). */
const DECIMAL = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/;

/** Parses plain decimal text exactly, or returns null. */
export function decimal(text: string): Decimal | null {
  const m = DECIMAL.exec(text.trim());
  if (!m) return null;
  const whole = m[1] ?? '0';
  const fraction = m[2] ?? m[3] ?? '';
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

const align = (a: Decimal, b: Decimal): [bigint, bigint, number] => {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * pow10(scale - a.scale), b.units * pow10(scale - b.scale), scale];
};
export const mul = (a: Decimal, b: Decimal): Decimal => ({ units: a.units * b.units, scale: a.scale + b.scale });
export const add = (a: Decimal, b: Decimal): Decimal => {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
};
export const sub = (a: Decimal, b: Decimal): Decimal => {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
};
export const compare = (a: Decimal, b: Decimal): number => {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
};
const integer = (n: bigint): Decimal => ({ units: n, scale: 0 });

/** ⌈a / b⌉ for a ≥ 0 and b > 0, exactly. */
export function ceilDivide(a: Decimal, b: Decimal): bigint {
  const [x, y] = align(a, b);
  return (x + y - 1n) / y;
}

/** The exact value as plain decimal text, without trailing zeros. */
export function exactText(d: Decimal): string {
  const negative = d.units < 0n;
  const digits = (negative ? -d.units : d.units).toString().padStart(d.scale + 1, '0');
  const whole = digits.slice(0, digits.length - d.scale);
  const fraction = digits.slice(digits.length - d.scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Rounds half up to `places` decimals (display only). */
function roundTo(d: Decimal, places: number): Decimal {
  if (d.scale <= places) return { units: d.units * pow10(places - d.scale), scale: places };
  const divisor = pow10(d.scale - places);
  return { units: (d.units + divisor / 2n) / divisor, scale: places };
}

/** Significant decimal places once trailing zeros are dropped. */
const places = (d: Decimal): number => (exactText(d).split('.')[1] ?? '').length;

// ---- Parsing and calculation -----------------------------------------------------------------
export function parseEstimate(raw: EstimateInput): { input: EstimateInput | null; errors: Partial<Record<EstimateField, string>> } {
  const errors: Partial<Record<EstimateField, string>> = {};
  const values = {} as EstimateInput;
  for (const field of estimateFields) {
    const text = (raw[field.key] ?? '').trim();
    if (text === '') {
      if (field.optional) values[field.key] = '0';
      else errors[field.key] = `Enter the ${field.label.toLowerCase()} in ${field.unit}.`;
      continue;
    }
    const value = decimal(text);
    if (!value) {
      errors[field.key] = `Enter a number, such as ${defaultEstimateInput[field.key]}.`;
      continue;
    }
    if (places(value) > MAX_DECIMALS) {
      errors[field.key] = `Use at most ${MAX_DECIMALS} decimal places.`;
      continue;
    }
    if (compare(value, decimal(field.min)!) < 0 || compare(value, decimal(field.max)!) > 0) {
      errors[field.key] = `Enter a value from ${field.min} to ${field.max} ${field.unit}.`;
      continue;
    }
    values[field.key] = text;
  }
  return { input: Object.keys(errors).length ? null : values, errors };
}

export interface EstimateResult {
  volume: Decimal;
  adjustedVolume: Decimal;
  batches: bigint;
  lastBatchVolume: Decimal;
  minutes: Decimal;
}

/** Exact estimate under the same bounds and precision contract as the form. Derived quantities
 * can have more decimal places; they are never rounded before batch counting. */
export function estimate(input: EstimateInput): EstimateResult {
  const parsed = parseEstimate(input);
  if (!parsed.input) throw new Error(`Invalid estimate inputs: ${Object.keys(parsed.errors).join(', ')}`);
  const validated = parsed.input;
  const d = (key: EstimateField) => {
    const value = decimal(validated[key]);
    if (!value) throw new Error(`Not a plain decimal: ${key}`);
    return value;
  };
  const batchOutput = d('batchOutput');
  const volume = mul(mul(d('length'), d('width')), d('depth'));
  // V × (100 + w) ÷ 100: dividing by 100 is exact as two more decimal places.
  const scaled = mul(volume, add(integer(100n), d('wastePercent')));
  const adjustedVolume = { units: scaled.units, scale: scaled.scale + 2 };
  const batches = adjustedVolume.units === 0n ? 1n : ceilDivide(adjustedVolume, batchOutput);
  return {
    volume,
    adjustedVolume,
    batches,
    lastBatchVolume: sub(adjustedVolume, mul(integer(batches - 1n), batchOutput)),
    minutes: mul(integer(batches), d('cycleMinutes')),
  };
}

// ---- Display ---------------------------------------------------------------------------------
export interface Shown {
  /** The text to show, e.g. "2.520 m³", "≈ 5.626 m³" or "< 0.001 m³". */
  text: string;
  /** True when the shown value equals the exact value. */
  exact: boolean;
}

/** A quantity to `decimals` places, marked "≈" when rounded and "< 0.001" when a positive value
 * would otherwise round to zero. */
export function showQuantity(d: Decimal, unit: string, decimals = 3): Shown {
  const rounded = roundTo(d, decimals);
  if (rounded.units === 0n && d.units > 0n) return { text: `< ${exactText({ units: 1n, scale: decimals })} ${unit}`, exact: false };
  const exact = compare(rounded, d) === 0;
  const [whole, fraction = ''] = exactText(rounded).split('.');
  return { text: `${exact ? '' : '≈ '}${whole}.${fraction.padEnd(decimals, '0')} ${unit}`, exact };
}

/** Whole minutes as hours and minutes, marked "≈" when the exact time has a fraction of a minute. */
export function showDuration(minutes: Decimal): Shown {
  const whole = roundTo(minutes, 0).units;
  const exact = compare(integer(whole), minutes) === 0;
  const hours = whole / 60n;
  const rest = whole % 60n;
  const text = hours === 0n ? `${rest} min` : rest === 0n ? `${hours} h` : `${hours} h ${rest} min`;
  return { text: `${exact ? '' : '≈ '}${text}`, exact };
}

/** The four explanation lines: operands exactly as entered, results exact (never rounded). */
export function breakdown(input: EstimateInput, r: EstimateResult): string[] {
  const v = (key: EstimateField) => (input[key].trim() === '' ? '0' : input[key].trim());
  const e = exactText;
  return [
    `Volume = L × W × D = ${v('length')} × ${v('width')} × ${v('depth')} = ${e(r.volume)} m³`,
    `With waste = ${e(r.volume)} × (1 + ${v('wastePercent')} ÷ 100) = ${e(r.adjustedVolume)} m³`,
    `Batches = ${e(r.adjustedVolume)} ÷ ${v('batchOutput')}, rounded up = ${r.batches}; the last batch is ${e(r.lastBatchVolume)} m³`,
    `Time = ${r.batches} batches × ${v('cycleMinutes')} min = ${e(r.minutes)} min`,
  ];
}

/** A schematic oblique box for the dimension visual, centred in a 400 × 220 viewBox with room for
 * its labels. Length runs along the front, width recedes at an angle, depth is vertical; a very thin
 * or very deep element is drawn at a readable height and reported as not to scale. */
export interface Sketch {
  front: string;
  top: string;
  side: string;
  labels: { length: [number, number]; width: [number, number]; depth: [number, number] };
  depthToScale: boolean;
}

export const SKETCH_VIEWBOX = { width: 400, height: 220 };

export function sketch(length: number, width: number, depth: number): Sketch {
  const left = 90; // room for the depth label
  const scale = 220 / (length + 0.45 * width);
  const run = length * scale;
  const dx = 0.45 * width * scale * 0.87;
  const dy = 0.45 * width * scale * 0.5;
  const trueHeight = depth * scale;
  const height = Math.min(70, Math.max(12, trueHeight));
  // Centre the drawing (its height plus the length label below it) vertically.
  const base = (SKETCH_VIEWBOX.height + height + dy - 16) / 2;
  const top = base - height;
  const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return {
    front: [p(left, top), p(left + run, top), p(left + run, base), p(left, base)].join(' '),
    top: [p(left, top), p(left + dx, top - dy), p(left + run + dx, top - dy), p(left + run, top)].join(' '),
    side: [p(left + run, top), p(left + run + dx, top - dy), p(left + run + dx, base - dy), p(left + run, base)].join(' '),
    labels: {
      length: [Math.round(left + run / 2), Math.round(base + 18)],
      width: [Math.round(left + run + dx / 2 + 8), Math.round(base - dy / 2 + 4)],
      depth: [left - 8, Math.round(base - height / 2 + 4)],
    },
    depthToScale: Math.abs(height - trueHeight) < 0.5,
  };
}
