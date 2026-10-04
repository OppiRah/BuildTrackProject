// Fictional demo snapshot. Every project, quantity, supplier and event is invented
// for illustration; nothing here describes a real site, company or device.
// Invariants are enforced by tests/demo-fixtures.test.ts.

import type { Delivery, Device, Equipment, Material, Project, TrackingEvent } from './types.ts';

/** The single moment all demo figures describe. Nothing reads the real clock. */
export const DEMO_AS_OF = '2026-09-28T08:00:00+08:00';

export const projects: Project[] = [
  {
    id: 'p-pasig',
    name: 'Sample Mid-Rise Residential',
    location: 'Pasig City, Metro Manila',
    type: 'building',
    startDate: '2026-02-02',
    plannedEndDate: '2027-06-30',
    plannedProgressPct: 38,
    actualProgressPct: 34,
  },
  {
    id: 'p-iloilo',
    name: 'Sample Road Widening Package',
    location: 'Iloilo City, Iloilo',
    type: 'road',
    startDate: '2026-04-06',
    plannedEndDate: '2027-03-31',
    plannedProgressPct: 45,
    actualProgressPct: 47,
  },
  {
    id: 'p-mandaue',
    name: 'Sample Warehouse Expansion',
    location: 'Mandaue City, Cebu',
    type: 'industrial',
    startDate: '2026-06-01',
    plannedEndDate: '2027-01-29',
    plannedProgressPct: 52,
    actualProgressPct: 44,
  },
  {
    id: 'p-cdo',
    name: 'Sample Bridge Rehabilitation',
    location: 'Cagayan de Oro, Misamis Oriental',
    type: 'bridge',
    startDate: '2026-03-16',
    plannedEndDate: '2027-02-26',
    plannedProgressPct: 60,
    actualProgressPct: 61,
  },
];

const CEMENT = { name: 'Portland cement', category: 'cement', unit: 'bags (40 kg)' } as const;
const SAND = { name: 'Washed sand', category: 'aggregates', unit: 'm³' } as const;
const GRAVEL = { name: 'Gravel, 3/4 in', category: 'aggregates', unit: 'm³' } as const;
const REBAR = { name: 'Deformed bar, 12 mm × 6 m', category: 'steel', unit: 'pcs' } as const;
const CHB = { name: 'Concrete hollow block, 4 in', category: 'masonry', unit: 'pcs' } as const;
const PLYWOOD = { name: 'Marine plywood, 1/2 in', category: 'formwork', unit: 'sheets' } as const;

export const materials: Material[] = [
  { id: 'm-pasig-cement', projectId: 'p-pasig', ...CEMENT, onHand: 420, reorderLevel: 300, plannedTotal: 9000, usedToDate: 3060 },
  { id: 'm-pasig-sand', projectId: 'p-pasig', ...SAND, onHand: 85, reorderLevel: 60, plannedTotal: 1400, usedToDate: 480 },
  { id: 'm-pasig-gravel', projectId: 'p-pasig', ...GRAVEL, onHand: 70, reorderLevel: 60, plannedTotal: 1600, usedToDate: 540 },
  { id: 'm-pasig-rebar', projectId: 'p-pasig', ...REBAR, onHand: 380, reorderLevel: 500, plannedTotal: 14000, usedToDate: 5100 },
  { id: 'm-pasig-chb', projectId: 'p-pasig', ...CHB, onHand: 2600, reorderLevel: 2000, plannedTotal: 42000, usedToDate: 9800 },
  { id: 'm-pasig-plywood', projectId: 'p-pasig', ...PLYWOOD, onHand: 140, reorderLevel: 100, plannedTotal: 2400, usedToDate: 1020 },

  { id: 'm-iloilo-cement', projectId: 'p-iloilo', ...CEMENT, onHand: 260, reorderLevel: 250, plannedTotal: 6500, usedToDate: 2900 },
  { id: 'm-iloilo-sand', projectId: 'p-iloilo', ...SAND, onHand: 120, reorderLevel: 80, plannedTotal: 2200, usedToDate: 1050 },
  { id: 'm-iloilo-gravel', projectId: 'p-iloilo', ...GRAVEL, onHand: 45, reorderLevel: 90, plannedTotal: 3800, usedToDate: 1720 },
  { id: 'm-iloilo-rebar', projectId: 'p-iloilo', ...REBAR, onHand: 900, reorderLevel: 400, plannedTotal: 5200, usedToDate: 2300 },

  { id: 'm-mandaue-cement', projectId: 'p-mandaue', ...CEMENT, onHand: 180, reorderLevel: 200, plannedTotal: 4800, usedToDate: 2050 },
  { id: 'm-mandaue-gravel', projectId: 'p-mandaue', ...GRAVEL, onHand: 95, reorderLevel: 70, plannedTotal: 1900, usedToDate: 830 },
  { id: 'm-mandaue-rebar', projectId: 'p-mandaue', ...REBAR, onHand: 640, reorderLevel: 400, plannedTotal: 7600, usedToDate: 3300 },
  { id: 'm-mandaue-plywood', projectId: 'p-mandaue', ...PLYWOOD, onHand: 60, reorderLevel: 80, plannedTotal: 900, usedToDate: 420 },

  { id: 'm-cdo-cement', projectId: 'p-cdo', ...CEMENT, onHand: 310, reorderLevel: 220, plannedTotal: 5200, usedToDate: 3150 },
  { id: 'm-cdo-sand', projectId: 'p-cdo', ...SAND, onHand: 75, reorderLevel: 50, plannedTotal: 1200, usedToDate: 730 },
  { id: 'm-cdo-gravel', projectId: 'p-cdo', ...GRAVEL, onHand: 66, reorderLevel: 60, plannedTotal: 1500, usedToDate: 910 },
  { id: 'm-cdo-rebar', projectId: 'p-cdo', ...REBAR, onHand: 520, reorderLevel: 350, plannedTotal: 6800, usedToDate: 4120 },
];

