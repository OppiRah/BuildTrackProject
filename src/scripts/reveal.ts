// Home entrance motion: the hero entrance (CSS) and one-time reveals for [data-reveal] blocks.
//
// Content is visible by default. The hidden starting state of a reveal applies only once
// this script has finished setting up (html.reveal-ready), never under reduced motion, and
// never to blocks already on screen or above it. Focus moving into a block that is hidden or
// still fading in shows it at once, so keyboard focus never lands on invisible content.
//
// html.entrance-done ends the CSS hero entrance once it has finished or been cancelled, so it
// never replays. Turning on reduced motion while the page is open cancels the entrance and
// shows every pending block at once; turning it off again replays nothing.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function initReveal(): void {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia(REDUCED_MOTION);
  const settleEntrance = () => root.classList.add('entrance-done');

  const heroAnimations = document.querySelector('.hero-copy')?.getAnimations({ subtree: true }) ?? [];
  if (heroAnimations.length === 0) settleEntrance();
  else void Promise.allSettled(heroAnimations.map((animation) => animation.finished)).then(settleEntrance);

  if (!('IntersectionObserver' in window) || reducedMotion.matches) {
    reducedMotion.addEventListener('change', settleEntrance);
    return;
  }
  const blocks = document.querySelectorAll<HTMLElement>('[data-reveal]');

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  function reveal(block: Element, instant = false): void {
    if (instant) {
      // Cancels any running fade so the block is fully shown now, then restores normal
      // (hover/focus) transitions once that state has been rendered.
      block.classList.add('reveal-instant');
      requestAnimationFrame(() => requestAnimationFrame(() => block.classList.remove('reveal-instant')));
    }
    block.classList.add('is-revealed');
    observer.unobserve(block);
  }

  for (const block of blocks) {
    if (block.getBoundingClientRect().top < window.innerHeight) block.classList.add('is-revealed');
    else observer.observe(block);
  }

  document.addEventListener('focusin', (event) => {
    const block = (event.target as Element | null)?.closest('[data-reveal]');
    if (block && (!block.classList.contains('is-revealed') || block.getAnimations({ subtree: true }).length > 0)) {
      reveal(block, true);
    }
  });

  reducedMotion.addEventListener('change', () => {
    settleEntrance();
    if (!reducedMotion.matches) return;
    for (const block of blocks) if (!block.classList.contains('is-revealed')) reveal(block, true);
    observer.disconnect();
  });

  root.classList.add('reveal-ready');
}
