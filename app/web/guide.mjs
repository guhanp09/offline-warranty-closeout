import { demoVisit } from '../../fixtures/visit.mjs';
import { selectedOrder } from '../core/workflow.mjs';
import { chipSvg } from './chip.mjs';
import { sceneSvg } from './scene.mjs';
import { esc, icon } from './ui.mjs';

export const repositoryUrl = 'https://github.com/guhanp09/offline-warranty-closeout';
export const walkthroughUrl = 'https://guhanp09.github.io/offline-warranty-closeout/walkthrough/';
const evaluationUrl = repositoryUrl + '/blob/main/docs/evaluation.md';
const architectureUrl = repositoryUrl + '/blob/main/docs/architecture.md';
const policyUrl = 'https://www.hoshizakiamerica.com/wp-content/uploads/2025/02/External-Warranty-Claim-Instructions.pdf#page=3';

export const stages = [
  { label: 'Visit', claim: 'Work orders and the warranty rule are cached for offline work.' },
  { label: 'Repair', claim: 'A plain-language note becomes typed fields on the right serial.' },
  { label: 'Evidence', claim: 'Approval stays locked until a person attests the signed work order.' },
  { label: 'Sync', claim: 'A lost response is retried without creating a duplicate claim.' },
];

// Every tour step in order, with the stage it belongs to. The current step is derived from the
// workflow state, so the tour survives a reload and never runs ahead of the draft. The tour can
// press workflow buttons, but the evidence attestation and the transfer approval stay manual.
export const tourSteps = [
  ['offline', 0], ['note', 1], ['unit', 1], ['signature', 2], ['reload', 2], ['attach', 2],
  ['attest', 2], ['review', 2], ['online', 3], ['drop', 3], ['retry', 3],
];

function step(id, details, alias = id) {
  const index = tourSteps.findIndex(([key]) => key === id);
  return { id: alias, index, stage: tourSteps[index][1], mood: 'happy', ...details };
}

const count = (value, noun) => value + ' ' + noun + (value === 1 ? '' : 's');
const list = (items) => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);

function capturedFields(fields) {
  const items = [
    fields.complaint && 'problem', fields.remedy && 'repair', fields.outcome && 'test',
    fields.laborMinutes > 0 && fields.laborMinutes + ' minutes of labor',
  ].filter(Boolean);
  return items.length ? 'The note became typed fields: ' + list(items) + '.' : 'Your note is saved on this device.';
}

function gaugeSvg() {
  const ticks = [];
  for (let i = 0; i <= 40; i += 1) {
    const angle = Math.PI + (Math.PI * i) / 40;
    const major = i % 5 === 0;
    const [outer, inner] = [250, major ? 220 : 236];
    const point = (radius) => [(300 + radius * Math.cos(angle)).toFixed(1), (300 + radius * Math.sin(angle)).toFixed(1)];
    const [x1, y1] = point(outer);
    const [x2, y2] = point(inner);
    ticks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${major ? '#a8957d' : '#cdbda8'}" stroke-width="${major ? 2.6 : 1.5}" stroke-linecap="round"/>`);
  }
  return `<svg viewBox="0 0 600 312" aria-hidden="true" focusable="false">
    <path d="M60 300a240 240 0 0 1 480 0" fill="none" stroke="#dfd1bd" stroke-width="1.5"/>
    <path d="M432 108a240 240 0 0 1 82 104" fill="none" stroke="#e8772e" stroke-width="9" stroke-linecap="round" opacity=".45"/>
    ${ticks.join('')}
    <g class="gauge-needle"><path d="M295.5 300 300 96l4.5 204z" fill="#1e1713"/><circle cx="300" cy="300" r="14" fill="#1e1713"/><circle cx="300" cy="300" r="5" fill="#e8772e"/></g>
  </svg>`;
}