export const equipment: Equipment[] = [
  { id: 'TC-01', projectId: 'p-pasig', name: 'Tower crane TC-01', tag: 'RFID', status: 'active', hoursUsed7d: 54, hoursAvailable7d: 60 },
  { id: 'CM-02', projectId: 'p-pasig', name: 'Concrete mixer CM-02', tag: 'QR', status: 'active', hoursUsed7d: 41, hoursAvailable7d: 60 },
  { id: 'CP-03', projectId: 'p-pasig', name: 'Concrete pump CP-03', tag: 'RFID', status: 'idle', hoursUsed7d: 6, hoursAvailable7d: 60 },

  { id: 'EX-04', projectId: 'p-iloilo', name: 'Excavator EX-04', tag: 'RFID', status: 'active', hoursUsed7d: 50, hoursAvailable7d: 60 },
  { id: 'RR-05', projectId: 'p-iloilo', name: 'Road roller RR-05', tag: 'RFID', status: 'active', hoursUsed7d: 44, hoursAvailable7d: 60 },
  { id: 'DT-06', projectId: 'p-iloilo', name: 'Dump truck DT-06', tag: 'RFID', status: 'maintenance', hoursUsed7d: 0, hoursAvailable7d: 0 },
  { id: 'PC-07', projectId: 'p-iloilo', name: 'Plate compactor PC-07', tag: 'QR', status: 'idle', hoursUsed7d: 8, hoursAvailable7d: 60 },

  { id: 'FL-08', projectId: 'p-mandaue', name: 'Forklift FL-08', tag: 'QR', status: 'active', hoursUsed7d: 47, hoursAvailable7d: 60 },
  { id: 'SL-09', projectId: 'p-mandaue', name: 'Scissor lift SL-09', tag: 'QR', status: 'active', hoursUsed7d: 30, hoursAvailable7d: 60 },
  { id: 'WG-10', projectId: 'p-mandaue', name: 'Welding generator WG-10', tag: 'QR', status: 'idle', hoursUsed7d: 12, hoursAvailable7d: 60 },

  { id: 'MC-11', projectId: 'p-cdo', name: 'Mobile crane MC-11', tag: 'RFID', status: 'active', hoursUsed7d: 52, hoursAvailable7d: 60 },
  { id: 'PD-12', projectId: 'p-cdo', name: 'Pile driver PD-12', tag: 'RFID', status: 'active', hoursUsed7d: 38, hoursAvailable7d: 60 },
  { id: 'CV-13', projectId: 'p-cdo', name: 'Concrete vibrator CV-13', tag: 'QR', status: 'maintenance', hoursUsed7d: 0, hoursAvailable7d: 0 },

  { id: 'BL-14', projectId: null, name: 'Backhoe loader BL-14', tag: 'RFID', status: 'in-transit', hoursUsed7d: 0, hoursAvailable7d: 0 },
  { id: 'GS-15', projectId: null, name: 'Generator set GS-15', tag: 'QR', status: 'idle', hoursUsed7d: 0, hoursAvailable7d: 60 },
];

