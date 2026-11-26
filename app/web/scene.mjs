import { chipMarkup } from './chip.mjs';
import { esc } from './ui.mjs';

// The welcome illustration: two identical ice machines, no signal, a work order whose customer
// signature is still missing, and Chip between the machines asking which one was repaired. It is drawn
// from the demo visit so the serials and tickets always match the work orders in the tour.

const steel = '#a69c8f';

function machine(x, order) {
  const center = x + 75;
  const slats = [0, 1, 2, 3, 4].map((row) => {
    const y = 161 + row * 4.6;
    return `<line x1="${x + 19}" y1="${y}" x2="${x + 131}" y2="${y}"/>`;
  }).join('');
  const vents = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => {
    const vx = x + 12 + col * 15.8;
    return `<line x1="${vx}" y1="313" x2="${vx}" y2="329"/>`;
  }).join('');
  return `<g class="scene-machine">
    <ellipse cx="${center}" cy="352" rx="92" ry="6.5" fill="#cdbfae" opacity=".55"/>
    <rect x="${x + 4}" y="337" width="10" height="15" rx="2" fill="#6f6359"/>
    <rect x="${x + 136}" y="337" width="10" height="15" rx="2" fill="#6f6359"/>
    <rect x="${x - 6}" y="192" width="162" height="147" rx="6" fill="url(#sc-steel)" stroke="${steel}" stroke-width="1.5"/>
    <line x1="${x - 5}" y1="199.5" x2="${x + 155}" y2="199.5" stroke="#d8d0c4" stroke-width="1.2"/>
    <rect x="${x + 6}" y="207" width="138" height="88" rx="6" fill="url(#sc-door)" stroke="#b3a89a" stroke-width="1.3"/>
    <rect x="${x + 27}" y="215" width="96" height="7" rx="3.5" fill="#7d7268"/>
    <rect x="${x + 22}" y="235" width="106" height="44" rx="7" fill="#fffdf9" stroke="#cbbfae" stroke-width="1.2"/>
    <text x="${center}" y="251" text-anchor="middle" font-size="10" font-weight="760" letter-spacing="1.6" fill="#8a7b6d">SERIAL</text>
    <text x="${center}" y="272" text-anchor="middle" font-size="21" font-weight="780" fill="#1e1713">${esc(order.serial.slice(-5))}</text>
    <rect x="${x - 5}" y="305" width="160" height="32" fill="#ddd5c9"/>
    <g stroke="#c2b7a8" stroke-width="1.6" stroke-linecap="round">${vents}</g>
    <rect x="${x}" y="118" width="150" height="74" rx="8" fill="url(#sc-steel)" stroke="${steel}" stroke-width="1.5"/>
    <line x1="${x + 1}" y1="130" x2="${x + 149}" y2="130" stroke="#d8d0c4" stroke-width="1.2"/>
    <rect x="${x + 12}" y="138" width="44" height="11" rx="3" fill="#d6cec2"/>
    <circle cx="${x + 136}" cy="143.5" r="7" fill="#5aa86a" opacity=".2"/>
    <circle cx="${x + 136}" cy="143.5" r="3.4" fill="#5aa86a"/>
    <rect x="${x + 12}" y="156" width="126" height="27" rx="4" fill="#e6e0d6" stroke="#cfc6b8"/>
    <g stroke="#bfb4a5" stroke-width="1.4" stroke-linecap="round">${slats}</g>
    <text x="${center}" y="383" text-anchor="middle" font-size="20" font-weight="740" fill="#1e1713">${esc(order.location)}</text>
    <text x="${center}" y="405" text-anchor="middle" font-size="15" font-weight="560" fill="#74655a">${esc(order.ticket)}</text>
  </g>`;
}

const fieldRows = [96, 74, 86].map((width, row) => {
  const y = 151 + row * 25;
  return `<circle cx="447" cy="${y + 5}" r="7.5" fill="#e3eddb"/>
    <path d="m443.4 ${y + 5.2} 2.5 2.5 4.6-5" fill="none" stroke="#3d6b3c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="461" y="${y + 1}" width="${width}" height="8" rx="4" fill="#ebe2d6"/>`;
}).join('');

