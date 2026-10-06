// Layout behaviour for the Interactive Platform Demo application shell.
//
// Below 64rem the sidebar becomes a modal drawer (.has-drawer): the Sections button opens it,
// focus moves to the current section, everything outside it is made inert, Tab and Shift+Tab
// wrap between its first and last visible controls (inert alone would let focus leave the page
// for the browser's own controls), and Escape, the Close button, the backdrop or choosing a
// section closes it and returns focus to the button.
// From 64rem the sidebar is a column that sticks to the top of the viewport only while it fits
// (.sidebar-sticky); when it does not (short windows, enlarged text) it scrolls with the page so
// every control stays reachable. Without this script the sidebar is a static block.

const DESKTOP = '(min-width: 64rem)';

export function initDemoLayout(): void {
  const root = document.querySelector<HTMLElement>('[data-demo]');
  const sidebar = root?.querySelector<HTMLElement>('[data-demo-sidebar]');
  const inner = root?.querySelector<HTMLElement>('[data-sidebar-inner]');
  const toggle = root?.querySelector<HTMLButtonElement>('[data-drawer-toggle]');
  const close = root?.querySelector<HTMLButtonElement>('[data-drawer-close]');
  const backdrop = root?.querySelector<HTMLElement>('[data-drawer-backdrop]');
  if (!root || !sidebar || !inner || !toggle || !close || !backdrop) return;

  const desktop = window.matchMedia(DESKTOP);
  let open = false;
  let inerted: HTMLElement[] = [];

  // Every element outside the sidebar: the siblings of the sidebar and of each of its ancestors.
  const outside = (): HTMLElement[] => {
    const list: HTMLElement[] = [];
    for (let node: HTMLElement = sidebar; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling !== backdrop && sibling instanceof HTMLElement && !sibling.inert) list.push(sibling);
      }
    }
    return list;
  };

  const setOpen = (next: boolean, returnFocus = true) => {
    if (next === open) return;
    open = next;
    sidebar.toggleAttribute('data-open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      inerted = outside();
      for (const el of inerted) el.inert = true;
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      (sidebar.querySelector<HTMLElement>('[data-section-button][aria-current="true"]') ?? close).focus();
    } else {
      for (const el of inerted) el.inert = false;
      inerted = [];
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (returnFocus) toggle.focus();
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') setOpen(false);
    if (event.key !== 'Tab') return;
    const controls = [...sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter((el) =>
      el.checkVisibility(),
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !sidebar.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !sidebar.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
  // Runs after the demo's own handler, so the section has already changed and been announced.
  for (const button of sidebar.querySelectorAll('[data-section-button]')) {
    button.addEventListener('click', () => {
      if (open) setOpen(false);
    });
  }

  const fit = () => {
    if (desktop.matches && open) setOpen(false, false);
    const fits = desktop.matches && inner.getBoundingClientRect().height <= window.innerHeight;
    root.classList.toggle('sidebar-sticky', fits);
  };
  new ResizeObserver(fit).observe(inner);
  window.addEventListener('resize', fit);
  desktop.addEventListener('change', fit);

  close.hidden = false;
  root.classList.add('has-drawer');
  fit();
}
