// Keeps what the visitor is looking at in place while a Home section switches layout
// (src/scripts/capability-stage.ts, src/scripts/audience-sequence.ts).
//
// When a section above the visible content changes height (pinned ↔ stacked, stage ↔ list),
// the content below it would move. Chromium's scroll anchoring sometimes corrects this and
// sometimes picks an anchor inside the changing section and moves the page by hundreds of
// pixels, so the correction is made here, deterministically: if the section ends above the
// middle of the viewport (the visitor is mainly looking at what follows it), the page is
// scrolled by exactly the change in the section's height; otherwise the scroll position is
// kept. Scroll anchoring is paused for that frame so it cannot add a second correction.

export function withStablePosition(section: HTMLElement, change: () => void): void {
  const root = document.documentElement;
  const before = section.getBoundingClientRect().bottom;
  root.style.overflowAnchor = 'none';
  change();
  const after = section.getBoundingClientRect().bottom;
  if (before < window.innerHeight / 2 && after !== before) window.scrollBy({ top: after - before, behavior: 'instant' });
  requestAnimationFrame(() => requestAnimationFrame(() => root.style.removeProperty('overflow-anchor')));
}
