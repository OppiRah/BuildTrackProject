// Mobile navigation disclosure. Without JavaScript the links stay visible.

/** Must match the desktop header media query in Header.astro. */
const DESKTOP_NAV_QUERY = '(min-width: 75rem)';

export function initNav(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  const toggle = header?.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const nav = header?.querySelector<HTMLElement>('#site-nav');
  if (!header || !toggle || !nav) return;

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.toggleAttribute('data-open', open);
  };

  header.classList.add('js-nav');
  toggle.hidden = false;

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    toggle.focus();
  });

  window.matchMedia(DESKTOP_NAV_QUERY).addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}