export function welcomeUi() {
  const visit = demoVisit();
  const [kitchen, prep] = visit.orders;
  const start = (extra = '') => `<button type="button" class="cta${extra}" data-action="start-guided">
      <span class="cta-text"><strong>Start guided demo</strong><small>About 2 minutes · sample data · no sign-in</small></span>
      <span class="cta-knob">${icon('arrow', 22)}</span>
    </button>`;
  return `<div class="landing-inner">
    <section class="hero" aria-labelledby="welcome-heading">
      <div class="hero-copy">
        <p class="eyebrow">Offline field-service assistant</p>
        <h1 id="welcome-heading"><span>No signal.</span> <span>Two identical machines.</span> <em>The manager already left.</em></h1>
        <p class="hero-lede">Close the warranty claim anyway. In two minutes you’ll match the repair to the right serial, hold the claim for the customer’s signature, and send it exactly once after the connection drops.</p>
        <div class="hero-actions">
          ${start(' welcome-start')}
          <p class="hero-alt">or <button type="button" class="link-button" data-action="start-free">explore on your own</button></p>
        </div>
        <dl class="hero-stats">
          <div><dt>guided tour</dt><dd>2 min</dd></div>
          <div><dt>sign-ins</dt><dd>0</dd></div>
          <div><dt>Mac build checks</dt><dd>41/41</dd></div>
        </dl>
      </div>
      <figure class="hero-scene">
        <div class="scene-card">${sceneSvg(visit)}</div>
      </figure>
    </section>
  </div>

  <section class="landing-section reveal" id="how" aria-labelledby="route-heading">
    <div class="landing-inner">
      <div class="section-head">
        <p class="eyebrow">How it works</p>
        <h2 id="route-heading">Cached. Matched. <em>Signed.</em> Synced.</h2>
        <p class="section-lede">Four moments from one visit. Each is a rule the app enforces, not a reminder.</p>
      </div>
      <ol class="route-cards">
        <li class="route-card">
          <div class="route-chip">${chipSvg({ mood: 'calm', size: 92 })}</div>
          <div class="vignette v-cached" aria-hidden="true">
            <span class="v-chip v-chip-warn">${icon('offline', 14)} No signal</span>
            <div class="v-panel">
              <p>${icon('check', 13)} ${esc(kitchen.ticket)} · ${esc(kitchen.location)}</p>
              <p>${icon('check', 13)} ${esc(prep.ticket)} · ${esc(prep.location)}</p>
              <p>${icon('check', 13)} Hoshizaki procedure · p. 3</p>
            </div>
            <span class="v-pill">${icon('check', 13)} Saved on this device</span>
          </div>
          <span class="route-step">01 · Visit</span>
          <h3>Cached before the signal drops</h3>
          <p>Both work orders, their serials and the warranty rule live on the device.</p>
        </li>
        <li class="route-card">
          <div class="vignette v-matched" aria-hidden="true">
            <p class="v-bubble v-me">Changed the pump. Took 40 minutes.</p>
            <p class="v-bubble v-bot">Which unit? ${esc(kitchen.serial.slice(-5))} or ${esc(prep.serial.slice(-5))}?</p>
            <div class="v-units"><span class="is-picked">${esc(kitchen.serial.slice(-5))} · ${esc(kitchen.location)}</span><span>${esc(prep.serial.slice(-5))} · Prep</span></div>
          </div>
          <span class="route-step">02 · Repair</span>
          <h3>Matched to the right serial</h3>
          <p>Two identical machines? The assistant asks instead of guessing.</p>
        </li>
        <li class="route-card">
          <div class="vignette v-signed" aria-hidden="true">
            <div class="v-panel v-sign"><strong>Customer signature</strong><span class="v-line"></span><span class="v-chip v-chip-warn">Missing until attached</span></div>
            <div class="v-checks">
              <p><span class="v-box is-on">${icon('check', 11)}</span> The customer signed it</p>
              <p><span class="v-box is-on">${icon('check', 11)}</span> It belongs to ${esc(kitchen.ticket)}</p>
            </div>
          </div>
          <span class="route-step">03 · Evidence</span>
          <h3>Signed before it’s sent</h3>
          <p>Approval stays locked until a person attests the signed PDF.</p>
        </li>
        <li class="route-card">
          <div class="vignette v-synced" aria-hidden="true">
            <div class="v-timeline">
              <p><span class="v-dot is-warn"></span> Saved, but the response was lost</p>
              <p><span class="v-dot"></span> Retry reads first and finds it</p>
            </div>
            <div class="v-receipt">
              <p>Closeout <b>1 record</b></p>
              <p>Evidence <b>1 file</b></p>
              <p>Attempts <b>2</b></p>
            </div>
          </div>
          <span class="route-step">04 · Sync</span>
          <h3>Synced exactly once</h3>
          <p>A dropped response is retried without a duplicate claim.</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="watch-band reveal" id="watch" aria-labelledby="watch-heading">
    <div class="landing-inner">
      <div class="watch-card">
        <div>
          <p class="eyebrow">Live run · 75 seconds</p>
          <h2 id="watch-heading">The same closeout, <em>in a real Salesforce org.</em></h2>
          <p class="watch-text">Recorded on the Mac build. The test drops the first sync response after Salesforce saves the record. The retry finds the same closeout and one signed PDF on the kitchen Work Order.</p>
          <ul class="watch-tags"><li>Developer Edition org</li><li>1 record · 1 PDF</li><li>SHA-256 matched</li></ul>
          <a class="text-link" href="walkthrough/">Open the full-page player ${icon('arrow', 15)}</a>
        </div>
        <div class="watch-player">
          <button type="button" class="watch-play" data-action="play-walkthrough" aria-label="Play the 75-second Salesforce run">${icon('play', 30)}</button>
          <video controls playsinline preload="none" width="1440" height="1000" poster="walkthrough/poster.jpg" aria-label="Screen recording of the closeout syncing to a Salesforce Developer Edition org">
            <source src="walkthrough/salesforce.mp4" type="video/mp4">
          </video>
        </div>
      </div>
    </div>
  </section>

  <section class="landing-section hood reveal" aria-labelledby="hood-heading">
    <div class="landing-inner">
      <div class="section-head">
        <p class="eyebrow">Under the hood · Mac build</p>
        <h2 id="hood-heading">A small model. <em>Strict rules.</em></h2>
        <p class="section-lede">Qwen3 4B and Whisper run on the device. The model proposes typed observations; deterministic checks decide what can be approved.</p>
      </div>
      <div class="gauge">${gaugeSvg()}</div>
      <dl class="hood-stats">
        <div><dt>repair fields extracted</dt><dd>41/41</dd></div>
        <div><dt>next actions chosen</dt><dd>12/12</dd></div>
        <div><dt>median turn on an M1 Pro</dt><dd>2.62 s</dd></div>
        <div><dt>egress blocked, still working</dt><dd>IPv4+6</dd></div>
      </dl>
      <p class="hood-foot"><span>Measured on a small synthetic evaluation set.</span><a class="text-link" href="${evaluationUrl}" target="_blank" rel="noreferrer">How it was measured ${icon('external', 14)}</a></p>
    </div>
  </section>

  <section class="landing-section reveal" id="faq" aria-labelledby="faq-heading">
    <div class="landing-inner">
      <div class="section-head">
        <p class="eyebrow">FAQ</p>
        <h2 id="faq-heading">Fair questions</h2>
      </div>
      <div class="faq-list">
        <details open><summary>Is the model real in this demo?<span class="faq-knob" aria-hidden="true"></span></summary>
          <p>This browser demo swaps the model for a sample parser so it runs anywhere without a download. The Mac build runs Qwen3 4B through Ollama and Whisper through whisper.cpp on the device, with the same workflow rules.</p></details>
        <details><summary>Does anything leave the device?<span class="faq-knob" aria-hidden="true"></span></summary>
          <p>Not until the technician approves the transfer. Audio and the conversation stay on the device. Only the approved fields and the signed PDF are sent.</p></details>
        <details><summary>Where does the signature rule come from?<span class="faq-knob" aria-hidden="true"></span></summary>
          <p>Hoshizaki’s published warranty claim instructions, page 3, Section 2, item F. The passage is saved for offline use and cited wherever the app asks for the signature. <a href="${policyUrl}" target="_blank" rel="noreferrer">Read the source</a>.</p></details>
        <details><summary>What if the connection drops during sync?<span class="faq-knob" aria-hidden="true"></span></summary>
          <p>The closeout stays Pending. On retry the app reads the destination first, finds the record it already wrote, and says Synced only when it sees one record and one file with a matching SHA-256.</p></details>
        <details><summary>Who decides what gets submitted?<span class="faq-knob" aria-hidden="true"></span></summary>
          <p>The warranty coordinator. The app prepares and verifies the handoff for one Hoshizaki parts-and-labor workflow. It doesn’t file claims on its own.</p></details>
      </div>
    </div>
  </section>

  <footer class="landing-footer">
    <div class="footer-chip">${chipSvg({ mood: 'wave', size: 118 })}</div>
    <div class="landing-inner">
      <p class="footer-mark">Warranty <em>Closeout</em></p>
      <p class="footer-tag">An offline field-service assistant for one Hoshizaki parts-and-labor warranty workflow.</p>
      <div class="footer-cta">${start()}</div>
      <nav class="footer-links" aria-label="Project links">
        <a href="${repositoryUrl}" target="_blank" rel="noreferrer">Source on GitHub</a>
        <a href="walkthrough/">Live Salesforce run</a>
        <a href="${evaluationUrl}" target="_blank" rel="noreferrer">Evaluation</a>
        <a href="${architectureUrl}" target="_blank" rel="noreferrer">Architecture</a>
      </nav>
      <p class="footer-fine">Synthetic visit · simulated sync in this browser · the Mac build runs on the device</p>
    </div>
  </footer>`;
}

