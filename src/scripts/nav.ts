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

  // The header is sticky from here on and can grow past the --header-height token
  // (enlarged text wraps the wordmark). Publish its rendered height on the root for the
  // menu panel's height cap and the page's scroll-padding; the observer follows
  // resizes, font loading and wrapping.
  const desktop = window.matchMedia(DESKTOP_NAV_QUERY);
  let wasDesktop = desktop.matches;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--header-rendered', `${header.getBoundingClientRect().height}px`);
    // A browser text-size change re-evaluates the rem-based query without a `change` event.
    if (desktop.matches !== wasDesktop) switchLayout();
  }).observe(header);

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    toggle.focus();
  });

  // Enlarged or reduced text can switch between the desktop links and the Menu button while
  // a header control has focus. Keep the visitor's place: remember a header control that
  // lost focus without a new target, forget it once focus lands elsewhere or if it is still
  // visible a frame later (a deliberate blur), and hand focus to the equivalent control.
  let hiddenFocus: HTMLElement | null = null;
  document.addEventListener('focusin', () => {
    hiddenFocus = null;
  });
  header.addEventListener('focusout', (event) => {
    if (event.relatedTarget) return;
    const target = event.target as HTMLElement;
    hiddenFocus = target;
    requestAnimationFrame(() => {
      if (hiddenFocus === target && target.checkVisibility()) hiddenFocus = null;
    });
  });

  function switchLayout(): void {
    wasDesktop = desktop.matches;
    const focused = document.activeElement;
    const active = focused instanceof HTMLElement && header!.contains(focused)
      ? focused : focused === document.body ? hiddenFocus : null;
    hiddenFocus = null;
    if (wasDesktop) {
      setOpen(false);
      // The Menu button is hidden on desktop: continue from the current page's link.
      if (active === toggle) {
        (nav!.querySelector<HTMLElement>('a[aria-current="page"]') ?? nav!.querySelector<HTMLElement>('a'))?.focus();
      } else if (active && nav!.contains(active)) active.focus();
    } else if (active && nav!.contains(active)) {
      // The links collapse into the menu: open it so the same link stays visible and focused.
      setOpen(true);
      active.focus();
    } else if (active === toggle) toggle!.focus();
  }

  desktop.addEventListener('change', () => {
    if (desktop.matches !== wasDesktop) switchLayout();
  });
}
