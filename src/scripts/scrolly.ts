// Desktop scroll-driven capability showcase ([data-scrolly]).
//
// The page keeps native scrolling: no wheel, touch or key events are captured. When enabled
// (.is-scrolly) the section is made taller by exactly the track's horizontal travel, its
// inner block sticks below the site header, and the document's scroll position inside the
// section is mapped 1:1 to the track's horizontal offset. Scrolling up reverses it; at the end
// the last panel is fully visible and the section releases into the next one.
//
// Enabled only from 64rem, without reduced motion, and only when the sticky block fits the
// space below the header (short windows and enlarged text fall back). Otherwise, and without
// JavaScript, the panels are an ordinary vertical stack. Focus moving to a panel jumps the page
// (instantly) to the position where that panel is fully shown, so keyboard users never land on
// an off-screen link.
//
// Re-evaluated on resize, font loading, preference changes and whenever the rendered sizes it
// depends on change: a ResizeObserver watches the header, the pinned content and the track, so a
// browser text-size change (which fires no resize or media-query event) re-measures available
// height, eligibility and travel. Callbacks whose measured sizes match the last evaluation are
// skipped, which also absorbs the one notification caused by the evaluation's own layout switch,
// so there is no feedback loop. An enabled layout is re-measured in place, not torn down, and
// switching layout keeps the content the visitor is looking at in place (stable-position.ts). After each evaluation a focused panel link is kept visible: in the pinned
// layout by moving to that panel's position, in the stack by revealing it below the header;
// this happens only when the layout changed (pinned/stacked, travel or header height).

import { withStablePosition } from './stable-position.ts';

const DESKTOP = '(min-width: 64rem)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function initScrolly(): void {
  const section = document.querySelector<HTMLElement>('[data-scrolly]');
  const sticky = section?.querySelector<HTMLElement>('[data-scrolly-sticky]');
  const content = section?.querySelector<HTMLElement>('[data-scrolly-content]');
  const viewport = section?.querySelector<HTMLElement>('[data-scrolly-viewport]');
  const track = section?.querySelector<HTMLElement>('[data-scrolly-track]');
  if (!section || !sticky || !content || !viewport || !track) return;

  const desktop = window.matchMedia(DESKTOP);
  const reducedMotion = window.matchMedia(REDUCED_MOTION);
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  let enabled = false;
  let travel = 0;
  let headerHeight = 0;
  let frame = 0;
  let measured = '';

  const sectionTop = () => section.getBoundingClientRect().top + window.scrollY;

  const position = () => {
    frame = 0;
    if (!enabled) return;
    const progress = Math.min(Math.max(window.scrollY + headerHeight - sectionTop(), 0), travel);
    track.style.transform = `translate3d(${-progress}px, 0, 0)`;
  };

  /** The rendered sizes an evaluation depends on. */
  const sizes = () =>
    [
      window.innerWidth,
      window.innerHeight,
      header?.getBoundingClientRect().height ?? 0,
      content.getBoundingClientRect().height,
      track.offsetWidth,
      viewport.clientWidth,
    ].join(',');

  const disable = () => {
    enabled = false;
    section.classList.remove('is-scrolly');
    section.style.removeProperty('height');
    track.style.removeProperty('transform');
  };

  const focusedPanel = () =>
    [...track.children].find((child) => child.contains(document.activeElement)) as HTMLElement | undefined;

  /** Pinned: scrolls to where the panel is fully shown. */
  const showPanel = (panel: HTMLElement) => {
    const inset = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const offset = Math.min(Math.max(panel.offsetLeft - inset, 0), travel);
    window.scrollTo({ top: sectionTop() - headerHeight + offset, behavior: 'instant' });
    position();
  };

  /** Stacked: scrolls the element below the header if it is hidden by it or off screen. */
  const revealBelowHeader = (element: HTMLElement) => {
    const top = (header?.getBoundingClientRect().bottom ?? 0) + 16;
    const box = element.getBoundingClientRect();
    if (box.top < top || box.bottom > window.innerHeight) window.scrollBy({ top: box.top - top, behavior: 'instant' });
  };

  const keepFocusVisible = () => {
    const panel = focusedPanel();
    if (!panel) return;
    if (enabled) showPanel(panel);
    else revealBelowHeader(document.activeElement as HTMLElement);
  };

  const evaluate = () => {
    const before = [enabled, travel, headerHeight].join();
    withStablePosition(section, () => {
      let fits = false;
      if (desktop.matches && !reducedMotion.matches) {
        section.classList.add('is-scrolly');
        headerHeight = header?.getBoundingClientRect().height ?? 0;
        travel = Math.ceil(track.offsetWidth - viewport.clientWidth);
        fits = travel > 0 && content.getBoundingClientRect().height <= sticky.clientHeight;
      }
      if (fits) {
        enabled = true;
        const height = `${sticky.clientHeight + travel}px`;
        if (section.style.height !== height) section.style.height = height;
        position();
      } else disable();
    });
    measured = sizes();
    // Only when the layout itself changed, so an unrelated re-measure never pulls the page back.
    if (focusedPanel() && [enabled, travel, headerHeight].join() !== before) {
      keepFocusVisible();
      // Sections above may still change height in this frame (e.g. text reflow).
      requestAnimationFrame(keepFocusVisible);
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(position);
  };

  let resizeFrame = 0;
  const reevaluate = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(evaluate);
  };

  track.addEventListener('focusin', (event) => {
    if (!enabled) return;
    const panel = [...track.children].find((child) => child.contains(event.target as Node)) as HTMLElement | undefined;
    if (!panel) return;
    showPanel(panel);
    // A script's element.focus() scrolls the element into view after this handler; reapply.
    requestAnimationFrame(() => {
      if (enabled && panel.contains(document.activeElement)) showPanel(panel);
    });
  });

  const observer = new ResizeObserver(() => {
    if (sizes() !== measured) reevaluate();
  });
  for (const element of [header, content, track]) if (element) observer.observe(element);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', reevaluate);
  desktop.addEventListener('change', reevaluate);
  reducedMotion.addEventListener('change', reevaluate);
  void document.fonts?.ready.then(reevaluate);
  evaluate();
}
