// Interactive demo state (docs/ARCHITECTURE.md §9.5). Pure: the browser script
// keeps one state object in memory and applies these functions; nothing persists.

import type {
  Delivery,
  DeliveryStatus,
  Device,
  Equipment,
  EquipmentStatus,
  Material,
  MaterialCategory,
  TrackingEvent,
} from '../data/demo/types.ts';
import { inScope, isLowStock, type Alert, type ProjectScope } from './demo-metrics.ts';

export const demoSections = ['overview', 'inventory', 'equipment', 'deliveries', 'events', 'devices'] as const;
export type DemoSection = (typeof demoSections)[number];

export const MAX_SIMULATED_EVENTS = 5;

export interface DemoState {
  section: DemoSection;
  projectId: ProjectScope;
  materialCategory: 'all' | MaterialCategory;
  lowStockOnly: boolean;
  equipmentStatus: 'all' | EquipmentStatus;
  deliveryStatus: 'all' | DeliveryStatus;
  /** How many pool events have been revealed (0–5). */
  simulatedCount: number;
}

export const initialDemoState: DemoState = {
  section: 'overview',
  projectId: 'all',
  materialCategory: 'all',
  lowStockOnly: false,
  equipmentStatus: 'all',
  deliveryStatus: 'all',
  simulatedCount: 0,
};

export type DemoAction =
  | { type: 'section'; section: DemoSection }
  | { type: 'project'; projectId: ProjectScope }
  | { type: 'materialCategory'; value: DemoState['materialCategory'] }
  | { type: 'lowStockOnly'; value: boolean }
  | { type: 'equipmentStatus'; value: DemoState['equipmentStatus'] }
  | { type: 'deliveryStatus'; value: DemoState['deliveryStatus'] }
  | { type: 'simulate' }
  | { type: 'reset' };

export function reduce(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'section':
      return { ...state, section: action.section };
    case 'project':
      return { ...state, projectId: action.projectId };
    case 'materialCategory':
      return { ...state, materialCategory: action.value };
    case 'lowStockOnly':
      return { ...state, lowStockOnly: action.value };
    case 'equipmentStatus':
      return { ...state, equipmentStatus: action.value };
    case 'deliveryStatus':
      return { ...state, deliveryStatus: action.value };
    case 'simulate':
      return { ...state, simulatedCount: Math.min(state.simulatedCount + 1, MAX_SIMULATED_EVENTS) };
    case 'reset':
      return initialDemoState;
  }
}

export const canSimulate = (state: DemoState): boolean => state.simulatedCount < MAX_SIMULATED_EVENTS;

/** Clears the section filters; keeps the selected section, project and simulated events. */
export const clearFilters = (state: DemoState): DemoState => ({
  ...state,
  materialCategory: 'all',
  lowStockOnly: false,
  equipmentStatus: 'all',
  deliveryStatus: 'all',
});

// Visibility predicates: shared by the browser script and the tests.

export const materialVisible = (m: Material, s: DemoState): boolean =>
  inScope(m.projectId, s.projectId) &&
  (s.materialCategory === 'all' || m.category === s.materialCategory) &&
  (!s.lowStockOnly || isLowStock(m));

export const equipmentVisible = (e: Equipment, s: DemoState): boolean =>
  inScope(e.projectId, s.projectId) && (s.equipmentStatus === 'all' || e.status === s.equipmentStatus);

export const deliveryVisible = (d: Delivery, s: DemoState): boolean =>
  inScope(d.projectId, s.projectId) && (s.deliveryStatus === 'all' || d.status === s.deliveryStatus);

/** Simulated events appear only once revealed; `poolIndex` is the event's position in the pool. */
export const eventVisible = (e: TrackingEvent, s: DemoState, poolIndex = -1): boolean =>
  inScope(e.projectId, s.projectId) && (!e.simulated || (poolIndex >= 0 && poolIndex < s.simulatedCount));

export const deviceVisible = (d: Device, s: DemoState): boolean => inScope(d.projectId, s.projectId);

export const alertVisible = (a: Alert, s: DemoState): boolean => inScope(a.projectId, s.projectId);