function syncStep(state, config) {
  const { outbox } = state;
  if (outbox.status === 'synced') return {
    id: 'done', index: tourSteps.length, stage: 3, complete: true, mood: 'celebrate',
    target: '#closeout .transfer.verified', spot: 'Verified receipt',
  };
  if (state.offline) return step('online', {
    mood: 'wave',
    recap: 'Approved and locked in the device outbox: the fields, the PDF and its SHA-256.',
    title: 'Back in signal range',
    text: 'Reconnect to send the approved closeout.',
    action: 'toggle-connection', label: 'Go online', target: '#closeout .transfer', spot: 'Device outbox',
  });
  if (outbox.status === 'review') return step('retry', {
    mood: 'worried', tone: 'warn', title: 'The handoff needs review', text: outbox.error.message,
    action: 'review', label: 'View approved closeout', target: '#closeout .transfer',
  }, 'handoff-review');
  if (outbox.attempts) {
    const lost = outbox.error?.code === 'ACK_LOST';
    return step('retry', {
      mood: lost ? 'alarmed' : 'focused',
      tone: lost ? 'warn' : undefined,
      recap: lost ? 'The destination saved the closeout, but the response never arrived. It stays Pending.'
        : 'The approved closeout is still saved on this device.',
      title: 'Retry without duplicating',
      text: 'The retry reads the destination first, finds the saved closeout, and checks for one record and the PDF’s SHA-256 before it says Synced.',
      action: 'guide-sync', label: 'Retry sync', target: '#closeout .transfer', spot: 'Pending, not lost',
    });
  }
  const recap = 'Online. One approved closeout is waiting to send.';
  return step('drop', config.failpoint ? {
    mood: 'focused', recap, title: 'Test a lost response',
    text: 'The destination saves the record and PDF, then the response drops: the classic way to create a duplicate claim.',
    action: 'guide-drop-response', label: 'Simulate lost response', target: '#closeout .transfer',
  } : {
    mood: 'focused', recap, title: 'Send the approved closeout',
    text: 'Verify the record and signed PDF at the demo destination.',
    action: 'guide-sync', label: 'Simulate sync', target: '#closeout .transfer',
  });
}

