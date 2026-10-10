// Optional stock playback. Posters are the HTML baseline; no video URL is
// assigned until an eligible desktop scene approaches the viewport.
type Connection = EventTarget & { saveData?: boolean };

export function initAudienceVideos(section: HTMLElement) {
  const control = section.querySelector<HTMLButtonElement>('[data-audience-video-toggle]');
  const status = section.querySelector<HTMLElement>('[data-audience-video-status]');
  if (!control || !status || !document.createElement('video').canPlayType('video/mp4')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const clips = [...section.querySelectorAll<HTMLElement>('[data-audience-video-src]')].map(frame => ({
    frame, video: null as HTMLVideoElement | null, failed: false, pending: false, ticket: 0,
    callback: 0,
  }));
  let eligible = false, near = false, visible = false, pausedByUser = false, refused = false;
  control.hidden = false;
  const permitted = () => eligible && !reduced.matches && !connection?.saveData;
  const wanted = () => permitted() && visible && !document.hidden && !pausedByUser && !refused;
  const updateControl = () => {
    control.textContent = pausedByUser || refused || !permitted() ? 'Play videos' : 'Pause videos';
    control.setAttribute('aria-disabled', String(!permitted() || clips.every(clip => clip.failed)));
    const failures = clips.filter(clip => clip.failed).length;
    status.textContent = !permitted() ? 'Still images shown.' : refused ? 'Playback paused. Press Play to try again.'
      : failures ? `${failures} ${failures === 1 ? 'video is' : 'videos are'} unavailable; still images remain.` : '';
  };
  const pause = (clip: typeof clips[number], unload = false) => {
    clip.ticket++;
    clip.pending = false;
    const video = clip.video;
    if (!video) return;
    if (clip.callback) video.cancelVideoFrameCallback(clip.callback);
    clip.callback = 0;
    video.pause();
    if (unload) {
      clip.frame.classList.remove('is-video-playing');
      video.removeAttribute('src');
      video.load(); // Abort a pending fetch/play before a live preference change settles.
      video.remove();
      clip.video = null;
    }
  };
  const fail = (clip: typeof clips[number]) => {
    clip.failed = true;
    pause(clip, true);
    updateControl();
  };
  const sync = () => {
    if (!permitted()) {
      clips.forEach(clip => pause(clip, true));
      updateControl();
      return;
    }
    for (const clip of clips) {
      if (clip.failed) continue;
      if (!clip.video && near && !document.hidden && !pausedByUser && !refused) {
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('aria-hidden', 'true');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        clip.video = video;
        video.addEventListener('error', () => { if (clip.video === video) fail(clip); });
        video.addEventListener('playing', () => {
          if (!wanted() || clip.video !== video) { video.pause(); return; }
          // Show pixels only after the decoder has delivered a frame, rather
          // than replacing the poster on a resolved play promise.
          if (typeof video.requestVideoFrameCallback === 'function') {
            clip.callback = video.requestVideoFrameCallback(() => {
              clip.callback = 0;
              if (wanted() && clip.video === video) clip.frame.classList.add('is-video-playing');
            });
          } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            clip.frame.classList.add('is-video-playing');
          }
        });
        video.src = clip.frame.dataset.audienceVideoSrc!;
        clip.frame.append(video);
      }
      const video = clip.video;
      if (!video) continue;
      if (!wanted()) { pause(clip); continue; }
      if (!video.paused || clip.pending) continue;
      const ticket = ++clip.ticket;
      clip.pending = true;
      void video.play().then(() => {
        if (ticket !== clip.ticket || clip.video !== video) return;
        clip.pending = false;
        if (!wanted()) video.pause();
      }).catch((error: unknown) => {
        if (ticket !== clip.ticket || clip.video !== video) return;
        clip.pending = false;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          refused = true;
          clips.forEach(item => { pause(item); item.frame.classList.remove('is-video-playing'); });
          updateControl();
        } else fail(clip);
      });
    }
    updateControl();
  };
  control.addEventListener('click', () => {
    if (control.getAttribute('aria-disabled') === 'true') return;
    pausedByUser = !(pausedByUser || refused);
    if (!pausedByUser) refused = false;
    sync();
  });
  // These listeners run synchronously, independent of the orbit's RAF measure.
  reduced.addEventListener('change', sync);
  connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  const nearObserver = new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting);
    sync();
  }, { rootMargin: '700px 0px' });
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    sync();
  });
  // Observe the actual stage, not the long scroll track after the stage releases.
  const shell = section.querySelector('[data-orbit-shell]')!;
  nearObserver.observe(shell);
  visibilityObserver.observe(shell);
  updateControl();
  return { setEligible(value: boolean) { eligible = value; sync(); } };
}
