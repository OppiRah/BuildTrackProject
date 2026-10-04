import { describe, expect, it } from 'vitest';
import { deliveries, equipment, events, materials, simulatedEventPool } from '../src/data/demo/fixtures.ts';
import {
  canSimulate,
  clearFilters,
  deliveryVisible,
  equipmentVisible,
  eventVisible,
  initialDemoState,
  materialVisible,
  MAX_SIMULATED_EVENTS,
  reduce,
  type DemoAction,
  type DemoState,
} from '../src/lib/demo-state.ts';

const apply = (...actions: DemoAction[]): DemoState => actions.reduce(reduce, initialDemoState);
const ids = <T extends { id: string }>(list: T[], visible: (item: T) => boolean) => list.filter(visible).map((x) => x.id);

describe('filtering', () => {
  it('shows everything for all projects with no filters', () => {
    const s = initialDemoState;
    expect(materials.every((m) => materialVisible(m, s))).toBe(true);
    expect(equipment.every((e) => equipmentVisible(e, s))).toBe(true);
    expect(deliveries.every((d) => deliveryVisible(d, s))).toBe(true);
  });

  it('limits every list to the selected project and hides yard equipment', () => {
    const s = apply({ type: 'project', projectId: 'p-mandaue' });
    expect(ids(materials, (m) => materialVisible(m, s))).toEqual([
      'm-mandaue-cement', 'm-mandaue-gravel', 'm-mandaue-rebar', 'm-mandaue-plywood',
    ]);
    expect(ids(equipment, (e) => equipmentVisible(e, s))).toEqual(['FL-08', 'SL-09', 'WG-10']);
    expect(ids(events, (e) => eventVisible(e, s)).every((id) => events.find((e) => e.id === id)?.projectId === 'p-mandaue')).toBe(true);
  });

  it('combines category and low-stock filters', () => {
    const s = apply({ type: 'materialCategory', value: 'cement' }, { type: 'lowStockOnly', value: true });
    expect(ids(materials, (m) => materialVisible(m, s))).toEqual(['m-mandaue-cement']);
  });

  it('can produce an empty result that clearing filters restores', () => {
    const s = apply({ type: 'project', projectId: 'p-cdo' }, { type: 'lowStockOnly', value: true });
    expect(ids(materials, (m) => materialVisible(m, s))).toEqual([]);
    const cleared = clearFilters(s);
    expect(cleared.projectId).toBe('p-cdo');
    expect(ids(materials, (m) => materialVisible(m, cleared))).toHaveLength(4);
  });

  it('filters equipment and deliveries by status', () => {
    const maint = apply({ type: 'equipmentStatus', value: 'maintenance' });
    expect(ids(equipment, (e) => equipmentVisible(e, maint))).toEqual(['DT-06', 'CV-13']);
    const delayed = apply({ type: 'deliveryStatus', value: 'delayed' });
    expect(ids(deliveries, (d) => deliveryVisible(d, delayed))).toEqual(['D-102', 'D-201']);
  });
});

describe('simulated scans', () => {
  const visibleSimulated = (s: DemoState) =>
    simulatedEventPool.filter((e, index) => eventVisible(e, s, index)).map((e) => e.id);

  it('starts with no simulated events', () => {
    expect(visibleSimulated(initialDemoState)).toEqual([]);
    expect(canSimulate(initialDemoState)).toBe(true);
  });

  it('reveals pool events in order', () => {
    expect(visibleSimulated(apply({ type: 'simulate' }, { type: 'simulate' }))).toEqual(['S-1', 'S-2']);
  });

  it('stops at five events', () => {
    const many = apply(...Array.from({ length: 8 }, () => ({ type: 'simulate' }) as const));
    expect(many.simulatedCount).toBe(MAX_SIMULATED_EVENTS);
    expect(visibleSimulated(many)).toHaveLength(5);
    expect(canSimulate(many)).toBe(false);
  });

  it('respects the project filter for simulated events', () => {
    const s = apply(...Array.from({ length: 5 }, () => ({ type: 'simulate' }) as const), { type: 'project', projectId: 'p-pasig' });
    expect(visibleSimulated(s)).toEqual(['S-1', 'S-5']);
  });

  it('never shows a simulated event without a pool position', () => {
    const s = apply({ type: 'simulate' });
    expect(eventVisible(simulatedEventPool[0], s)).toBe(false);
  });

  it('does not change any other state', () => {
    const before = apply({ type: 'project', projectId: 'p-iloilo' }, { type: 'section', section: 'events' });
    const after = reduce(before, { type: 'simulate' });
    expect({ ...after, simulatedCount: 0 }).toEqual(before);
  });
});

describe('reset', () => {
  it('restores the initial state, including simulated events', () => {
    const changed = apply(
      { type: 'section', section: 'deliveries' },
      { type: 'project', projectId: 'p-cdo' },
      { type: 'deliveryStatus', value: 'delivered' },
      { type: 'simulate' },
    );
    expect(reduce(changed, { type: 'reset' })).toEqual(initialDemoState);
  });
});
