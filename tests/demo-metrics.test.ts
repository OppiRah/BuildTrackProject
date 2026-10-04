import { describe, expect, it } from 'vitest';
import { deliveries, equipment, materials, projects } from '../src/data/demo/fixtures.ts';
import type { Equipment, Material } from '../src/data/demo/types.ts';
import {
  deliveryCounts,
  deriveAlerts,
  equipmentUtilizationPct,
  fleetUtilizationPct,
  formatPts,
  isLowStock,
  materialUsagePct,
  overview,
  scheduleVariancePts,
} from '../src/lib/demo-metrics.ts';

const material = (over: Partial<Material>): Material => ({
  id: 'm', projectId: 'p-pasig', name: 'Test', category: 'cement', unit: 'bags (40 kg)',
  onHand: 100, reorderLevel: 50, plannedTotal: 1000, usedToDate: 250, ...over,
});
const unit = (used: number, available: number): Equipment => ({
  id: 'x', projectId: 'p-pasig', name: 'Test unit', tag: 'QR', status: 'active', hoursUsed7d: used, hoursAvailable7d: available,
});

describe('material metrics', () => {
  it('treats stock at or below the reorder level as low', () => {
    expect(isLowStock(material({ onHand: 50 }))).toBe(true);
    expect(isLowStock(material({ onHand: 51 }))).toBe(false);
  });

  it('computes usage as used ÷ planned', () => {
    expect(materialUsagePct(material({}))).toBe(25);
    expect(materialUsagePct(material({ plannedTotal: 0, usedToDate: 0 }))).toBe(0);
  });
});

describe('equipment utilization', () => {
  it('is 0 for a unit with no available hours', () => {
    expect(equipmentUtilizationPct(unit(0, 0))).toBe(0);
  });

  it('weights fleet utilization by hours instead of averaging percentages', () => {
    // 10/10 and 0/90: average of percentages would be 50%; weighted is 10%.
    expect(fleetUtilizationPct([unit(10, 10), unit(0, 90)])).toBe(10);
    expect(fleetUtilizationPct([unit(0, 0)])).toBeNull();
  });
});

describe('overview', () => {
  it('derives the all-projects figures from the fixtures', () => {
    const all = overview('all');
    expect(all.lowStockCount).toBe(4);
    expect(all.materialCount).toBe(materials.length);
    expect(all.utilizationPct).toBeCloseTo((382 / 720) * 100);
    expect(all.equipmentCount).toBe(equipment.length);
    expect(all.inTransit).toBe(2);
    expect(all.delayed).toBe(2);
  });

  it('never computes an aggregate schedule variance for all projects', () => {
    expect(overview('all').scheduleVariance).toBeNull();
  });

  it('reports schedule variance for a single project', () => {
    expect(overview('p-pasig').scheduleVariance).toBe(-4);
    expect(overview('p-iloilo').scheduleVariance).toBe(2);
    for (const p of projects) expect(overview(p.id).scheduleVariance).toBe(scheduleVariancePts(p));
  });

  it('adds up per-project counts to the all-projects total (yard equipment counted once)', () => {
    const perProject = projects.map((p) => overview(p.id));
    expect(perProject.reduce((s, o) => s + o.lowStockCount, 0)).toBe(overview('all').lowStockCount);
    expect(perProject.reduce((s, o) => s + o.delayed, 0)).toBe(overview('all').delayed);
    const yard = equipment.filter((e) => e.projectId === null).length;
    expect(perProject.reduce((s, o) => s + o.equipmentCount, 0) + yard).toBe(overview('all').equipmentCount);
  });

  it('matches delivery counts to the delivery list', () => {
    const counts = deliveryCounts(deliveries);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(deliveries.length);
    expect(counts.delayed).toBe(overview('all').delayed);
  });
});

describe('alerts', () => {
  it('lists one alert per low-stock material, delayed delivery, maintenance unit and device problem', () => {
    const alerts = deriveAlerts();
    expect(alerts.filter((a) => a.id.startsWith('alert-low-'))).toHaveLength(overview('all').lowStockCount);
    expect(alerts.filter((a) => a.id.startsWith('alert-delay-'))).toHaveLength(2);
    expect(alerts.filter((a) => a.id.startsWith('alert-maint-'))).toHaveLength(2);
    expect(alerts.filter((a) => a.id.startsWith('alert-device-'))).toHaveLength(3);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
  });

  it('states units in low-stock alerts', () => {
    const rebar = deriveAlerts().find((a) => a.id === 'alert-low-m-pasig-rebar');
    expect(rebar?.text).toBe('Low stock: Deformed bar, 12 mm × 6 m, 380 pcs on hand (reorder level 500)');
  });
});

describe('formatting', () => {
  it('signs schedule variance in percentage points', () => {
    expect(formatPts(2)).toBe('+2 pts');
    expect(formatPts(-4)).toBe('−4 pts');
    expect(formatPts(0)).toBe('0 pts');
  });
});