export const deliveries: Delivery[] = [
  { id: 'D-101', projectId: 'p-pasig', materialId: 'm-pasig-cement', quantity: 600, supplierLabel: 'Supplier A', status: 'delivered', scheduledAt: '2026-09-24T09:00:00+08:00', deliveredAt: '2026-09-24T10:15:00+08:00' },
  { id: 'D-102', projectId: 'p-pasig', materialId: 'm-pasig-rebar', quantity: 1200, supplierLabel: 'Supplier B', status: 'delayed', scheduledAt: '2026-09-26T13:00:00+08:00', deliveredAt: null },
  { id: 'D-103', projectId: 'p-pasig', materialId: 'm-pasig-chb', quantity: 3000, supplierLabel: 'Supplier C', status: 'scheduled', scheduledAt: '2026-09-29T08:00:00+08:00', deliveredAt: null },
  { id: 'D-104', projectId: 'p-pasig', materialId: 'm-pasig-sand', quantity: 40, supplierLabel: 'Supplier D', status: 'in-transit', scheduledAt: '2026-09-28T10:00:00+08:00', deliveredAt: null },

  { id: 'D-201', projectId: 'p-iloilo', materialId: 'm-iloilo-gravel', quantity: 120, supplierLabel: 'Supplier D', status: 'delayed', scheduledAt: '2026-09-27T08:00:00+08:00', deliveredAt: null },
  { id: 'D-202', projectId: 'p-iloilo', materialId: 'm-iloilo-cement', quantity: 400, supplierLabel: 'Supplier A', status: 'delivered', scheduledAt: '2026-09-25T08:00:00+08:00', deliveredAt: '2026-09-25T09:40:00+08:00' },
  { id: 'D-203', projectId: 'p-iloilo', materialId: 'm-iloilo-rebar', quantity: 300, supplierLabel: 'Supplier B', status: 'scheduled', scheduledAt: '2026-10-01T09:00:00+08:00', deliveredAt: null },

  { id: 'D-301', projectId: 'p-mandaue', materialId: 'm-mandaue-cement', quantity: 300, supplierLabel: 'Supplier A', status: 'in-transit', scheduledAt: '2026-09-28T11:00:00+08:00', deliveredAt: null },
  { id: 'D-302', projectId: 'p-mandaue', materialId: 'm-mandaue-plywood', quantity: 80, supplierLabel: 'Supplier E', status: 'scheduled', scheduledAt: '2026-09-30T14:00:00+08:00', deliveredAt: null },
  { id: 'D-303', projectId: 'p-mandaue', materialId: 'm-mandaue-gravel', quantity: 60, supplierLabel: 'Supplier D', status: 'delivered', scheduledAt: '2026-09-23T10:00:00+08:00', deliveredAt: '2026-09-23T11:05:00+08:00' },

  { id: 'D-401', projectId: 'p-cdo', materialId: 'm-cdo-cement', quantity: 350, supplierLabel: 'Supplier A', status: 'delivered', scheduledAt: '2026-09-26T08:30:00+08:00', deliveredAt: '2026-09-26T09:20:00+08:00' },
  { id: 'D-402', projectId: 'p-cdo', materialId: 'm-cdo-rebar', quantity: 400, supplierLabel: 'Supplier B', status: 'scheduled', scheduledAt: '2026-09-30T08:00:00+08:00', deliveredAt: null },
  { id: 'D-403', projectId: 'p-cdo', materialId: 'm-cdo-sand', quantity: 30, supplierLabel: 'Supplier D', status: 'delivered', scheduledAt: '2026-09-27T14:00:00+08:00', deliveredAt: '2026-09-27T14:30:00+08:00' },
];

