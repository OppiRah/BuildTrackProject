import { describe, expect, it } from 'vitest';
import {
  breakdown,
  compare,
  decimal,
  defaultEstimateInput,
  estimate,
  estimateFields,
  exactText,
  MAX_DECIMALS,
  mul,
  parseEstimate,
  showDuration,
  showQuantity,
  sketch,
  SKETCH_VIEWBOX,
  type EstimateInput,
} from '../src/lib/concrete-estimate.ts';

const input = (overrides: Partial<EstimateInput> = {}): EstimateInput => ({ ...defaultEstimateInput, ...overrides });
/** Batch output B = 0.2 m³ and a volume set directly through the length (W = D = 1, no waste). */
const withVolume = (volume: string, batchOutput = '0.2'): EstimateInput => input({ length: volume, width: '1', depth: '1', wastePercent: '0', batchOutput, cycleMinutes: '6' });

describe('estimate (exact arithmetic)', () => {
  it('reproduces the documented worked example (6 × 4 × 0.1 m, 5% waste, 0.2 m³, 6 min)', () => {
    const r = estimate(defaultEstimateInput);
    expect([exactText(r.volume), exactText(r.adjustedVolume), r.batches, exactText(r.lastBatchVolume), exactText(r.minutes)]).toEqual(['2.4', '2.52', 13n, '0.12', '78']);
    expect([showQuantity(r.volume, 'm³').text, showQuantity(r.adjustedVolume, 'm³').text, showDuration(r.minutes).text]).toEqual(['2.400 m³', '2.520 m³', '1 h 18 min']);
  });

  it('counts batches correctly just below, exactly at and just above a multiple of the batch output', () => {
    const cases: [string, bigint, string][] = [
      ['0.199999', 1n, '0.199999'],
      ['0.2', 1n, '0.2'],
      ['0.200001', 2n, '0.000001'],
      ['0.399999', 2n, '0.199999'],
      ['0.4', 2n, '0.2'],
      ['0.400001', 3n, '0.000001'],
      ['2.6', 13n, '0.2'],
      ['2.600001', 14n, '0.000001'],
    ];
    for (const [volume, batches, last] of cases) {
      const r = estimate(withVolume(volume));
      expect([volume, r.batches, exactText(r.lastBatchVolume)]).toEqual([volume, batches, last]);
    }
  });

  it('enforces the form precision and bounds while retaining finer derived precision', () => {
    expect(() => estimate(withVolume('0.20000000001'))).toThrow('Invalid estimate inputs: length');
    expect(() => estimate(input({ batchOutput: '0' }))).toThrow('Invalid estimate inputs: batchOutput');
    expect(() => estimate(input({ length: '101' }))).toThrow('Invalid estimate inputs: length');
    const above = estimate(input({ length: '1', width: '1', depth: '0.2', wastePercent: '0.000001', batchOutput: '0.2' }));
    expect([exactText(above.adjustedVolume), above.batches, exactText(above.lastBatchVolume)]).toEqual(['0.200000002', 2n, '0.000000002']);
    const below = estimate(input({ length: '1.000001', width: '0.999999', depth: '0.2', wastePercent: '0', batchOutput: '0.2' }));
    expect([exactText(below.volume), below.batches]).toEqual(['0.1999999999998', 1n]);
  });

  it('keeps the valid 1 × 3 × 0.1 example exact: three batches of 0.1 m³ (no floating-point fourth batch)', () => {
    const r = estimate(input({ length: '1', width: '3', depth: '0.1', wastePercent: '0', batchOutput: '0.1', cycleMinutes: '5' }));
    expect([exactText(r.volume), r.batches, exactText(r.lastBatchVolume), exactText(r.minutes)]).toEqual(['0.3', 3n, '0.1', '15']);
  });

  it('never gives a final batch above the rated output, or a zero or negative one', () => {
    const outputs = ['0.05', '0.1', '0.2', '0.35', '0.75', '1', '2.5', '3'];
    const lengths = ['0.1', '0.3', '1', '1.1', '2.000001', '6', '12.5', '33.333333', '100'];
    for (const batchOutput of outputs)
      for (const length of lengths)
        for (const wastePercent of ['0', '5', '7.5', '20']) {
          const r = estimate(input({ length, width: '3', depth: '0.1', wastePercent, batchOutput }));
          const b = decimal(batchOutput)!;
          expect(compare(r.lastBatchVolume, b)).toBeLessThanOrEqual(0);
          expect(r.lastBatchVolume.units > 0n).toBe(true);
          // N × B covers the volume and (N − 1) × B does not.
          expect(compare(mul({ units: r.batches, scale: 0 }, b), r.adjustedVolume)).toBeGreaterThanOrEqual(0);
          expect(compare(mul({ units: r.batches - 1n, scale: 0 }, b), r.adjustedVolume)).toBeLessThan(0);
        }
  });

  it('applies the waste allowance exactly', () => {
    expect(exactText(estimate(input({ wastePercent: '0' })).adjustedVolume)).toBe('2.4');
    expect(exactText(estimate(input({ wastePercent: '20' })).adjustedVolume)).toBe('2.88');
    expect(exactText(estimate(input({ wastePercent: '0.000001' })).adjustedVolume)).toBe('2.400000024');
  });

  it('handles the smallest and largest allowed inputs', () => {
    const small = estimate(input({ length: '0.1', width: '0.1', depth: '0.05', wastePercent: '0', batchOutput: '3', cycleMinutes: '1' }));
    expect([exactText(small.volume), small.batches, exactText(small.lastBatchVolume)]).toEqual(['0.0005', 1n, '0.0005']);
    const large = estimate(input({ length: '100', width: '100', depth: '3', wastePercent: '20', batchOutput: '0.05', cycleMinutes: '60' }));
    expect([exactText(large.adjustedVolume), large.batches, exactText(large.minutes)]).toEqual(['36000', 720000n, '43200000']);
  });
});

