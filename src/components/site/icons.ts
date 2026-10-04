// Original line icons (24px grid, 2px stroke).
export const iconPaths = {
  materials: 'M3 9l9-5 9 5-9 5-9-5zM3 9v6l9 5 9-5V9M12 14v6',
  equipment: 'M3 17h11v-4H8l-2 4M14 13V8h3l3 5v4h-6M6 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
  inventory: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h8M8 19h5',
  visibility: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  delivery: 'M2 6h11v10H2zM13 10h4l4 3v3h-8M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  tag: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',
  cloud: 'M7 18h10a4 4 0 00.5-8A6 6 0 006 9.5 4.3 4.3 0 007 18z',
  decision: 'M4 4h16v12H4zM8 20h8M12 16v4M8 12l2-3 2 2 4-5',
  hardware: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  training: 'M3 8l9-4 9 4-9 4-9-4zM7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5',
  integration: 'M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1',
  support: 'M14 6a4 4 0 00-5 5l-6 6 3 3 6-6a4 4 0 005-5l-3 3-3-3 3-3z',
  waste: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  accuracy: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
  check: 'M5 12l4 4 10-10',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20',
} as const;

export type IconName = keyof typeof iconPaths;
