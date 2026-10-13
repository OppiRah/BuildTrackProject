// Display labels for demo values (text always accompanies color).

import type { DeliveryStatus, Device, EquipmentStatus, MaterialCategory } from './types.ts';

export const sectionLabels = {
  overview: 'Overview',
  inventory: 'Materials',
  equipment: 'Equipment',
  deliveries: 'Deliveries',
  events: 'Activity',
  devices: 'Devices',
  estimate: 'Concrete estimate',
} as const;

export const categoryLabels: Record<MaterialCategory, string> = {
  cement: 'Cement',
  aggregates: 'Aggregates',
  steel: 'Steel',
  masonry: 'Masonry',
  formwork: 'Formwork',
};

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  maintenance: 'Maintenance',
  'in-transit': 'In transit',
};

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  scheduled: 'Scheduled',
  'in-transit': 'In transit',
  delivered: 'Delivered',
  delayed: 'Delayed',
};

export const deviceStatusLabels: Record<Device['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  'low-battery': 'Low battery',
};

export type Tone = 'ok' | 'warning' | 'danger' | 'info';

export const equipmentTone: Record<EquipmentStatus, Tone> = { active: 'ok', idle: 'info', maintenance: 'warning', 'in-transit': 'info' };
export const deliveryTone: Record<DeliveryStatus, Tone> = { scheduled: 'info', 'in-transit': 'info', delivered: 'ok', delayed: 'danger' };
export const deviceTone: Record<Device['status'], Tone> = { online: 'ok', offline: 'danger', 'low-battery': 'warning' };

export const YARD_LABEL = 'Central equipment yard';
