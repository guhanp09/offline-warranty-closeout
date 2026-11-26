// Scroll behaviour for the welcome page. Sections rise in as they arrive, the four route cards are dealt
// from a fanned stack into their row, and the gauge needle sweeps as the engineering section crosses the
// screen. With reduced motion everything is shown in its final place. Returns a function that stops it.

const clamp = (value) => Math.min(1, Math.max(0, value));
const ease = (value) => 1 - (1 - value) ** 3;

export function startLanding(root) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const topbar = document.querySelector('.topbar');
  const reveals = [...root.querySelectorAll('.reveal')];
  let observer;
  if (still || !('IntersectionObserver' in window)) {
    for (const section of reveals) section.classList.add('is-in');
  } else {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    for (const section of reveals) observer.observe(section);
  }

  // The big play knob shows only while the video is paused, however playback was started or stopped.
  const player = root.querySelector('.watch-player');
  const video = player?.querySelector('video');
  const syncPlayer = () => player?.classList.toggle('is-playing', Boolean(video && !video.paused));
  for (const type of ['play', 'pause', 'ended']) video?.addEventListener(type, syncPlayer);

  const cards = [...root.querySelectorAll('.route-card')];
  const row = root.querySelector('.route-cards');
  const needle = root.querySelector('.gauge-needle');
  const hood = root.querySelector('.hood');
  const wide = window.matchMedia('(min-width: 1101px)');
  let queued = false;

  function frame() {
    queued = false;
    topbar?.classList.toggle('is-scrolled', window.scrollY > 8);
    if (still) return;
    if (row && wide.matches) {
      const box = row.getBoundingClientRect();
      const dealt = ease(clamp((innerHeight - box.top) / (innerHeight * 0.7)));
      const middle = (cards.length - 1) / 2;
      cards.forEach((card, index) => {
        const offset = index - middle;
        const spread = 1 - dealt;
        card.style.transform = spread < 0.002 ? ''
          : `translate(${(-offset * box.width * 0.18 * spread).toFixed(1)}px, ${((26 + Math.abs(offset) * 18) * spread).toFixed(1)}px) rotate(${(offset * 7 * spread).toFixed(2)}deg)`;
      });
    } else {
      for (const card of cards) card.style.transform = '';
    }
    if (needle && hood) {
      const box = hood.getBoundingClientRect();
      const sweep = clamp((innerHeight - box.top) / (innerHeight + box.height * 0.5));
      needle.style.transform = `rotate(${(-74 + 128 * ease(sweep)).toFixed(1)}deg)`;
    }
  }

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  frame();

  return () => {
    window.removeEventListener('scroll', queue);
    window.removeEventListener('resize', queue);
    observer?.disconnect();
    for (const type of ['play', 'pause', 'ended']) video?.removeEventListener(type, syncPlayer);
    topbar?.classList.remove('is-scrolled');
  };
}
