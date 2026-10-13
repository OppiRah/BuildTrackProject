// Home capabilities, "drawn, then built" ([data-cap]).
//
// Default markup is a complete open list: every capability with its label, title, description,
// demo link and real screenshot. This script enhances it only on desktop, without reduced
// motion, at the default browser text size, and only when the pinned layout fits the space below
// the header; otherwise (and without JavaScript, or if setup throws) the list stays as it is.
//
// Enhanced (.is-drawn): the section intro scrolls normally, then the track pins below the header.
// The left column lists the four capabilities, each with its description and demo link under its
// own heading; only the active capability's description is open (the column reserves the tallest
// open state's height, so nothing beside it moves). The right column is one stage frame into which
// the four figures are moved. The page keeps native scrolling, and the scroll position inside the
// track is divided into four equal segments, one per capability; everything is a function of that
// position, so it stops when scrolling stops and scrolling up reverses it.
//
// "Drawn, then built": each figure's illustrative layout drawing is split into horizontal bands
// that tile the screenshot (index.astro). Its outlines draw in one after another in reading order
// over roughly the first 40% of the segment, a few at a time; each band of the real screenshot is
// revealed by a soft top-to-bottom sweep, eased at both ends, from just before its first outline
// completes, overlapping later outlines, while its outlines and faint schematic fade. Every band is
// revealed by 75% of the segment; the exact screenshot then holds for the last quarter. The
// timings come from index.astro: each outline's start (CSS) and each band's reveal window
// (data-cap-windows). A faint copy of each drawing is there from the start, so the stage is meaningful
// before the strokes begin.
//
// Keyboard: every demo link stays in the tab order (closed descriptions have no height but are not
// hidden). Keyboard focus moving into a capability jumps the page instantly to that capability's
// hold, with transitions suppressed, so a keyboard user never waits on or scrolls through
// animation. Pointer focus (a click or Ctrl+click on the active link) never moves the page.
// Focus policy: a hidden link is never left focused. When scrolling (or a layout switch) changes
// the shown capability while a capability link has focus, focus moves to the shown capability's
// link first, without scrolling, so Enter opens what is shown. Such focus counts as engaged only
// while it is on screen at the last scroll or was just placed by the keyboard.
//
// Re-evaluated on resize, font loading, preference changes and browser text-size changes (seen
// through the header's and heading block's sizes). Switching layout keeps engaged keyboard focus
// visible; otherwise a visitor reading inside the capabilities stays on the same capability
// (pinned ↔ static), and anyone else keeps the content they are looking at in place
// (stable-position.ts). Focus the visitor has scrolled away from is never chased.

import { withStablePosition } from './stable-position.ts';

const DESKTOP = '(min-width: 64rem)';
// Enlarged browser text always gets the complete static list, even where the pinned layout would fit.
const MAX_FONT = 16;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** Keyboard jumps land here: the middle of the finished-screen hold (which starts at 0.75). */
const HOLD_POINT = 0.87;
const FADE = 0.06;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Eases in and out, so a reveal neither starts nor ends with a jump. */
const smooth = (n: number) => n * n * (3 - 2 * n);

export function initCapabilityStage(): void {
  try {
    setup();
  } catch (error) {
    // A failed start must leave the complete static list and never stop the rest of Home.
    const section = document.querySelector<HTMLElement>('[data-cap]');
    if (section) {
      section.classList.remove('is-drawn', 'is-instant');
      section.querySelector<HTMLElement>('[data-cap-track]')?.style.removeProperty('height');
      section.querySelector<HTMLElement>('.cap-text')?.style.removeProperty('min-height');
      section.querySelectorAll<HTMLElement>('[data-cap-item]').forEach((item) => {
        item.classList.remove('is-active');
        const figure = section.querySelector<HTMLElement>(`[data-cap-figure][data-for="${item.id}"]`);
        if (figure && figure.parentElement !== item) item.append(figure);
      });
      const stage = section.querySelector<HTMLElement>('[data-cap-stage]');
      if (stage) stage.hidden = true;
    }
    console.error(error);
  }
}

