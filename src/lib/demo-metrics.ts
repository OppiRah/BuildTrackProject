// Derived demo metrics (docs/ARCHITECTURE.md §9.4). Pure functions over fixtures;
// nothing derived is stored, so cards, tables and charts cannot disagree.

import { deliveries, devices, equipment, materials, projects } from '../data/demo/fixtures.ts';
import { deviceStatusLabels } from '../data/demo/labels.ts';
import type { Delivery, DeliveryStatus, Equipment, Material, Project, ProjectId } from '../data/demo/types.ts';

export type ProjectScope = 'all' | ProjectId;

export const inScope = (projectId: ProjectId | null, scope: ProjectScope): boolean =>
  scope === 'all' || projectId === scope;

export const isLowStock = (m: Material): boolean => m.onHand <= m.reorderLevel;

/** Share of the planned quantity already used, 0–100. */
export const materialUsagePct = (m: Material): number => (m.plannedTotal === 0 ? 0 : (m.usedToDate / m.plannedTotal) * 100);

/** Hours used ÷ hours available in the last 7 days, 0–100 (0 when unavailable). */
export const equipmentUtilizationPct = (e: Equipment): number =>
  e.hoursAvailable7d === 0 ? 0 : (e.hoursUsed7d / e.hoursAvailable7d) * 100;

/** Σ hours used ÷ Σ hours available: a weighted figure, not an average of percentages. */
export function fleetUtilizationPct(list: Equipment[]): number | null {
  const available = list.reduce((sum, e) => sum + e.hoursAvailable7d, 0);
  if (available === 0) return null;
  return (list.reduce((sum, e) => sum + e.hoursUsed7d, 0) / available) * 100;
}

export function deliveryCounts(list: Delivery[]): Record<DeliveryStatus, number> {
  const counts: Record<DeliveryStatus, number> = { scheduled: 0, 'in-transit': 0, delivered: 0, delayed: 0 };
  for (const d of list) counts[d.status] += 1;
  return counts;
}

/** Actual minus planned progress, in percentage points. Defined for one project only. */
export const scheduleVariancePts = (p: Project): number => p.actualProgressPct - p.plannedProgressPct;

export interface Overview {
  lowStockCount: number;
  materialCount: number;
  utilizationPct: number | null;
  equipmentCount: number;
  inTransit: number;
  delayed: number;
  /** null for "all": no aggregate variance is computed (ADR-019). */
  scheduleVariance: number | null;
}

export function overview(scope: ProjectScope): Overview {
  const scopedMaterials = materials.filter((m) => inScope(m.projectId, scope));
  const scopedEquipment = equipment.filter((e) => inScope(e.projectId, scope));
  const counts = deliveryCounts(deliveries.filter((d) => inScope(d.projectId, scope)));
  const project = scope === 'all' ? undefined : projects.find((p) => p.id === scope);
  return {
    lowStockCount: scopedMaterials.filter(isLowStock).length,
    materialCount: scopedMaterials.length,
    utilizationPct: fleetUtilizationPct(scopedEquipment),
    equipmentCount: scopedEquipment.length,
    inTransit: counts['in-transit'],
    delayed: counts.delayed,
    scheduleVariance: project ? scheduleVariancePts(project) : null,
  };
}

export interface Alert {
  id: string;
  projectId: ProjectId;
  level: 'warning' | 'danger';
  text: string;
}

const materialById = new Map(materials.map((m) => [m.id, m]));

/** Alerts derived from the same fixtures: low stock, delayed deliveries, maintenance, device problems. */
export function deriveAlerts(): Alert[] {
  const alerts: Alert[] = [];
  for (const m of materials.filter(isLowStock)) {
    alerts.push({
      id: `alert-low-${m.id}`,
      projectId: m.projectId,
      level: 'warning',
      text: `Low stock: ${m.name}, ${formatNumber(m.onHand)} ${m.unit} on hand (reorder level ${formatNumber(m.reorderLevel)})`,
    });
  }
  for (const d of deliveries.filter((x) => x.status === 'delayed')) {
    const m = materialById.get(d.materialId);
    alerts.push({
      id: `alert-delay-${d.id}`,
      projectId: d.projectId,
      level: 'danger',
      text: `Delayed delivery ${d.id}: ${formatNumber(d.quantity)} ${m?.unit ?? ''} of ${m?.name ?? d.materialId}, due ${formatDateTime(d.scheduledAt)}`,
    });
  }
  for (const e of equipment.filter((x) => x.status === 'maintenance' && x.projectId !== null)) {
    alerts.push({ id: `alert-maint-${e.id}`, projectId: e.projectId as ProjectId, level: 'warning', text: `${e.name} is under maintenance` });
  }
  for (const dv of devices.filter((x) => x.status !== 'online')) {
    alerts.push({
      id: `alert-device-${dv.id}`,
      projectId: dv.projectId,
      level: dv.status === 'offline' ? 'danger' : 'warning',
      text: `${dv.kind} "${dv.label}": ${deviceStatusLabels[dv.status].toLowerCase()} (last seen ${formatDateTime(dv.lastSeen)})`,
    });
  }
  return alerts;
}

const numberFormat = new Intl.NumberFormat('en-PH');
export const formatNumber = (n: number): string => numberFormat.format(n);
export const formatPct = (n: number): string => `${Math.round(n)}%`;
export const formatPts = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} pts`;

const dateTimeFormat = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
/** Fixed Philippine time display, e.g. "Sep 28, 2026, 8:00 AM PHT". */
export const formatDateTime = (iso: string): string => `${dateTimeFormat.format(new Date(iso))} PHT`;
