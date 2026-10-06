// "Who we serve" photo collage on Home ([data-collage]).
//
// Default (no JavaScript, small screens, reduced motion, or too little height): an ordinary
// image-led grid in which every audience shows its photo, name and description.
//
// Enhanced (.is-collage, from 64rem when the whole collage fits below the header): the seven
// photos form a tilted collage. Each photo carries a "View details" button; activating it by
// click, Enter or Space selects that audience and shows its description in the stable area
// beside the collage (a polite live region). Labels stay upright: only the photo frames tilt.
//
// Motion follows ordinary vertical scrolling: no wheel, touch or key events are captured and
// nothing moves on its own. The collage's position in the viewport gives a progress value
// (--p, −1…1) that tilts and drifts the photos slightly. While focus is inside the collage or the
// description (which includes a just-selected audience) the motion pauses. On resuming, the
// difference between the frozen value and the page position is kept as an offset, so the collage
// continues from where it stopped instead of jumping; the offset is dropped whenever the collage
// is off screen, where no one can see the change.
// Switching between collage and grid keeps the content the visitor is looking at in place
// (stable-position.ts). Re-evaluated on resize, font loading, text-size changes (the layout's size changes) and
// reduced-motion changes. If a "View details" button has focus when the collage becomes the
// static grid, focus first moves to that audience's heading (focusable by script only, not a
// Tab stop) and the heading and description are scrolled clear of the sticky header, so focus
// never falls to the page. Focus anywhere else is left alone.

import { withStablePosition } from './stable-position.ts';

const DESKTOP = '(min-width: 64rem)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function initCollage(): void {
  const section = document.querySelector<HTMLElement>('[data-collage]');
  const stage = section?.querySelector<HTMLElement>('[data-collage-stage]');
  const detail = section?.querySelector<HTMLElement>('[data-collage-detail]');
  const detailLabel = detail?.querySelector<HTMLElement>('[data-detail-label]');
  const detailText = detail?.querySelector<HTMLElement>('[data-detail-text]');
  const layout = stage?.parentElement;
  if (!section || !stage || !detail || !detailLabel || !detailText || !layout) return;
  const buttons = [...section.querySelectorAll<HTMLButtonElement>('[data-audience-select]')];

  const desktop = window.matchMedia(DESKTOP);
  const reducedMotion = window.matchMedia(REDUCED_MOTION);
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  let enabled = false;
  let paused = false;
  let progress = 0;
  let offset = 0;
  let frame = 0;

  const clamp = (value: number) => Math.min(Math.max(value, -1), 1);
  // 0 when the collage is centred in the viewport; ±1 half a viewport above or below (unclamped).
  const pagePosition = () => {
    const box = stage.getBoundingClientRect();
    return ((window.innerHeight / 2 - (box.top + box.height / 2)) / window.innerHeight) * 2;
  };
  const onScreen = () => {
    const box = stage.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  };
  const apply = () => stage.style.setProperty('--p', progress.toFixed(4));

  const update = () => {
    frame = 0;
    if (!enabled || paused) return;
    if (!onScreen()) offset = 0;
    progress = clamp(pagePosition() + offset);
    apply();
  };

  const select = (button: HTMLButtonElement) => {
    const item = button.closest<HTMLElement>('[data-audience]');
    if (!item) return;
    for (const other of buttons) {
      const selected = other === button;
      other.setAttribute('aria-pressed', String(selected));
      other.closest('[data-audience]')?.classList.toggle('is-selected', selected);
    }
    detailLabel.textContent = item.querySelector('[data-audience-label]')?.textContent ?? '';
    detailText.textContent = item.querySelector('[data-audience-need]')?.textContent ?? '';
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      select(button);
      button.focus(); // Some browsers do not focus buttons on click; focus keeps the motion paused.
    });
  }

  layout.addEventListener('focusin', () => {
    paused = true;
  });
  layout.addEventListener('focusout', (event) => {
    if (layout.contains(event.relatedTarget as Node | null)) return;
    paused = false;
    offset = progress - pagePosition();
  });

  /** Scrolls so the element sits below the sticky header and, where it fits, inside the viewport. */
  const keepInView = (element: HTMLElement) => {
    const top = (header?.getBoundingClientRect().bottom ?? 0) + 16;
    const box = element.getBoundingClientRect();
    if (box.top < top || box.bottom > window.innerHeight) window.scrollBy({ top: box.top - top, behavior: 'instant' });
  };

  const evaluate = () => {
    const focusedButton = buttons.find((button) => button === document.activeElement && !button.hidden);
    const item = focusedButton?.closest<HTMLElement>('[data-audience]');
    const heading = item?.querySelector<HTMLElement>('[data-audience-label]');
    const moveFocusFromButton = () => {
      if (!item || !heading) return;
      // Move focus before hiding the button; the heading stops being focusable once left.
      heading.tabIndex = -1;
      heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
      heading.focus({ preventScroll: true });
    };
    const wasEnabled = enabled;
    withStablePosition(section, () => {
      section.classList.remove('is-collage');
      enabled = false;
      if (desktop.matches && !reducedMotion.matches) {
        section.classList.add('is-collage');
        const available = window.innerHeight - (header?.getBoundingClientRect().height ?? 0);
        enabled = layout.getBoundingClientRect().height <= available;
        if (!enabled) section.classList.remove('is-collage');
      }
      // Buttons and the detail area also change the section's height.
      if (!enabled) moveFocusFromButton();
      for (const button of buttons) button.hidden = !enabled;
      detail.hidden = !enabled;
    });
    if (enabled && wasEnabled) apply(); // Still a collage: keep the current (possibly paused) position.
    else if (enabled) {
      paused = layout.contains(document.activeElement);
      offset = 0;
      progress = clamp(pagePosition());
      apply();
    } else stage.style.removeProperty('--p');
    const text = item?.querySelector<HTMLElement>('.audience-text');
    if (!enabled && text && document.activeElement === heading) {
      keepInView(text);
      // Other sections (e.g. the capability showcase) may change height in the same frame.
      requestAnimationFrame(() => {
        if (document.activeElement === heading) keepInView(text);
      });
    }
  };

  let resizeFrame = 0;
  const reevaluate = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(evaluate);
  };

  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', reevaluate);
  desktop.addEventListener('change', reevaluate);
  reducedMotion.addEventListener('change', reevaluate);
  void document.fonts?.ready.then(reevaluate);
  // Catches a changed browser text size, which fires no resize or media-query event. Re-evaluating
  // gives the same result for the same conditions, so this settles after one round.
  new ResizeObserver(reevaluate).observe(layout);
  evaluate();
}