describe('display', () => {
  it('marks rounded values and never shows a positive quantity as zero', () => {
    expect(showQuantity(decimal('2.52')!, 'm³')).toEqual({ text: '2.520 m³', exact: true });
    expect(showQuantity(decimal('5.6255')!, 'm³')).toEqual({ text: '≈ 5.626 m³', exact: false });
    expect(showQuantity(decimal('0.00000000001')!, 'm³')).toEqual({ text: '< 0.001 m³', exact: false });
    expect(showQuantity(decimal('0.0005')!, 'm³')).toEqual({ text: '≈ 0.001 m³', exact: false });
    expect(showQuantity(decimal('0')!, 'm³')).toEqual({ text: '0.000 m³', exact: true });
  });

  it('marks a duration rounded from a fraction of a minute', () => {
    expect(showDuration(decimal('78')!)).toEqual({ text: '1 h 18 min', exact: true });
    expect(showDuration(decimal('60')!)).toEqual({ text: '1 h', exact: true });
    expect(showDuration(decimal('45')!)).toEqual({ text: '45 min', exact: true });
    expect(showDuration(decimal('61.5')!)).toEqual({ text: '≈ 1 h 2 min', exact: false });
    expect(showDuration(decimal('0.25')!)).toEqual({ text: '≈ 0 min', exact: false });
  });

  it('explains with operands as entered and exact results', () => {
    const i = input({ length: '12.345678', width: '0.6', depth: '0.75', wastePercent: '0', batchOutput: '0.35', cycleMinutes: '4.5' });
    const lines = breakdown(i, estimate(i));
    expect(lines[0]).toBe('Volume = L × W × D = 12.345678 × 0.6 × 0.75 = 5.5555551 m³');
    expect(lines[2]).toBe('Batches = 5.5555551 ÷ 0.35, rounded up = 16; the last batch is 0.3055551 m³');
    expect(lines[3]).toBe('Time = 16 batches × 4.5 min = 72 min');
    const tiny = withVolume('0.200001');
    expect(breakdown(tiny, estimate(tiny))[2]).toBe('Batches = 0.200001 ÷ 0.2, rounded up = 2; the last batch is 0.000001 m³');
  });
});