export function guideStep(state, config, { reloaded = false } = {}) {
  if (state.outbox) return syncStep(state, config);
  if (state.messages.length < 2) return state.offline ? step('note', {
    recap: 'You’re offline. The closeout now runs entirely from this device.',
    title: 'Describe the repair',
    text: 'Send the technician’s note in their own words, or type your own under Service notes.',
    action: 'guide-note', label: 'Send example note', target: '#composer',
  }) : step('offline', {
    mood: 'calm',
    recap: 'Both work orders and the Hoshizaki warranty procedure are saved on this device.',
    title: 'Take the visit offline',
    text: 'Basement kitchens often have no signal. Go offline and the closeout keeps working.',
    action: 'toggle-connection', label: 'Work offline', target: '#cache-state .cache-tag',
  });

  const [policy, orderCheck, signature] = state.checks;
  if (!policy.ok) return step('signature', {
    mood: 'worried', tone: 'warn', title: 'Refresh the warranty procedure', text: policy.detail,
    action: state.offline ? 'toggle-connection' : 'refresh', label: state.offline ? 'Go online' : 'Refresh source',
  }, 'source');
  if (!orderCheck.ok) return step('unit', {
    mood: 'curious',
    recap: capturedFields(state.draft.fields),
    title: 'Which unit did you repair?',
    text: `Both machines are ${state.visit.orders[0].model}, so the assistant asks for the serial instead of guessing.`,
    chooseUnit: true, target: '#thread .message.assistant .message-body', spot: 'Asks instead of guessing',
  });

  const { file, fields, origins } = state.draft;
  const order = selectedOrder(state);
  const reviewTarget = '#closeout .review-actions [data-action="review"]';
  if (signature.ok) {
    const missing = state.checks.find((check) => !check.ok);
    return missing ? step('review', {
      mood: 'curious', tone: 'warn', title: 'Finish the repair details', text: missing.detail,
      action: 'review', label: 'Open closeout preview', target: reviewTarget,
    }, 'details') : step('review', {
      mood: 'proud',
      recap: `Checklist complete: ${state.checks.length} of ${state.checks.length}.`,
      title: 'Review and approve the transfer',
      text: 'Check the summary, then approve. Nothing is sent until you do.',
      action: 'review', label: 'Open closeout preview', target: reviewTarget,
    });
  }
  if (file?.orderId === order.id && file.serial === order.serial) return step('attest', {
    mood: 'focused',
    recap: `The signed PDF is bound to ${order.ticket} and ${order.serial}.`,
    title: 'Confirm the signed document',
    text: 'Open the PDF to compare its serial, then tick both statements. A person attests the evidence, not the model.',
    action: 'guide-attest', label: 'Go to the checks', target: '#attest', spot: 'Two explicit checks',
  });
  if (file) return step('attach', {
    mood: 'alarmed', tone: 'warn', recap: 'That PDF belongs to the other machine, so it can’t count.',
    title: 'Use evidence for the selected unit',
    text: `Attach the signed work order for ${order.ticket}.`,
    action: 'fixture', label: 'Attach sample PDF', target: '#signature-panel', spot: 'Wrong work order',
  }, 'mismatch');
  if (fields.signatureUnavailable) return reloaded ? step('attach', {
    recap: 'Restored from this device: the serial, the draft, the cited rule and this step.',
    title: 'The signed work order arrives',
    text: `The manager signs later. Attach their signed PDF for ${order.ticket}. A file for the other machine wouldn’t count.`,
    action: 'fixture', label: 'Attach sample PDF', target: '#signature-panel', spot: 'Signed work order',
  }) : step('reload', {
    mood: 'focused',
    recap: 'Saved as Awaiting signature. Approval stays locked.',
    title: 'Reload to prove it’s saved',
    text: 'The draft lives on this device, not in the page. Reload, or switch off Wi-Fi first, and it all comes back.',
    action: 'guide-reload', label: 'Reload page', secondary: [{ action: 'guide-skip-reload', label: 'Skip' }],
    target: '#visit-header .status',
  });
  return step('signature', {
    mood: 'worried',
    recap: `Matched ${order.ticket} to ${order.serial}.` + (origins.partNumber === 'cached job' ? ' The part number came from the cached job.' : ''),
    title: 'The claim needs a customer signature',
    text: 'Hoshizaki won’t approve a claim without one (page 3, item F). What if the manager already left?',
    action: 'manager-left', label: 'Manager has left', secondary: [{ action: 'source', label: 'Read the requirement' }],
    target: '#signature-panel', spot: 'Hoshizaki · p. 3, item F',
  });
}

