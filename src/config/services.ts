// Proposed service catalogue. Ids are the allowlist for `?service=` preselection.
// `capability` services are platform features; `supporting` services are delivered
// around the platform and are quoted separately unless a package states otherwise.

export const services = [
  {
    id: 'materials-inventory',
    kind: 'capability',
    name: 'Materials and inventory tracking',
    summary: 'Record materials as they arrive, move and are used, so stock levels stay visible for every site.',
  },
  {
    id: 'equipment-tracking',
    kind: 'capability',
    name: 'Equipment tracking and utilization',
    summary: 'See where each machine or tool is, whether it is working, idle or under maintenance, and how much it is used.',
  },
  {
    id: 'delivery-monitoring',
    kind: 'capability',
    name: 'Delivery monitoring',
    summary: 'Follow scheduled, in-transit, delivered and delayed material deliveries against project needs.',
  },
  {
    id: 'project-dashboards',
    kind: 'capability',
    name: 'Project dashboards and analytics',
    summary: 'Bring inventory, equipment and delivery records together in dashboards, alerts and reports.',
  },
  {
    id: 'hardware-deployment',
    kind: 'supporting',
    name: 'QR/RFID/IoT hardware deployment',
    summary: 'Supply and set up QR labels, RFID tags and readers, and site devices suited to each project.',
  },
  {
    id: 'onboarding-training',
    kind: 'supporting',
    name: 'Implementation, onboarding and training',
    summary: 'Set up projects and users, and train site and office teams to record and read the data.',
  },
  {
    id: 'custom-integration',
    kind: 'supporting',
    name: 'Custom integration and consulting',
    summary: 'Connect BuildTrack with existing project, procurement or accounting tools where needed.',
  },
  {
    id: 'maintenance-support',
    kind: 'supporting',
    name: 'Maintenance and support',
    summary: 'Ongoing help, updates and upkeep of the platform and site hardware.',
  },
] as const;

export type Service = (typeof services)[number];
export type ServiceId = Service['id'];

export const capabilityServices = services.filter((service) => service.kind === 'capability');
export const supportingServices = services.filter((service) => service.kind === 'supporting');