describe('parseEstimate', () => {
  const raw = (overrides: Partial<EstimateInput> = {}): EstimateInput => ({ length: '6', width: '4', depth: '0.10', wastePercent: '5', batchOutput: '0.20', cycleMinutes: '6', ...overrides });

  it('accepts valid decimals as entered and reads an empty waste allowance as none', () => {
    const { input: parsed, errors } = parseEstimate(raw({ wastePercent: '  ' }));
    expect(errors).toEqual({});
    expect(parsed).toEqual({ length: '6', width: '4', depth: '0.10', wastePercent: '0', batchOutput: '0.20', cycleMinutes: '6' });
  });

  it(`accepts up to ${MAX_DECIMALS} decimal places (trailing zeros do not count) and rejects more`, () => {
    expect(parseEstimate(raw({ length: '6.123456' })).errors).toEqual({});
    expect(parseEstimate(raw({ length: '6.1234560000' })).errors).toEqual({});
    expect(parseEstimate(raw({ length: '6.1234567' })).errors.length).toBe(`Use at most ${MAX_DECIMALS} decimal places.`);
    expect(parseEstimate(raw({ batchOutput: '0.20000000001' })).errors.batchOutput).toBe(`Use at most ${MAX_DECIMALS} decimal places.`);
  });

  it('accepts every field exactly at its bounds and rejects just outside them', () => {
    for (const field of estimateFields) {
      expect(parseEstimate(raw({ [field.key]: field.min })).errors[field.key]).toBeUndefined();
      expect(parseEstimate(raw({ [field.key]: field.max })).errors[field.key]).toBeUndefined();
      expect(parseEstimate(raw({ [field.key]: `${field.max}.000001` })).errors[field.key]).toBe(`Enter a value from ${field.min} to ${field.max} ${field.unit}.`);
      if (field.min !== '0') {
        const min = decimal(field.min)!;
        const below = exactText({ units: min.units * 10n ** BigInt(6 - min.scale) - 1n, scale: 6 });
        expect(parseEstimate(raw({ [field.key]: below })).errors[field.key]).toMatch(/^Enter a value from/);
      }
    }
  });

  it('requires every field except the waste allowance', () => {
    const { input: parsed, errors } = parseEstimate(raw({ length: '', batchOutput: ' ' }));
    expect(parsed).toBeNull();
    expect(errors).toEqual({ length: 'Enter the length in m.', batchOutput: 'Enter the mixer output per batch in m³.' });
  });

  it.each(['-1', '1e2', '0x10', '6,5', 'six', '1.2.3', 'Infinity', 'NaN', '+3'])('rejects %s as not a plain decimal', (value) => {
    expect(parseEstimate(raw({ length: value })).errors.length).toBe('Enter a number, such as 6.');
  });
});

describe('sketch', () => {
  const numbers = (points: string) => points.split(/[ ,]/).map(Number);
  it.each([[6, 4, 0.1], [100, 0.1, 3], [0.1, 100, 0.05], [100, 100, 3], [0.1, 0.1, 3]])('stays inside the 400 × 220 viewBox, with room for its labels, for %s × %s × %s m', (l, w, d) => {
    const s = sketch(l, w, d);
    for (const v of [...numbers(s.front), ...numbers(s.top), ...numbers(s.side)]) expect(v).toBeGreaterThanOrEqual(0);
    for (const [x, y] of [s.front, s.top, s.side].flatMap((poly) => poly.split(' ').map((pt) => pt.split(',').map(Number) as [number, number]))) {
      expect(x).toBeLessThanOrEqual(SKETCH_VIEWBOX.width - 70);
      expect(y).toBeGreaterThanOrEqual(8);
      expect(y).toBeLessThanOrEqual(SKETCH_VIEWBOX.height - 20);
    }
    expect(s.labels.depth[0]).toBeGreaterThanOrEqual(80);
    expect(s.labels.length[1]).toBeLessThanOrEqual(SKETCH_VIEWBOX.height - 4);
  });
  it('reports when depth is drawn at a readable height rather than to scale', () => {
    expect(sketch(6, 4, 0.1).depthToScale).toBe(false);
    expect(sketch(2, 1, 0.5).depthToScale).toBe(true);
  });
});
