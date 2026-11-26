// Chip, the demo's guide: an ice cube in a field technician's hard hat. Ice for the ice machines,
// a chip for the model that runs on the device. Drawn flat, sticker style, so it needs no gradient ids
// and renders the same markup every time (the tour compares markup to avoid needless re-renders).

const ink = '#2c3e4a';
const line = '#2f6f8d';
const ice = '#d7eff9';
const iceTop = '#eef9fe';
const iceShade = '#b9dfef';
const hat = '#f08a3a';
const hatLight = '#ffb27a';
const hatDark = '#c86422';
const blush = '#ff9fae';

const moods = {
  happy: { eyes: 'dots', mouth: 'smile' },
  wave: { eyes: 'dots', mouth: 'open', arm: 'wave' },
  curious: { eyes: 'side', mouth: 'o', brows: 'raised', extra: 'question' },
  worried: { eyes: 'dots', mouth: 'wobble', brows: 'worried', extra: 'sweat' },
  focused: { eyes: 'dots', mouth: 'flat', brows: 'focused' },
  proud: { eyes: 'closed', mouth: 'grin', extra: 'sparkle' },
  alarmed: { eyes: 'wide', mouth: 'o', brows: 'raised', extra: 'alert' },
  celebrate: { eyes: 'closed', mouth: 'open', arm: 'up', extra: 'confetti' },
  calm: { eyes: 'dots', mouth: 'smile', extra: 'snow' },
};