export function reviewHint(step) {
  if (step?.id !== 'review') return '';
  return `Step ${step.index + 1} of ${tourSteps.length}: tick the approval box, then approve. Nothing is sent until you do.`;
}

function trackUi(step) {
  const groups = stages.map((stage, stageIndex) => {
    const ticks = tourSteps.map(([, owner], index) => owner !== stageIndex ? ''
      : `<i class="${index < step.index ? 'is-done' : index === step.index ? 'is-current' : ''}"></i>`).join('');
    const done = step.complete || stageIndex < step.stage;
    const current = !step.complete && stageIndex === step.stage;
    return `<li class="${done ? 'is-done' : current ? 'is-current' : ''}"${current ? ' aria-current="step"' : ''}>
      <span class="tour-ticks" aria-hidden="true">${ticks}</span>
      <span class="tour-stage">${stage.label}${done ? '<span class="sr-only"> complete</span>' : ''}</span></li>`;
  }).join('');
  const position = step.complete ? 'Demo complete'
    : `Step ${step.index + 1} of ${tourSteps.length}<span class="tour-count-stage"> · ${stages[step.stage].label}</span>`;
  return `<div class="tour-top">
    <ol class="tour-track" aria-label="Demo progress">${groups}</ol>
    <p class="tour-count">${position}</p>
    <button type="button" class="tour-restart" data-action="reset">Restart</button>
  </div>`;
}