function setup(): void {
  const section = document.querySelector<HTMLElement>('[data-cap]');
  const track = section?.querySelector<HTMLElement>('[data-cap-track]');
  const pin = section?.querySelector<HTMLElement>('[data-cap-pin]');
  const text = section?.querySelector<HTMLElement>('.cap-text');
  const head = section?.querySelector<HTMLElement>('.cap-head');
  const stage = section?.querySelector<HTMLElement>('[data-cap-stage]');
  const frame = section?.querySelector<HTMLElement>('[data-cap-stage-frame]');
  const items = [...(section?.querySelectorAll<HTMLElement>('[data-cap-item]') ?? [])];
  if (!section || !track || !pin || !text || !head || !stage || !frame || items.length === 0) return;
  const figures = items.map((item) => item.querySelector<HTMLElement>('[data-cap-figure]')!);
  const details = items.map((item) => item.querySelector<HTMLElement>('[data-cap-detail]')!);
  if (figures.some((figure) => !figure) || details.some((detail) => !detail)) return;
  /** Each figure's band reveal windows, as fractions of its segment. */
  const windows = figures.map((figure) => (figure.dataset.capWindows ?? '').split(';').filter(Boolean).map((pair) => pair.split(',').map(Number) as [number, number]));
  const figureVars = (i: number) => ['--show', '--visible', '--caption', '--done', '--t', ...windows[i]!.map((_, k) => `--r${k}`)];

  const desktop = window.matchMedia(DESKTOP);
  const reducedMotion = window.matchMedia(REDUCED_MOTION);
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  let enabled = false;
  let broken = false;
  let segment = 0;
  let headerHeight = 0;
  let active = -1;
  /** The capability the visitor was reading at the last scroll (pinned or static), or -1 outside them.
   * Recorded on scroll because a text-size change reflows the static list before it can be measured. */
  let reading = -1;
  /** Whether focus on a capability link is part of what the visitor is doing: placed by the keyboard,
   * or on screen at the last scroll. Focus left behind after scrolling away is only retained. */
  let engaged = false;
  /** Set while this script moves focus itself, so its focusin handler does not treat it as a Tab. */
  let reconciling = false;
  /** Set during a layout switch, which must not move focus before deciding what to show. */
  let holdFocus = false;
  /** Set from a size or preference change until it has been evaluated. */
  let pending = false;
  let frameRequest = 0;
  let measured = '';
  const written = new Map<HTMLElement, string>();

  const trackTop = () => track.getBoundingClientRect().top + window.scrollY;
  const setVars = (element: HTMLElement, vars: Record<string, string | number>) => {
    const key = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
    if (written.get(element) === key) return;
    written.set(element, key);
    for (const [k, v] of Object.entries(vars)) element.style.setProperty(k, String(v));
  };

  const linkOf = (index: number) => details[index]!.querySelector<HTMLElement>('a');

  /** Shows capability `index`. Focus on another capability's link (left there while the visitor
   * scrolled, or before a layout switch) first moves to this one's link without scrolling, so a hidden
   * link is never left focused and Enter opens what is shown. */
  const reconcileFocus = (index: number) => {
    if (holdFocus || !details.some((detail, i) => i !== index && detail.contains(document.activeElement))) return;
    reconciling = true;
    linkOf(index)?.focus({ preventScroll: true });
    reconciling = false;
  };

  const setActive = (index: number) => {
    if (index === active) return;
    reconcileFocus(index);
    active = index;
    items.forEach((item, i) => item.classList.toggle('is-active', i === index));
  };

  /** Static: the capability crossing a line a third of the way down the space below the header, or -1. */
  const staticReading = () => {
    const top = header?.getBoundingClientRect().bottom ?? 0;
    const line = top + (window.innerHeight - top) / 3;
    const list = items[0]!.parentElement!.getBoundingClientRect();
    if (list.top > line || list.bottom <= line) return -1;
    return items.findLastIndex((item) => item.getBoundingClientRect().top <= line);
  };

  /** The focused capability link is on screen (below the header, inside the viewport). */
  const focusOnScreen = () => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || owner(focused) < 0) return false;
    const box = focused.getBoundingClientRect();
    return box.bottom > (header?.getBoundingClientRect().bottom ?? 0) && box.top < window.innerHeight;
  };

  /** `fromScroll`: called for a scroll event. Only then, and only when no layout change is waiting to
   * be evaluated (a reflow moves things before evaluate can see them), are the reading position and
   * focus engagement recorded. */
  const render = (fromScroll = false) => {
    frameRequest = 0;
    const record = fromScroll && !pending;
    if (!enabled) {
      if (record) {
        reading = staticReading();
        engaged = focusOnScreen();
      }
      return;
    }
    const offset = window.scrollY + headerHeight - trackTop();
    const progress = Math.min(Math.max(offset / segment, 0), items.length - 1e-4);
    const index = Math.floor(progress);
    const t = progress - index;
    setActive(index);
    if (record) {
      reading = offset >= 0 && offset < segment * items.length ? index : -1;
      engaged = focusOnScreen();
    }
    const bands = (i: number, at: number) => {
      const vars: Record<string, string | number> = { '--t': at.toFixed(4) };
      let revealed = 0;
      windows[i]!.forEach(([from, to], k) => {
        const reveal = smooth(clamp01((at - from) / (to - from)));
        vars[`--r${k}`] = reveal.toFixed(3);
        revealed += reveal;
      });
      vars['--done'] = revealed === windows[i]!.length ? 1 : 0;
      return { vars, revealed: revealed / windows[i]!.length };
    };
    let note = 1;
    figures.forEach((figure, i) => {
      if (i === index) {
        const { vars, revealed } = bands(i, t);
        note = 1 - revealed;
        setVars(figure, { '--show': index === 0 ? 1 : clamp01(t / FADE).toFixed(3), '--visible': 'visible', '--caption': 1, ...vars });
      } else if (i === index - 1 && t < FADE) {
        // The finished previous screenshot fades out while the next drawing begins.
        setVars(figure, { '--show': (1 - t / FADE).toFixed(3), '--visible': 'visible', '--caption': 0, ...bands(i, 1).vars });
      } else {
        setVars(figure, { '--show': 0, '--visible': 'hidden', '--caption': 0, ...bands(i, 0).vars });
      }
    });
    setVars(frame, { '--note': note.toFixed(3) });
  };

  const schedule = () => {
    if (!frameRequest) frameRequest = requestAnimationFrame(() => render(true));
  };

  /** Applies a state change without transitions (keyboard jumps, layout switches). */
  const instantly = (change: () => void) => {
    section.classList.add('is-instant');
    change();
    requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove('is-instant')));
  };

  const sizes = () =>
    [
      window.innerWidth,
      window.innerHeight,
      header?.getBoundingClientRect().height ?? 0,
      getComputedStyle(document.documentElement).fontSize,
      head.getBoundingClientRect().height,
      section.clientWidth,
    ].join(',');

  const restoreFigures = () => {
    figures.forEach((figure, i) => {
      if (figure.parentElement !== items[i]) items[i]!.append(figure);
      for (const k of figureVars(i)) figure.style.removeProperty(k);
    });
    frame.style.removeProperty('--note');
    written.clear();
  };

  const disable = () => {
    enabled = false;
    section.classList.remove('is-drawn');
    track.style.removeProperty('height');
    stage.hidden = true;
    text.style.removeProperty('min-height');
    restoreFigures();
    items.forEach((item) => item.classList.remove('is-active'));
    active = -1;
  };

  /** Reserves the text column's tallest height over the four open states, so opening another
   * capability's description never moves the column's neighbours. Measured on evaluation only. */
  const reserveTextHeight = () => {
    text.style.removeProperty('min-height');
    let tallest = 0;
    items.forEach((_, i) => {
      items.forEach((item, j) => item.classList.toggle('is-active', j === i));
      tallest = Math.max(tallest, text.getBoundingClientRect().height);
    });
    items.forEach((item, j) => item.classList.toggle('is-active', j === active));
    text.style.minHeight = `${Math.ceil(tallest)}px`;
  };

  /** Whether the pinned layout fits: the schedule with its tallest open description, and the stage. */
  const fits = () => {
    const room = pin.clientHeight;
    const stageHeight = stage.getBoundingClientRect().height + 40; // caption line below the frame
    return text.getBoundingClientRect().height <= room - 24 && stageHeight <= room - 24 && frame.getBoundingClientRect().width > 320;
  };

  const owner = (node: Node | null) => items.findIndex((item, i) => item.contains(node) || details[i]!.contains(node) || figures[i]!.contains(node));
  const focusedItem = () => owner(document.activeElement);

  /** Pinned: jumps to the hold of capability `index` (the finished screenshot). */
  const showItem = (index: number) => {
    window.scrollTo({ top: trackTop() - headerHeight + (index + HOLD_POINT) * segment, behavior: 'instant' });
    render();
  };

  const revealBelowHeader = (element: HTMLElement) => {
    const top = (header?.getBoundingClientRect().bottom ?? 0) + 16;
    const box = element.getBoundingClientRect();
    if (box.top < top || box.bottom > window.innerHeight) window.scrollTo({ top: window.scrollY + box.top - top, behavior: 'instant' });
  };

  /** Focus placed by the keyboard. Pointer focus is never chased: the visitor may have moved on. */
  const keyboardFocus = () => document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible');

  const keepFocusVisible = () => {
    const index = focusedItem();
    if (index < 0) return;
    if (enabled) {
      instantly(() => showItem(index));
      return;
    }
    // Static: the capability's heading with its focused link when both fit below the header.
    const focused = document.activeElement as HTMLElement;
    const room = window.innerHeight - (header?.getBoundingClientRect().bottom ?? 0) - 16;
    const both = focused.getBoundingClientRect().bottom - items[index]!.getBoundingClientRect().top <= room;
    revealBelowHeader(both ? items[index]! : focused);
  };

  const evaluate = () => {
    if (broken) return;
    const before = [enabled, segment, headerHeight].join();
    const wasEnabled = enabled;
    const readingBefore = reading;
    const engagedBefore = engaged;
    holdFocus = true;
    try {
      withStablePosition(section, () => {
        let ok = false;
        if (desktop.matches && !reducedMotion.matches && parseFloat(getComputedStyle(document.documentElement).fontSize) <= MAX_FONT) {
          if (!enabled) {
            section.classList.add('is-instant');
            section.classList.add('is-drawn');
            stage.hidden = false;
            figures.forEach((figure) => {
              figure.querySelector('img')?.setAttribute('loading', 'eager');
              frame.append(figure);
            });
          }
          headerHeight = header?.getBoundingClientRect().height ?? 0;
          reserveTextHeight();
          ok = fits();
        }
        if (ok) {
          enabled = true;
          const available = pin.clientHeight;
          // Each capability gets about a screen of scrolling (760-900 px): three quarters to draw and
          // reveal the screen, the last quarter to hold it.
          segment = Math.round(Math.min(900, Math.max(760, available * 0.95)));
          const height = `${available + segment * items.length}px`;
          if (track.style.height !== height) track.style.height = height;
          render();
        } else disable();
      });
      requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove('is-instant')));
    } catch (error) {
      // A failed start leaves the complete static list.
      holdFocus = false;
      broken = true;
      disable();
      console.error(error);
      return;
    }
    holdFocus = false;
    pending = false;
    measured = sizes();
    // Engaged keyboard focus inside this section is kept visible after any re-measure (a text-size
    // change reflows the whole page even when this layout stays the same). Focus the visitor has
    // scrolled away from, pointer focus and focus elsewhere are never chased; the capability being
    // read is kept instead, and anyone outside the section keeps their place (stable-position.ts).
    const focusHidden = () => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused || focusedItem() < 0) return false;
      const box = focused.getBoundingClientRect();
      return box.top < (header?.getBoundingClientRect().bottom ?? 0) || box.bottom > window.innerHeight;
    };
    if (focusedItem() >= 0 && keyboardFocus() && engagedBefore) {
      if ([enabled, segment, headerHeight].join() !== before || focusHidden()) {
        keepFocusVisible();
        requestAnimationFrame(() => {
          if ([enabled, segment, headerHeight].join() !== before || focusHidden()) keepFocusVisible();
        });
      }
    } else if (enabled !== wasEnabled && readingBefore >= 0) {
      // The visitor was reading a capability: show the same one in the new layout.
      if (enabled) instantly(() => showItem(readingBefore));
      else revealBelowHeader(items[readingBefore]!);
    }
    if (enabled) reconcileFocus(active);
  };

  let resizeFrame = 0;
  const reevaluate = () => {
    pending = true;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(evaluate);
  };

  section.addEventListener('focusin', (event) => {
    // Only keyboard focus jumps. A click or Ctrl+click focuses the link before navigation (or while
    // a new tab opens); moving the page then would lose the visitor's place.
    if (reconciling || !(event.target as HTMLElement).matches(':focus-visible')) return;
    const index = owner(event.target as Node);
    if (index < 0) return;
    engaged = true;
    if (!enabled) return;
    instantly(() => showItem(index));
    // A script's element.focus() scrolls the element into view after this handler; reapply.
    requestAnimationFrame(() => {
      if (enabled && owner(document.activeElement) === index) showItem(index);
    });
  });

  const observer = new ResizeObserver(() => {
    if (sizes() !== measured) reevaluate();
  });
  for (const element of [header, head]) if (element) observer.observe(element);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', reevaluate);
  desktop.addEventListener('change', reevaluate);
  reducedMotion.addEventListener('change', reevaluate);
  void document.fonts?.ready.then(reevaluate);
  evaluate();
}
