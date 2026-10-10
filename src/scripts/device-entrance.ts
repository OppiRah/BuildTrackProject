// Static, uncropped screens are always the baseline. Only the media frames animate.
export function initDeviceEntrance(): void {
  const figure = document.querySelector<HTMLElement>('[data-device-entrance]');
  const stage = figure?.querySelector<HTMLElement>('.device-stage');
  const laptop = figure?.querySelector<HTMLElement>('.laptop');
  const phone = figure?.querySelector<HTMLElement>('.phone');
  if (!stage || !laptop || !phone || !('IntersectionObserver' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  let animations: Animation[] = [];
  let finished = false;
  const settle = () => {
    finished = true;
    observer.disconnect();
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  const observer = new IntersectionObserver(entries => {
    if (finished || !entries.some(entry => entry.isIntersecting)) return;
    finished = true;
    observer.disconnect();
    const timing = { easing: 'cubic-bezier(.2,.7,.2,1)' };
    animations = [
      laptop.animate([
        { opacity: 0, transform: 'translate(-18px, 44px) rotate(-3deg) scale(.94)' },
        { opacity: 1, transform: 'none' },
      ], { ...timing, duration: 780 }),
      phone.animate([
        { opacity: 0, transform: 'translate(38px, 30px) rotate(5deg) scale(.92)' },
        { opacity: 1, transform: 'none' },
      ], { ...timing, duration: 960, delay: 280, fill: 'backwards' }),
    ];
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      for (const animation of animations) animation.cancel();
      animations = [];
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
  reduced.addEventListener('change', () => { if (reduced.matches) settle(); });
  observer.observe(stage);
}