export function sceneSvg(visit) {
  const [first, second] = visit.orders;
  const model = first.model;
  return `<svg class="scene" viewBox="0 0 600 430" role="img" aria-labelledby="scene-title">
    <title id="scene-title">Two identical Hoshizaki ${esc(model)} ice machines: ${esc(first.location)}, serial ending ${esc(first.serial.slice(-5))}, and ${esc(second.location)}, serial ending ${esc(second.serial.slice(-5))}. Chip, the guide, asks which one was repaired. There is no signal, and the work order’s customer signature is missing.</title>
    <defs>
      <linearGradient id="sc-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcf8f2"/><stop offset="1" stop-color="#f3ebdf"/></linearGradient>
      <pattern id="sc-tile" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 .5H.5V38" fill="none" stroke="#ece2d4"/></pattern>
      <linearGradient id="sc-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf9f6"/><stop offset=".55" stop-color="#ebe5dc"/><stop offset="1" stop-color="#dcd4c8"/></linearGradient>
      <linearGradient id="sc-door" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8f5f0"/><stop offset="1" stop-color="#e6dfd4"/></linearGradient>
    </defs>
    <rect width="600" height="352" fill="url(#sc-wall)"/>
    <rect width="600" height="352" fill="url(#sc-tile)"/>
    <rect y="352" width="600" height="78" fill="#efe6d9"/>
    <line x1="0" y1="352" x2="600" y2="352" stroke="#e0d4c2" stroke-width="2"/>
    <g class="scene-links" fill="none" stroke="#b9a58f" stroke-width="1.6" stroke-dasharray="2 6" stroke-linecap="round">
      <path d="M196 84c-26 8-56 15-72 30"/>
      <path d="M230 84c26 8 56 15 72 30"/>
    </g>
    ${machine(44, first)}
    ${machine(232, second)}
    <g class="scene-chip" transform="translate(168 322) scale(.75)">${chipMarkup('curious')}</g>
    <g class="scene-bubble">
      <rect x="83" y="25" width="260" height="48" rx="24" fill="#1b1512"/>
      <path d="M205 72l8 10 8-10z" fill="#1b1512"/>
      <text x="213" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="#f3e9dc">Which one did you repair?</text>
    </g>
    <g class="scene-signal">
      <rect x="436" y="24" width="140" height="34" rx="17" fill="#fbecd2" stroke="#ecd0a0"/>
      <g fill="none" stroke="#a35e10" stroke-width="1.8" stroke-linecap="round" transform="translate(449 30) scale(.92)">
        <path d="M3 9a14 14 0 0 1 3-2m4-1.1A14 14 0 0 1 21 9M6 12.5a9.5 9.5 0 0 1 4-1.8m4.5 0a9.5 9.5 0 0 1 3.5 1.8m-9 3.4a4.8 4.8 0 0 1 6 0M12 19h.01M3 3l18 18"/>
      </g>
      <text x="479" y="46.5" font-size="15.5" font-weight="740" fill="#8a520f">No signal</text>
    </g>
    <g class="scene-order" transform="rotate(2 502 214)">
      <rect x="428" y="88" width="158" height="262" rx="13" fill="#3b2a1f" opacity=".08"/>
      <rect x="424" y="82" width="158" height="262" rx="13" fill="#fffdf9" stroke="#e3d6c4"/>
      <rect x="478" y="74" width="48" height="16" rx="5" fill="#8a7b6d"/>
      <rect x="490" y="78" width="24" height="6" rx="3" fill="#b7aa9b"/>
      <text x="439" y="113" font-size="10.5" font-weight="780" letter-spacing="1.6" fill="#8a7b6d">WORK ORDER</text>
      <text x="439" y="136" font-size="19" font-weight="760" fill="#1e1713">Pump repair</text>
      ${fieldRows}
      <line x1="437" y1="238" x2="567" y2="238" stroke="#efe6da"/>
      <text x="439" y="262" font-size="13.5" font-weight="760" fill="#8a520f">Customer signature</text>
      <path d="m441 281 7 7m0-7-7 7" stroke="#c98d36" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="454" y1="290" x2="567" y2="290" stroke="#d39b45" stroke-width="1.8" stroke-dasharray="6 5"/>
      <g class="scene-missing">
        <rect x="439" y="304" width="88" height="27" rx="13.5" fill="#fbecd2" stroke="#ecd0a0"/>
        <circle cx="453" cy="317.5" r="3.6" fill="#c47f1f"/>
        <text x="462" y="322.5" font-size="14" font-weight="760" fill="#8a520f">Missing</text>
      </g>
    </g>
    <text x="584" y="384" text-anchor="end" font-size="15" font-weight="740" fill="#1e1713">${esc(visit.title)}</text>
    <text x="584" y="405" text-anchor="end" font-size="13" font-weight="560" fill="#74655a">2 × ${esc(model)} ice machines</text>
  </svg>`;
}