/** Recorded events, newest first. Delivered deliveries have a matching receipt scan. */
export const events: TrackingEvent[] = [
  { id: 'E-19', timestamp: '2026-09-28T07:52:00+08:00', projectId: 'p-iloilo', method: 'RFID gate read', subject: { kind: 'equipment', id: 'EX-04' }, locationLabel: 'North gate', summary: 'Excavator EX-04 entered the work zone' },
  { id: 'E-18', timestamp: '2026-09-28T07:45:00+08:00', projectId: 'p-pasig', method: 'QR scan', subject: { kind: 'material', id: 'm-pasig-cement' }, locationLabel: 'Warehouse A', summary: '40 bags of cement issued to Level 6' },
  { id: 'E-17', timestamp: '2026-09-28T07:31:00+08:00', projectId: 'p-mandaue', method: 'QR scan', subject: { kind: 'equipment', id: 'FL-08' }, locationLabel: 'Loading bay', summary: 'Forklift FL-08 checked out' },
  { id: 'E-16', timestamp: '2026-09-28T07:20:00+08:00', projectId: 'p-cdo', method: 'RFID gate read', subject: { kind: 'equipment', id: 'MC-11' }, locationLabel: 'Abutment A gate', summary: 'Mobile crane MC-11 passed the gate' },
  { id: 'E-15', timestamp: '2026-09-28T07:05:00+08:00', projectId: 'p-pasig', method: 'QR scan', subject: { kind: 'equipment', id: 'TC-01' }, locationLabel: 'Tower crane base', summary: 'Tower crane TC-01 pre-start check scanned' },
  { id: 'E-14', timestamp: '2026-09-27T17:40:00+08:00', projectId: 'p-iloilo', method: 'QR scan', subject: { kind: 'material', id: 'm-iloilo-sand' }, locationLabel: 'Stockpile 2', summary: '12 m³ of washed sand issued to Section 2' },
  { id: 'E-13', timestamp: '2026-09-27T17:10:00+08:00', projectId: 'p-mandaue', method: 'QR scan', subject: { kind: 'material', id: 'm-mandaue-plywood' }, locationLabel: 'Store room', summary: '15 sheets of plywood issued to formwork crew' },
  { id: 'E-12', timestamp: '2026-09-27T15:10:00+08:00', projectId: 'p-cdo', method: 'QR scan', subject: { kind: 'equipment', id: 'CV-13' }, locationLabel: 'Tool store', summary: 'Concrete vibrator CV-13 tagged for maintenance' },
  { id: 'E-11', timestamp: '2026-09-27T14:30:00+08:00', projectId: 'p-cdo', method: 'QR scan', subject: { kind: 'material', id: 'm-cdo-sand' }, locationLabel: 'Delivery bay', summary: 'Delivery D-403 received: 30 m³ of washed sand' },
  { id: 'E-10', timestamp: '2026-09-27T13:05:00+08:00', projectId: 'p-cdo', method: 'QR scan', subject: { kind: 'material', id: 'm-cdo-rebar' }, locationLabel: 'Steel yard', summary: '80 pcs of 12 mm bars issued to Pier 2' },
  { id: 'E-09', timestamp: '2026-09-27T12:30:00+08:00', projectId: 'p-pasig', method: 'RFID gate read', subject: { kind: 'equipment', id: 'CP-03' }, locationLabel: 'Equipment bay', summary: 'Concrete pump CP-03 returned to standby' },
  { id: 'E-08', timestamp: '2026-09-27T10:20:00+08:00', projectId: 'p-iloilo', method: 'QR scan', subject: { kind: 'material', id: 'm-iloilo-gravel' }, locationLabel: 'Stockpile 1', summary: '18 m³ of gravel issued to Section 3' },
  { id: 'E-07', timestamp: '2026-09-27T09:15:00+08:00', projectId: 'p-mandaue', method: 'QR scan', subject: { kind: 'material', id: 'm-mandaue-cement' }, locationLabel: 'Warehouse', summary: '20 bags of cement issued to the slab pour area' },
  { id: 'E-06', timestamp: '2026-09-27T08:40:00+08:00', projectId: 'p-pasig', method: 'QR scan', subject: { kind: 'material', id: 'm-pasig-rebar' }, locationLabel: 'Steel yard', summary: '150 pcs of 12 mm bars issued to Level 6' },
  { id: 'E-05', timestamp: '2026-09-26T16:00:00+08:00', projectId: 'p-iloilo', method: 'RFID gate read', subject: { kind: 'equipment', id: 'DT-06' }, locationLabel: 'Maintenance bay', summary: 'Dump truck DT-06 moved to the maintenance bay' },
  { id: 'E-04', timestamp: '2026-09-26T09:20:00+08:00', projectId: 'p-cdo', method: 'QR scan', subject: { kind: 'material', id: 'm-cdo-cement' }, locationLabel: 'Delivery bay', summary: 'Delivery D-401 received: 350 bags of cement' },
  { id: 'E-03', timestamp: '2026-09-25T09:40:00+08:00', projectId: 'p-iloilo', method: 'QR scan', subject: { kind: 'material', id: 'm-iloilo-cement' }, locationLabel: 'Delivery bay', summary: 'Delivery D-202 received: 400 bags of cement' },
  { id: 'E-02', timestamp: '2026-09-24T10:15:00+08:00', projectId: 'p-pasig', method: 'QR scan', subject: { kind: 'material', id: 'm-pasig-cement' }, locationLabel: 'Delivery bay', summary: 'Delivery D-101 received: 600 bags of cement' },
  { id: 'E-01', timestamp: '2026-09-23T11:05:00+08:00', projectId: 'p-mandaue', method: 'QR scan', subject: { kind: 'material', id: 'm-mandaue-gravel' }, locationLabel: 'Delivery bay', summary: 'Delivery D-303 received: 60 m³ of gravel' },
];

