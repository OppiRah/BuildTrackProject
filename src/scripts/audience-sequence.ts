// One native-scroll timeline. Media sizes are measured per layout, never solved per frame.
import { withStablePosition } from './stable-position.ts';
import { audienceFinalAngle, createAudienceComposition } from '../lib/audience-composition.ts';
import { initAudienceVideos } from './audience-videos.ts';

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const weights = [1.02, 0.59, 1.33, 0.93, 0.93, 1.33, 0.92];

export function initAudienceSequence(): void {
  const section = document.querySelector<HTMLElement>('[data-audience-orbit]');
  const track = section?.querySelector<HTMLElement>('[data-orbit-scroll]');
  const shell = section?.querySelector<HTMLElement>('[data-orbit-shell]');
  const art = section?.querySelector<HTMLElement>('[data-orbit-art]');
  const arrangement = section?.querySelector<HTMLElement>('[data-orbit-arrangement]');
  const heading = section?.querySelector<HTMLElement>('[data-orbit-heading]');
  const foot = section?.querySelector<HTMLElement>('[data-orbit-foot]');
  if (!section || !track || !shell || !art || !arrangement || !heading || !foot) return;
  const anchors = [...arrangement.querySelectorAll<HTMLElement>('[data-orbit-photo]')];
  const labels = [...arrangement.querySelectorAll<HTMLElement>('[data-audience-label]')];
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
  const playback = initAudienceVideos(section);
  for (const img of arrangement.querySelectorAll<HTMLImageElement>('img')) {
    const fail = () => {
      img.hidden = true;
      const message = img.parentElement?.querySelector<HTMLElement>('.orbit-photo-error');
      if (message) message.hidden = false;
    };
    img.addEventListener('error', fail);
    if (img.complete && !img.naturalWidth) fail();
  }
  // Load the small approved posters before the sticky scene enters, rather than
  // waiting for each transformed rectangle to meet the browser's lazy threshold.
  const preload = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    for (const img of arrangement.querySelectorAll<HTMLImageElement>('img')) img.loading = 'eager';
    preload.disconnect();
  }, { rootMargin: '800px 0px' });
  preload.observe(section);

  let enabled = false, top = 0, motion = 1, fade = 1;
  let positions = (_turn: number) => anchors.map(() => ({ x: 0, y: 0 }));
  let bottomGrowth: { index: number; width: number; grownWidth: number; x: number; y: number }[] = [];
  let fit = 1, lastDistance = -1, lastSize = '';
  let scrollFrame = 0, resizeFrame = 0;
  const render = (distance: number) => {
    const progress = clamp(distance / motion);
    const turn = audienceFinalAngle * ease((progress - 0.06) / 0.88);
    const scale = 0.54 + 0.46 * ease(progress);
    const theta = turn * Math.PI / 180;
    arrangement.style.setProperty('--orbit-angle', `${turn}deg`);
    arrangement.style.setProperty('--orbit-counterangle', `${-turn}deg`);
    arrangement.style.setProperty('--orbit-scale', String(scale));
    arrangement.style.setProperty('--orbit-entry', `${32 * (1 - ease(progress / 0.14))}px`);
    arrangement.style.setProperty('--orbit-titles', String(ease((distance - motion) / fade)));
    const points = positions(turn);
    // The turn settles at 94%; grow only the lower pair during the remaining
    // shared expansion, reaching their new full frames before titles reveal.
    const growth = ease((progress - 0.94) / 0.06);
    for (const bottom of bottomGrowth) {
      const point = points[bottom.index]!;
      point.x += (bottom.x - point.x) * growth;
      point.y += (bottom.y - point.y) * growth;
      anchors[bottom.index]!.style.setProperty('--photo-width', `${(bottom.width + (bottom.grownWidth - bottom.width) * growth) * fit}px`);
    }
    anchors.forEach((anchor, i) => {
      const x = points[i]!.x * fit, y = points[i]!.y * fit;
      anchor.style.setProperty('--photo-x', `${x * Math.cos(theta) + y * Math.sin(theta)}px`);
      anchor.style.setProperty('--photo-y', `${-x * Math.sin(theta) + y * Math.cos(theta)}px`);
    });
  };
  const update = () => {
    scrollFrame = 0;
    if (!enabled) return;
    const distance = Math.max(0, top - track.getBoundingClientRect().top);
    const next = labels.includes(document.activeElement as HTMLElement) ? Math.max(distance, motion + fade) : distance;
    if (next === lastDistance) return;
    lastDistance = next;
    render(next);
  };
  const revealFocus = () => {
    if (!enabled || !labels.includes(document.activeElement as HTMLElement)) return;
    window.scrollBy({ top: track.getBoundingClientRect().top - top + motion + fade, behavior: 'instant' });
    update();
  };
  section.addEventListener('focusin', revealFocus);
  section.addEventListener('focusout', () => requestAnimationFrame(update));

  const measure = () => {
    resizeFrame = 0;
    const font = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const available = innerHeight - headerHeight;
    const size = [innerWidth, innerHeight, font, headerHeight, shell.clientWidth,
      heading.offsetHeight, foot.offsetHeight, reduced.matches, connection?.saveData].join('|');
    if (size === lastSize) return;
    lastSize = size;
    const wasEnabled = enabled;
    const active = document.activeElement instanceof HTMLElement && section.contains(document.activeElement)
      ? document.activeElement : undefined;
    const anchor = active ?? labels.find(label => {
      const rect = label.getBoundingClientRect();
      return rect.top >= headerHeight && rect.top < innerHeight * 0.8;
    });
    const before = anchor?.getBoundingClientRect().top;
    const viewing = track.getBoundingClientRect().top < innerHeight * 0.65 && track.getBoundingClientRect().bottom > headerHeight;
    const artEstimate = available - heading.offsetHeight - foot.offsetHeight - 3.5 * font;
    enabled = !reduced.matches && !connection?.saveData && innerWidth >= 1024 && font <= 20
      && shell.clientWidth >= 58 * font && artEstimate >= 440;
    withStablePosition(section, () => {
      section.classList.toggle('is-orbit', enabled);
      if (enabled) {
        top = headerHeight;
        motion = Math.round(Math.min(1250, available * 1.4));
        fade = Math.round(Math.min(180, available * 0.22));
        const hold = Math.round(Math.min(260, available * 0.3));
        section.style.setProperty('--orbit-top', `${top}px`);
        section.style.setProperty('--orbit-height', `${available}px`);
        track.style.height = `${available + motion + fade + hold}px`;
        track.dataset.motionTravel = String(motion);
        track.dataset.titleTravel = String(fade);
        track.dataset.holdTravel = String(hold);
        const sizes = anchors.map((element, i) => {
          const img = element.querySelector<HTMLImageElement>('img')!;
          const ratio = Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
          // Comparable media area, with restrained size variation; dimensions
          // remain fixed throughout the turn, including portrait candidates.
          const width = 340 * weights[i]! * Math.sqrt(ratio / (16 / 9));
          return { width, height: width / ratio };
        });
        // Titles retain their readable CSS size while the media fit the stage.
        // Reserve the centre title's height and the outer side captions once
        // per layout; scrolling still only interpolates the precomputed poses.
        const titleSpace = 7.5 * font + 24;
        // Retain the approved four-line clearance so widening only the title
        // cannot resize or reposition the videos anywhere along the sequence.
        const belowTitleSpace = Math.round(4 * parseFloat(getComputedStyle(labels[0]!).lineHeight) + 0.3 * font + 2) + 24;
        fit = 1;
        let centreY = 0;
        for (let pass = 0; pass < 4; pass++) {
          positions = createAudienceComposition(sizes, belowTitleSpace / fit);
          const final = positions(audienceFinalAngle);
          const upper = Math.min(...final.map((point, i) => point.y - sizes[i]!.height / 2));
          const lower = Math.max(...final.map((point, i) => point.y + sizes[i]!.height / 2));
          centreY = (upper + lower) / 2;
          let extentX = 0, extentY = 0;
          // Fit the entire sequence, not just its final bounding box. Preserve the
          // approved shared growth curve and scroll distances.
          for (let sample = 0; sample <= 240; sample++) {
            const progress = sample / 240;
            const turn = audienceFinalAngle * ease((progress - 0.06) / 0.88);
            const scale = 0.54 + 0.46 * ease(progress);
            positions(turn).forEach((point, i) => {
            extentX = Math.max(extentX, (Math.abs(point.x) + sizes[i]!.width / 2) * scale);
            extentY = Math.max(extentY, Math.abs(point.y * scale - centreY) + sizes[i]!.height / 2 * scale);
            });
          }
          fit = Math.min((art.clientWidth - 32 - titleSpace * 2) / (extentX * 2), (art.clientHeight - 32) / (extentY * 2));
          arrangement.style.setProperty('--orbit-layout-x', '0px');
        }
        // Use the approved fit and bottom edge. The two lower frames grow up
        // into the spare title clearance without resizing the top/middle rows.
        const bottomPose = positions(audienceFinalAngle);
        const bottomEdge = bottomPose[1]!.y + sizes[1]!.height / 2;
        const titleHeight = labels[0]!.parentElement!.offsetHeight;
        const bottomHeight = bottomEdge - sizes[0]!.height / 2 - (2 * font + titleHeight + font) / fit;
        const portraitWidth = bottomHeight * sizes[1]!.width / sizes[1]!.height;
        const landscapeWidth = bottomHeight * sizes[6]!.width / sizes[6]!.height;
        const gap = 0.025 * sizes[0]!.width;
        bottomGrowth = [
          { index: 1, width: sizes[1]!.width, grownWidth: portraitWidth,
            x: -(landscapeWidth + gap) / 2, y: bottomEdge - bottomHeight / 2 },
          { index: 6, width: sizes[6]!.width, grownWidth: landscapeWidth,
            x: (portraitWidth + gap) / 2, y: bottomEdge - bottomHeight / 2 },
        ];
        anchors.forEach((element, i) => element.style.setProperty('--photo-width', `${sizes[i]!.width * fit}px`));
        arrangement.style.setProperty('--orbit-caption-offset', `${centreY * fit}px`);
        lastDistance = -1;
        update();
      } else {
        track.style.removeProperty('height');
        track.removeAttribute('data-motion-travel');
        track.removeAttribute('data-title-travel');
        track.removeAttribute('data-hold-travel');
      }
    });
    playback?.setEligible(enabled);
    if (enabled !== wasEnabled) {
      if (active && enabled && labels.includes(active)) revealFocus();
      else if (anchor && before !== undefined && viewing) {
        window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: 'instant' });
      } else if (viewing) window.scrollBy({ top: heading.getBoundingClientRect().top - headerHeight - 16, behavior: 'instant' });
      if (active) {
        const rect = active.getBoundingClientRect();
        if (rect.top < headerHeight + 12 || rect.bottom > innerHeight)
          window.scrollBy({ top: rect.top - headerHeight - 16, behavior: 'instant' });
      }
    }
  };
  const reevaluate = () => { if (!resizeFrame) resizeFrame = requestAnimationFrame(measure); };
  addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', reevaluate);
  reduced.addEventListener('change', reevaluate);
  connection?.addEventListener('change', reevaluate);
  const observer = new ResizeObserver(reevaluate);
  observer.observe(shell);
  observer.observe(heading);
  observer.observe(foot);
  observer.observe(document.documentElement);
  if (header) observer.observe(header);
  void document.fonts.ready.then(reevaluate);
  measure();
}

