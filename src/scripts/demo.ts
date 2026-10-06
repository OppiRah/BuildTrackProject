// Interactive Platform Demo behavior. All rows, cards and charts are rendered at
// build time; this script keeps one in-memory state object and shows or hides
// them using the shared predicates in src/lib/demo-state.ts. No storage, timers
// or network requests; a reload restores the initial state.

import { deliveries, devices, equipment, events, materials, projects, simulatedEventPool } from '../data/demo/fixtures.ts';
import { sectionLabels } from '../data/demo/labels.ts';
import type { ProjectId } from '../data/demo/types.ts';
import { deriveAlerts, inScope, type ProjectScope } from '../lib/demo-metrics.ts';
import {
  alertVisible,
  canSimulate,
  clearFilters,
  deliveryVisible,
  demoSections,
  deviceVisible,
  equipmentVisible,
  eventVisible,
  initialDemoState,
  materialVisible,
  MAX_SIMULATED_EVENTS,
  reduce,
  type DemoAction,
  type DemoSection,
  type DemoState,
} from '../lib/demo-state.ts';

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((item) => [item.id, item]));

const lookups = {
  material: byId(materials),
  equipment: byId(equipment),
  delivery: byId(deliveries),
  event: byId([...events, ...simulatedEventPool]),
  device: byId(devices),
  alert: byId(deriveAlerts()),
};
const projectIds = projects.map((p) => p.id);
const projectName = new Map(projects.map((p) => [p.id, p.name]));

const nouns: Record<DemoSection, [string, string]> = {
  overview: ['', ''],
  inventory: ['material', 'materials'],
  equipment: ['equipment unit', 'equipment units'],
  deliveries: ['delivery', 'deliveries'],
  events: ['tracking event', 'tracking events'],
  devices: ['device', 'devices'],
};