/**
 * Pre-written events revealed one at a time by "Simulate scan" (maximum five).
 * They record scans only and do not change any quantity, status or metric.
 */
export const simulatedEventPool: TrackingEvent[] = [
  { id: 'S-1', timestamp: '2026-09-28T08:02:00+08:00', projectId: 'p-pasig', method: 'QR scan', subject: { kind: 'material', id: 'm-pasig-plywood' }, locationLabel: 'Warehouse A', summary: 'Plywood stack label scanned during a stock check', simulated: true },
  { id: 'S-2', timestamp: '2026-09-28T08:04:00+08:00', projectId: 'p-iloilo', method: 'RFID gate read', subject: { kind: 'equipment', id: 'RR-05' }, locationLabel: 'North gate', summary: 'Road roller RR-05 passed the gate', simulated: true },
  { id: 'S-3', timestamp: '2026-09-28T08:06:00+08:00', projectId: 'p-mandaue', method: 'QR scan', subject: { kind: 'material', id: 'm-mandaue-gravel' }, locationLabel: 'Stockpile 1', summary: 'Gravel stockpile label scanned during a stock check', simulated: true },
  { id: 'S-4', timestamp: '2026-09-28T08:08:00+08:00', projectId: 'p-cdo', method: 'RFID gate read', subject: { kind: 'equipment', id: 'PD-12' }, locationLabel: 'Pier 2 gate', summary: 'Pile driver PD-12 passed the gate', simulated: true },
  { id: 'S-5', timestamp: '2026-09-28T08:10:00+08:00', projectId: 'p-pasig', method: 'RFID gate read', subject: { kind: 'equipment', id: 'CM-02' }, locationLabel: 'Batching area', summary: 'Concrete mixer CM-02 checked in', simulated: true },
];

export const devices: Device[] = [
  { id: 'DV-01', projectId: 'p-pasig', kind: 'RFID gate reader', label: 'Main gate reader', status: 'online', lastSeen: '2026-09-28T07:58:00+08:00' },
  { id: 'DV-02', projectId: 'p-pasig', kind: 'Site sensor hub', label: 'Warehouse A hub', status: 'online', lastSeen: '2026-09-28T07:59:00+08:00' },
  { id: 'DV-03', projectId: 'p-iloilo', kind: 'RFID gate reader', label: 'North gate reader', status: 'online', lastSeen: '2026-09-28T07:57:00+08:00' },
  { id: 'DV-04', projectId: 'p-iloilo', kind: 'GPS tracker', label: 'Excavator EX-04 tracker', status: 'low-battery', lastSeen: '2026-09-28T07:30:00+08:00' },
  { id: 'DV-05', projectId: 'p-mandaue', kind: 'RFID gate reader', label: 'Loading bay reader', status: 'offline', lastSeen: '2026-09-27T18:12:00+08:00' },
  { id: 'DV-06', projectId: 'p-mandaue', kind: 'Site sensor hub', label: 'Warehouse hub', status: 'online', lastSeen: '2026-09-28T07:56:00+08:00' },
  { id: 'DV-07', projectId: 'p-cdo', kind: 'RFID gate reader', label: 'Abutment A gate reader', status: 'online', lastSeen: '2026-09-28T07:55:00+08:00' },
  { id: 'DV-08', projectId: 'p-cdo', kind: 'GPS tracker', label: 'Mobile crane MC-11 tracker', status: 'online', lastSeen: '2026-09-28T07:58:00+08:00' },
  { id: 'DV-09', projectId: 'p-cdo', kind: 'Site sensor hub', label: 'Pier 2 hub', status: 'low-battery', lastSeen: '2026-09-28T06:40:00+08:00' },
];
