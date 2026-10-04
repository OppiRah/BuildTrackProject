// Demo entity types (docs/ARCHITECTURE.md §9). All demo data is fictional.

export type ProjectId = 'p-pasig' | 'p-iloilo' | 'p-mandaue' | 'p-cdo';

export interface Project {
  id: ProjectId;
  name: string;
  location: string;
  type: 'building' | 'road' | 'bridge' | 'industrial';
  startDate: string;
  plannedEndDate: string;
  plannedProgressPct: number;
  actualProgressPct: number;
}

export type MaterialCategory = 'cement' | 'aggregates' | 'steel' | 'masonry' | 'formwork';

export interface Material {
  id: string;
  projectId: ProjectId;
  name: string;
  category: MaterialCategory;
  /** Unit for every quantity of this material, e.g. "bags (40 kg)", "m³", "pcs". */
  unit: string;
  onHand: number;
  reorderLevel: number;
  plannedTotal: number;
  usedToDate: number;
}

export type EquipmentStatus = 'active' | 'idle' | 'maintenance' | 'in-transit';

export interface Equipment {
  id: string;
  /** null = central equipment yard (not assigned to a project). */
  projectId: ProjectId | null;
  name: string;
  tag: 'QR' | 'RFID';
  status: EquipmentStatus;
  /** Hours worked in the 7 days before the snapshot. */
  hoursUsed7d: number;
  /** Hours the unit was available to work in those 7 days (0 if unavailable). */
  hoursAvailable7d: number;
}

export type DeliveryStatus = 'scheduled' | 'in-transit' | 'delivered' | 'delayed';

export interface Delivery {
  id: string;
  projectId: ProjectId;
  materialId: string;
  /** In the referenced material's unit. */
  quantity: number;
  supplierLabel: string;
  status: DeliveryStatus;
  scheduledAt: string;
  deliveredAt: string | null;
}

export interface TrackingEvent {
  id: string;
  timestamp: string;
  projectId: ProjectId;
  method: 'QR scan' | 'RFID gate read';
  subject: { kind: 'material' | 'equipment'; id: string };
  locationLabel: string;
  summary: string;
  simulated?: boolean;
}

export interface Device {
  id: string;
  projectId: ProjectId;
  kind: 'RFID gate reader' | 'GPS tracker' | 'Site sensor hub';
  label: string;
  status: 'online' | 'offline' | 'low-battery';
  lastSeen: string;
}
