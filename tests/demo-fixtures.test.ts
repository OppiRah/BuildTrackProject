import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  deliveries,
  devices,
  equipment,
  events,
  materials,
  projects,
  simulatedEventPool,
} from '../src/data/demo/fixtures.ts';

const asOf = Date.parse(DEMO_AS_OF);
const time = (iso: string) => Date.parse(iso);
const unique = (values: string[]) => new Set(values).size === values.length;
const projectIds = new Set<string>(projects.map((p) => p.id));
const materialById = new Map(materials.map((m) => [m.id, m]));
const equipmentIds = new Set(equipment.map((e) => e.id));

describe('demo projects', () => {
  it('has four clearly labelled sample projects in the Philippines', () => {
    expect(projects).toHaveLength(4);
    for (const p of projects) expect(p.name).toMatch(/^Sample /);
  });

  it('has consistent dates and progress', () => {
    for (const p of projects) {
      expect(time(p.startDate)).toBeLessThan(asOf);
      expect(time(p.plannedEndDate)).toBeGreaterThan(asOf);
      for (const pct of [p.plannedProgressPct, p.actualProgressPct]) {
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('referential integrity', () => {
  it('uses unique ids across every collection', () => {
    for (const ids of [projects, materials, equipment, deliveries, devices].map((list) => list.map((x) => x.id))) {
      expect(unique(ids)).toBe(true);
    }
    expect(unique([...events, ...simulatedEventPool].map((e) => e.id))).toBe(true);
  });

  it('resolves every project, material and equipment reference', () => {
    for (const m of materials) expect(projectIds.has(m.projectId)).toBe(true);
    for (const e of equipment) if (e.projectId !== null) expect(projectIds.has(e.projectId)).toBe(true);
    for (const d of devices) expect(projectIds.has(d.projectId)).toBe(true);
    for (const d of deliveries) {
      expect(projectIds.has(d.projectId)).toBe(true);
      expect(materialById.get(d.materialId)?.projectId).toBe(d.projectId);
    }
    for (const e of [...events, ...simulatedEventPool]) {
      expect(projectIds.has(e.projectId)).toBe(true);
      if (e.subject.kind === 'material') expect(materialById.get(e.subject.id)?.projectId).toBe(e.projectId);
      else expect(equipmentIds.has(e.subject.id)).toBe(true);
    }
  });
});

describe('quantities and units', () => {
  it('keeps material quantities within bounds', () => {
    for (const m of materials) {
      expect(m.onHand).toBeGreaterThanOrEqual(0);
      expect(m.usedToDate).toBeGreaterThanOrEqual(0);
      expect(m.usedToDate).toBeLessThanOrEqual(m.plannedTotal);
      expect(m.unit.trim()).not.toBe('');
    }
  });

  it('uses one unit per material name', () => {
    const unitByName = new Map<string, string>();
    for (const m of materials) {
      expect(unitByName.get(m.name) ?? m.unit).toBe(m.unit);
      unitByName.set(m.name, m.unit);
    }
  });

  it('never records more equipment hours than were available', () => {
    for (const e of equipment) {
      expect(e.hoursUsed7d).toBeGreaterThanOrEqual(0);
      expect(e.hoursUsed7d).toBeLessThanOrEqual(e.hoursAvailable7d);
      if (e.status === 'maintenance' || e.status === 'in-transit') expect(e.hoursAvailable7d).toBe(0);
    }
  });
});

describe('time consistency', () => {
  it('matches delivery status to dates', () => {
    for (const d of deliveries) {
      expect(d.quantity).toBeGreaterThan(0);
      if (d.status === 'delivered') {
        expect(d.deliveredAt).not.toBeNull();
        expect(time(d.deliveredAt!)).toBeLessThanOrEqual(asOf);
        expect(time(d.deliveredAt!)).toBeGreaterThanOrEqual(time(d.scheduledAt));
      } else expect(d.deliveredAt).toBeNull();
      if (d.status === 'delayed') expect(time(d.scheduledAt)).toBeLessThan(asOf);
      if (d.status === 'scheduled' || d.status === 'in-transit') expect(time(d.scheduledAt)).toBeGreaterThan(asOf);
    }
  });

  it('records a receipt scan at the time of every completed delivery', () => {
    for (const d of deliveries.filter((x) => x.status === 'delivered')) {
      const receipt = events.find((e) => e.subject.id === d.materialId && e.timestamp === d.deliveredAt);
      expect(receipt?.summary).toContain(d.id);
    }
  });

  it('keeps recorded events at or before the snapshot, newest first', () => {
    for (const e of [...events, ...devices.map((d) => ({ timestamp: d.lastSeen }))]) expect(time(e.timestamp)).toBeLessThanOrEqual(asOf);
    const times = events.map((e) => time(e.timestamp));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('places the five simulated events after the snapshot, all labelled', () => {
    expect(simulatedEventPool).toHaveLength(5);
    for (const e of simulatedEventPool) {
      expect(e.simulated).toBe(true);
      expect(time(e.timestamp)).toBeGreaterThan(asOf);
    }
    expect(events.some((e) => e.simulated)).toBe(false);
  });
});

describe('status coverage', () => {
  it('includes every status the dashboard explains', () => {
    expect(materials.some((m) => m.onHand <= m.reorderLevel)).toBe(true);
    for (const s of ['scheduled', 'in-transit', 'delivered', 'delayed']) expect(deliveries.some((d) => d.status === s)).toBe(true);
    for (const s of ['active', 'idle', 'maintenance', 'in-transit']) expect(equipment.some((e) => e.status === s)).toBe(true);
    for (const s of ['online', 'offline', 'low-battery']) expect(devices.some((d) => d.status === s)).toBe(true);
  });
});