function eyes(kind) {
  if (kind === 'closed') {
    return `<path d="M42 70q5-6 10 0M68 70q5-6 10 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (kind === 'wide') {
    return `<circle cx="47" cy="68" r="7" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="73" cy="68" r="7" fill="#fff" stroke="${ink}" stroke-width="2"/>
      <circle cx="47" cy="68.5" r="2.6" fill="${ink}"/><circle cx="73" cy="68.5" r="2.6" fill="${ink}"/>`;
  }
  const dx = kind === 'side' ? 2.2 : 0;
  const dy = kind === 'side' ? -1.5 : 0;
  return `<ellipse cx="${47 + dx}" cy="${69 + dy}" rx="4.6" ry="5.6" fill="${ink}"/><ellipse cx="${73 + dx}" cy="${69 + dy}" rx="4.6" ry="5.6" fill="${ink}"/>
    <circle cx="${48.6 + dx}" cy="${66.8 + dy}" r="1.7" fill="#fff"/><circle cx="${74.6 + dx}" cy="${66.8 + dy}" r="1.7" fill="#fff"/>`;
}

function brows(kind) {
  const paths = {
    raised: 'M40 57q6-5 12-2M68 55q6-3 12 2',
    worried: 'M41 58q6-1 11-5M68 53q5 4 11 5',
    focused: 'M41 58l11 2M68 60l11-2',
  };
  return paths[kind] ? `<path d="${paths[kind]}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>` : '';
}

function mouth(kind) {
  const shapes = {
    smile: `<path d="M53 80q7 6 14 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`,
    grin: `<path d="M51 78q9 10 18 0z" fill="${ink}"/><path d="M55 82.6q5 3 10 0" fill="none" stroke="#ff8f9e" stroke-width="2.4" stroke-linecap="round"/>`,
    open: `<path d="M52 78q8 11 16 0z" fill="${ink}"/><path d="M55.5 83q4.5 2.6 9 0" fill="none" stroke="#ff8f9e" stroke-width="2.4" stroke-linecap="round"/>`,
    o: `<ellipse cx="60" cy="81" rx="3.6" ry="4.2" fill="${ink}"/>`,
    flat: `<path d="M54 81h12" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`,
    wobble: `<path d="M52 82q2-3 4 0t4 0 4 0 4 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`,
  };
  return shapes[kind];
}

function arms(kind) {
  // Each arm is a capsule: an outline stroke with the ice colour drawn inside it, tucked behind the body.
  const arm = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${line}" stroke-width="12.4" stroke-linecap="round"/>
    <path d="M${x1} ${y1}L${x2} ${y2}" stroke="${ice}" stroke-width="7.2" stroke-linecap="round"/>`;
  const left = kind === 'up' ? arm(30, 70, 13, 47) : arm(30, 84, 17, 96);
  const right = kind === 'wave' || kind === 'up' ? arm(90, 70, 107, 47) : arm(90, 84, 103, 96);
  const swish = kind === 'wave' ? `<path d="M112 33q6 4 6 11M107 27q10 4 12 16" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round" opacity=".5"/>` : '';
  return left + right + swish;
}

function extra(kind) {
  if (kind === 'question') {
    return `<path d="M101 25q1-9 9-8 8 1 7 8-1 5-6 7-3 1-3 5" fill="none" stroke="${hatDark}" stroke-width="3.2" stroke-linecap="round"/><circle cx="108" cy="44" r="2" fill="${hatDark}"/>`;
  }
  if (kind === 'sweat') {
    return `<path d="M99 47q5 7 5 11a5 5 0 0 1-10 0q0-4 5-11z" fill="#9fd8f1" stroke="${line}" stroke-width="1.8"/>
      <path d="M78 107q0 5 3 8a3 3 0 0 0 5-2q0-3-3-6" fill="#9fd8f1" stroke="${line}" stroke-width="1.6"/>`;
  }
  if (kind === 'sparkle') {
    return `<path d="M104 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#ffd36e" stroke="${hatDark}" stroke-width="1.2"/>`;
  }
  if (kind === 'alert') {
    return `<path d="M104 20l-5 14h7l-4 14 12-19h-7l5-9z" fill="#ffd36e" stroke="${hatDark}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  if (kind === 'confetti') {
    return `<g stroke-width="0"><rect x="10" y="22" width="6" height="10" rx="2" fill="#f08a3a" transform="rotate(-24 13 27)"/>
      <rect x="104" y="18" width="6" height="10" rx="2" fill="#7fc8e8" transform="rotate(30 107 23)"/>
      <circle cx="20" cy="44" r="3" fill="#ffd36e"/><circle cx="101" cy="40" r="3" fill="#f6a6b8"/>
      <path d="M33 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#ffd36e"/><path d="M90 10l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#9fd8f1"/></g>`;
  }
  if (kind === 'snow') {
    return `<path d="M104 32v12M98 38h12M100 34l8 8M108 34l-8 8" stroke="#8fcbe6" stroke-width="2" stroke-linecap="round"/>`;
  }
  return '';
}

// The drawing without its <svg> wrapper, so another illustration can place Chip in its own coordinates.
export function chipMarkup(mood = 'happy', { head = false } = {}) {
  const look = moods[mood] ?? moods.happy;
  return `${head ? '' : `<ellipse cx="60" cy="113" rx="32" ry="4.5" fill="#1e1713" opacity=".12"/>
    <path d="M44 106v6a4 4 0 0 0 8 0v-6M68 106v6a4 4 0 0 0 8 0v-6" fill="${ice}" stroke="${line}" stroke-width="2.6" stroke-linejoin="round"/>
    ${arms(look.arm)}`}
    <rect x="22" y="36" width="76" height="72" rx="20" fill="${ice}" stroke="${line}" stroke-width="2.8"/>
    <rect x="31" y="47" width="58" height="52" rx="14" fill="${iceTop}"/>
    <path d="M30 98c4 5 9 7 16 7h28c7 0 12-2 16-7" fill="none" stroke="${iceShade}" stroke-width="3" stroke-linecap="round"/>
    <path d="M29 62c0-9 4-15 12-17" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M29 70v3" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M88 94l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" fill="#fff"/>
    <ellipse cx="40" cy="80" rx="6" ry="3.6" fill="${blush}" opacity=".6"/>
    <ellipse cx="80" cy="80" rx="6" ry="3.6" fill="${blush}" opacity=".6"/>
    ${eyes(look.eyes)}${brows(look.brows)}${mouth(look.mouth)}
    <path d="M33 40c0-14 12-24 27-24s27 10 27 24z" fill="${hat}" stroke="${hatDark}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M60 16v24" stroke="${hatDark}" stroke-width="2.2"/>
    <path d="M41 33c1-7 6-12 13-14" fill="none" stroke="${hatLight}" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="26" y="37" width="68" height="7" rx="3.5" fill="${hat}" stroke="${hatDark}" stroke-width="2.4"/>
    ${head ? '' : extra(look.extra)}`;
}

// variant 'head' drops the arms, feet and shadow and crops to the face: for avatars and small marks.
export function chipSvg({ mood = 'happy', size = 120, label = '', className = 'chip', variant = 'full' } = {}) {
  const head = variant === 'head';
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="${className} chip-${mood}" width="${size}" height="${size}" viewBox="${head ? '18 12 84 98' : '0 0 120 120'}" ${a11y} focusable="false">
    ${chipMarkup(mood, { head })}
  </svg>`;
}

export const chipMoods = Object.keys(moods);