function finaleUi(step, state) {
  const order = selectedOrder(state);
  const { receipt, attempts } = state.outbox;
  const proofs = [
    ['Right machine', `${order.ticket} is bound to ${order.serial}, not its twin.`],
    ['Signature enforced', 'Approval stayed locked until you attested the signed PDF.'],
    ['Kept on the device', 'The draft, cited rule and PDF were stored locally while offline.'],
    ['Exactly once', `${count(receipt.closeoutCount, 'record')} and ${count(receipt.fileCount, 'matching file')} after ${count(attempts, 'attempt')}.`],
  ];
  return `${trackUi(step)}
    <div class="tour-final">
      <span class="tour-chip">${chipSvg({ mood: 'celebrate', size: 120 })}</span>
      <p class="tour-recap">${icon('check', 15)}<span>Simulation verified. The receipt matches the approved closeout.</span></p>
      <h2 id="guide-heading" tabindex="-1">Claim closed: offline, <em>and exactly once.</em></h2>
      <ul class="tour-proof">
        ${proofs.map(([title, text]) => `<li><strong>${icon('check', 15)}${title}</strong><p>${esc(text)}</p></li>`).join('')}
      </ul>
      <div class="tour-final-actions">
        <a class="button button-primary" href="${walkthroughUrl}" target="_blank" rel="noreferrer">${icon('play', 15)}Watch the live Salesforce run</a>
        <a class="button button-quiet" href="${evaluationUrl}" target="_blank" rel="noreferrer">Engineering results ${icon('external', 14)}</a>
        <a class="button button-quiet" href="${repositoryUrl}" target="_blank" rel="noreferrer">Source on GitHub ${icon('external', 14)}</a>
      </div>
      <div class="tour-stats">
        <p>Mac build · Qwen3 4B on an Apple M1 Pro · small synthetic evaluation set</p>
        <dl>
          <div><dt>Repair extraction</dt><dd>41 / 41</dd></div>
          <div><dt>Next actions</dt><dd>12 / 12</dd></div>
          <div><dt>Median turn</dt><dd>2.62 s</dd></div>
        </dl>
      </div>
    </div>`;
}

export function guideUi(step, { busy, orderOptions, state }) {
  if (step.complete) return finaleUi(step, state);
  const disabled = busy ? ' disabled' : '';
  const secondary = (step.secondary ?? []).map(({ action, label }) =>
    `<button type="button" class="button button-quiet" data-action="${action}"${action === 'source' ? '' : disabled}>${esc(label)}</button>`).join('');
  const actions = step.chooseUnit ? orderOptions
    : `<button type="button" class="button button-primary" data-action="${step.action}"${disabled}>${esc(step.label)} ${icon('arrow', 16)}</button>${secondary}`;
  const recap = step.recap ? `<p class="tour-recap" id="guide-recap">${icon(step.tone === 'warn' ? 'alert' : 'check', 15)}<span>${esc(step.recap)}</span></p>` : '';
  // Chip sits outside the scrolling part, so on phones it can perch on the sheet's top edge.
  return `<span class="tour-chip">${chipSvg({ mood: step.mood, size: 88 })}</span>
    <div class="tour-scroll">
      ${trackUi(step)}
      <div class="tour-body">
        <div class="tour-copy">
          ${recap}
          <h2 id="guide-heading" tabindex="-1" aria-describedby="${step.recap ? 'guide-recap ' : ''}guide-text">${esc(step.title)}</h2>
          <p class="tour-text" id="guide-text">${esc(step.text)}</p>
        </div>
        <div class="tour-actions${step.chooseUnit ? ' tour-choose' : ''}">${actions}</div>
      </div>
    </div>`;
}