export function initDemo(): void {
  const root = document.querySelector<HTMLElement>('[data-demo]');
  if (!root) return;

  let state: DemoState = initialDemoState;
  const all = <T extends HTMLElement = HTMLElement>(selector: string): T[] => [...root.querySelectorAll<T>(selector)];
  const status = root.querySelector<HTMLElement>('[data-demo-status]');
  const projectSelect = root.querySelector<HTMLSelectElement>('[data-project-select]');
  const simulateButton = root.querySelector<HTMLButtonElement>('[data-simulate]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset]');
  const simulateCount = root.querySelector<HTMLElement>('[data-simulate-count]');
  const sectionTitle = root.querySelector<HTMLElement>('[data-section-title]');

  const isVisible = (el: HTMLElement): boolean => {
    const id = el.dataset.id ?? '';
    switch (el.dataset.kind) {
      case 'material':
        return materialVisible(lookups.material.get(id)!, state);
      case 'equipment':
        return equipmentVisible(lookups.equipment.get(id)!, state);
      case 'delivery':
        return deliveryVisible(lookups.delivery.get(id)!, state);
      case 'event':
        return eventVisible(lookups.event.get(id)!, state, el.dataset.poolIndex ? Number(el.dataset.poolIndex) : -1);
      case 'device':
        return deviceVisible(lookups.device.get(id)!, state);
      case 'alert':
        return alertVisible(lookups.alert.get(id)!, state);
      case 'project':
        return inScope(id as ProjectId, state.projectId);
      default:
        return true;
    }
  };

  const visibleCount = (rowsKey: string): number => {
    const container = root.querySelector<HTMLElement>(`[data-rows="${rowsKey}"]`);
    return container ? [...container.children].filter((child) => !(child as HTMLElement).hidden).length : 0;
  };

  const render = () => {
    for (const panel of all('[data-panel]')) panel.hidden = panel.dataset.panel !== state.section;
    if (sectionTitle) sectionTitle.textContent = sectionLabels[state.section];
    for (const button of all('[data-section-button]')) {
      if (button.dataset.sectionButton === state.section) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    for (const el of all('[data-scope]')) el.hidden = el.dataset.scope !== state.projectId;
    for (const el of all('[data-kind]')) el.hidden = !isVisible(el);
    for (const list of all('[data-limit]')) {
      let shown = 0;
      for (const child of list.children as HTMLCollectionOf<HTMLElement>) {
        if (child.hidden) continue;
        shown += 1;
        if (shown > Number(list.dataset.limit)) child.hidden = true;
      }
    }
    for (const empty of all('[data-empty-for]')) {
      const key = empty.dataset.emptyFor ?? '';
      const none = visibleCount(key) === 0;
      empty.hidden = !none;
      for (const el of all(`[data-hide-when-empty="${key}"]`)) el.hidden = none;
    }

    if (projectSelect) projectSelect.value = state.projectId;
    for (const control of all<HTMLInputElement | HTMLSelectElement>('[data-filter]')) {
      const key = control.dataset.filter as keyof DemoState;
      if (control instanceof HTMLInputElement) control.checked = Boolean(state[key]);
      else control.value = String(state[key]);
    }
    if (simulateButton) {
      // aria-disabled keeps the button focusable so the limit message is reachable.
      simulateButton.setAttribute('aria-disabled', String(!canSimulate(state)));
      simulateButton.textContent = canSimulate(state) ? 'Simulate scan' : 'Simulation limit reached';
    }
    if (simulateCount) {
      simulateCount.textContent = canSimulate(state)
        ? `${state.simulatedCount} of ${MAX_SIMULATED_EVENTS} simulated scans used`
        : `${MAX_SIMULATED_EVENTS} of ${MAX_SIMULATED_EVENTS} simulated scans used. Reset the demo to start again.`;
    }
  };

  const announce = (message: string) => {
    if (status) status.textContent = message;
  };

  const scopeLabel = () => (state.projectId === 'all' ? 'all sample projects' : (projectName.get(state.projectId) ?? ''));

  const viewSummary = () => {
    const label = sectionLabels[state.section];
    if (state.section === 'overview') return `Showing ${label} for ${scopeLabel()}.`;
    const count = visibleCount(state.section);
    const [one, many] = nouns[state.section];
    return `Showing ${label} for ${scopeLabel()}: ${count} ${count === 1 ? one : many}.`;
  };

  const dispatch = (action: DemoAction) => {
    state = reduce(state, action);
    render();
  };

  for (const button of all<HTMLButtonElement>('[data-section-button]')) {
    button.addEventListener('click', () => {
      const section = button.dataset.sectionButton as DemoSection;
      if (!demoSections.includes(section)) return;
      dispatch({ type: 'section', section });
      announce(viewSummary());
    });
  }

  projectSelect?.addEventListener('change', () => {
    const value = projectSelect.value;
    const projectId: ProjectScope = (projectIds as string[]).includes(value) ? (value as ProjectId) : 'all';
    dispatch({ type: 'project', projectId });
    announce(viewSummary());
  });

  for (const control of all<HTMLInputElement | HTMLSelectElement>('[data-filter]')) {
    control.addEventListener('change', () => {
      const key = control.dataset.filter;
      if (key === 'lowStockOnly' && control instanceof HTMLInputElement) dispatch({ type: 'lowStockOnly', value: control.checked });
      else if (key === 'materialCategory') dispatch({ type: 'materialCategory', value: control.value as DemoState['materialCategory'] });
      else if (key === 'equipmentStatus') dispatch({ type: 'equipmentStatus', value: control.value as DemoState['equipmentStatus'] });
      else if (key === 'deliveryStatus') dispatch({ type: 'deliveryStatus', value: control.value as DemoState['deliveryStatus'] });
      announce(viewSummary());
    });
  }

  for (const button of all<HTMLButtonElement>('[data-clear-filters]')) {
    button.addEventListener('click', () => {
      state = clearFilters(state);
      render();
      // The button disappears with the empty state; keep focus on this panel's first filter.
      root.querySelector<HTMLElement>(`[data-panel="${state.section}"] [data-filter]`)?.focus();
      announce(`Filters cleared. ${viewSummary()}`);
    });
  }

  simulateButton?.addEventListener('click', () => {
    if (!canSimulate(state)) {
      announce('Simulation limit reached. Reset the demo to start again.');
      return;
    }
    const event = simulatedEventPool[state.simulatedCount];
    dispatch({ type: 'simulate' });
    const where = inScope(event.projectId, state.projectId) ? '' : ` It belongs to ${projectName.get(event.projectId)}, which is not selected.`;
    announce(`Simulated scan ${state.simulatedCount} of ${MAX_SIMULATED_EVENTS} added: ${event.summary}.${where}`);
  });

  resetButton?.addEventListener('click', () => {
    dispatch({ type: 'reset' });
    announce('Demo reset: overview of all sample projects, no simulated scans.');
  });

  // Stable entry points: /product-demo/#demo-panel-<section> opens that section (Home links
  // here) with the workspace in view. Only the section changes; the URL is never written, so a
  // plain reload still resets. A hash change after load is announced so the status never goes stale.
  const openFromHash = (announceChange: boolean): boolean => {
    const section = /^#demo-panel-([a-z]+)$/.exec(window.location.hash)?.[1] as DemoSection | undefined;
    if (!section || !demoSections.includes(section)) return false;
    dispatch({ type: 'section', section });
    root.scrollIntoView();
    if (announceChange) announce(viewSummary());
    return true;
  };
  window.addEventListener('hashchange', () => openFromHash(true));

  root.querySelector<HTMLElement>('[data-demo-nojs]')?.setAttribute('hidden', '');
  for (const el of all('[data-demo-controls]')) el.hidden = false;
  root.classList.add('is-enhanced');
  render();
  // The browser's own scroll to the fragment can run after this script; realign once loaded.
  if (openFromHash(false) && document.readyState !== 'complete') {
    window.addEventListener('load', () => root.scrollIntoView(), { once: true });
  }
}
