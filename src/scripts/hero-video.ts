// Background video for the Home hero.
//
// The still image is always in the page and is all that shows without JavaScript. The
// video element is created only when wanted: automatically on wider screens when reduced
// motion and data saving are off, otherwise only when the visitor presses Play. If the
// browser cannot play MP4 the control stays hidden; if loading fails the control says the
// video is unavailable; if autoplay is refused it offers Play. The still stays visible in
// every one of these cases.
//
// The reduced-motion preference is followed while the page is open: turning it on pauses
// automatic playback at once, including playback still loading; turning it off resumes autoplay
// only if the visitor has not used the control. A visitor's own Play or Pause is never
// overridden. The control reflects the latest request (Pause while playback is loading), and
// each play() result is ignored once a newer Play or Pause has replaced that request, so a
// late response cannot undo a cancellation or a newer choice.

const SMALL_SCREEN = '(max-width: 47.99rem)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

type VideoState = 'paused' | 'playing' | 'unavailable';

const labels: Record<VideoState, string> = {
  paused: 'Play background video',
  playing: 'Pause background video',
  unavailable: 'Background video unavailable',
};

export function initHeroVideo(): void {
  const media = document.querySelector<HTMLElement>('[data-hero-media]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-video-toggle]');
  const label = toggle?.querySelector<HTMLElement>('[data-video-label]');
  const src = media?.dataset.videoSrc;
  if (!media || !toggle || !label || !src) return;
  if (document.createElement('video').canPlayType('video/mp4') === '') return;

  let video: HTMLVideoElement | null = null;
  let state: VideoState = 'paused';
  let visitorChose = false;
  let request = 0; // Incremented by every Play and Pause; stale play() results are ignored.
  const reducedMotion = window.matchMedia(REDUCED_MOTION);

  const setState = (next: VideoState) => {
    state = next;
    toggle.dataset.state = next;
    label.textContent = labels[next];
    toggle.setAttribute('aria-disabled', String(next === 'unavailable'));
  };

  const unavailable = () => {
    video?.remove();
    video = null;
    media.classList.remove('is-playing');
    setState('unavailable');
  };

  const play = () => {
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.setAttribute('muted', '');
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('playing', () => {
        if (state === 'playing') media.classList.add('is-playing');
      });
      video.addEventListener('error', unavailable);
      video.src = src;
      media.append(video);
    }
    const current = ++request;
    setState('playing');
    video.play().catch(() => {
      if (current === request && state !== 'unavailable') setState('paused');
    });
  };

  const pause = () => {
    request++;
    video?.pause();
    setState('paused');
  };

  toggle.addEventListener('click', () => {
    if (state === 'unavailable') return;
    visitorChose = true;
    if (state === 'playing') pause();
    else play();
  });

  setState('paused');
  toggle.hidden = false;

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const autoplayAllowed = () =>
    !window.matchMedia(SMALL_SCREEN).matches && !reducedMotion.matches && !connection?.saveData;

  reducedMotion.addEventListener('change', () => {
    if (visitorChose) return;
    if (reducedMotion.matches && state === 'playing') pause();
    else if (!reducedMotion.matches && state === 'paused' && autoplayAllowed()) play();
  });

  if (autoplayAllowed()) play();
}
