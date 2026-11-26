import { checks, editDraft } from '../core/workflow.mjs';
import { encodeFile, fileLimit } from '../core/evidence.mjs';
import { localClient, previewClient } from './client.mjs';
import { guideStep, guideUi, repositoryUrl, reviewHint, welcomeUi } from './guide.mjs';
import { startLanding } from './landing.mjs';
import { microphone } from './mic.mjs';
import {
  checklistUi, connectionUi, diagnosticsUi, dialogFrame, headerUi, icon, orderUi, repairSummaryUi, reviewUi,
  signerNote, sourceUi, starterNote, threadUi, uploadUi,
} from './ui.mjs';

const $ = (id) => document.getElementById(id);
const preview = document.body.dataset.mode === 'preview';
const client = preview ? previewClient() : localClient();
const root = document.documentElement;
const dialog = $('dialog');
const note = $('note');
const guide = $('guide');
const layout = $('visit-layout');
const narrowLayout = window.matchMedia('(max-width: 730px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const guidePreference = 'warranty-closeout:guide';
const reloadPreference = 'warranty-closeout:reloaded';
let state;
let config;
let busy;
let step = null;
let guideHtml = '';
let spotId;
let guideEnabled = true;
let choiceOpen = false;
let recording = false;
let transcribing = false;
let noticeTimer;
let stopLanding = null;
// The draft revision at which this tab was last reloaded. The tour uses it to show that a
// reload restored the draft, and forgets it as soon as the draft changes.
let reloadedAt = readSession(reloadPreference);

$('conversation-icon').innerHTML = icon('chat', 21);

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The tour still works. It just cannot tell that the page was reloaded.
  }
}

function notify(text, error = false) {
  const notice = $('notice');
  if (dialog.open && error) {
    const line = $('dialog-error') ?? document.createElement('p');
    line.id = 'dialog-error';
    line.className = 'dialog-error';
    line.setAttribute('role', 'alert');
    line.textContent = text;
    $('dialog-inner').querySelector('.dialog-header').after(line);
    return;
  }
  clearTimeout(noticeTimer);
  notice.textContent = text;
  notice.classList.toggle('notice-error', error);
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4800);
}

function renderMic() {
  $('mic').hidden = !config?.speech;
  $('mic').disabled = Boolean(busy || transcribing);
  $('mic').classList.toggle('is-recording', recording);
  const label = recording ? 'Stop recording' : transcribing ? 'Transcribing…' : 'Push to talk';
  $('mic').innerHTML = icon(recording ? 'stop' : 'mic', 17) + label;
  $('mic').setAttribute('aria-pressed', String(recording));
  $('composer-hint').textContent = recording ? 'Recording locally · press again to stop'
    : transcribing ? 'Transcribing on this device…' : 'Service notes stay on this device.';
}

function arrangePanels() {
  const checklistFirst = narrowLayout.matches && layout.hasAttribute('data-checklist-first');
  const first = checklistFirst ? $('closeout') : $('conversation');
  if (layout.firstElementChild !== first) layout.prepend(first);
}

// Coach marks. The page is dimmed except for a cutout around the real control the step is about;
// clicks pass through the cutout, while clicks on the dimmed page only nudge the callout. On desktop
// the callout is anchored beside the target with an arrow; on phones it is a bottom sheet.
const coach = $('coach');
const hole = coach.querySelector('.coach-hole');
const blocks = [...coach.querySelectorAll('.coach-block')];
const holePad = 8;
let coachFrame = 0;
let stableFrames = 0;
let lastLayout = '';
let coachShown = false;
let moveTimer;

const sheetMode = () => narrowLayout.matches;

function tourTarget() {
  if (!step?.target || step.complete) return null;
  const matches = document.querySelectorAll(step.target);
  const target = matches[matches.length - 1];
  return target?.getClientRects().length ? target : null;
}

// On phones Chip perches above the sheet's top edge, so its overhang counts as covered too.
function chipOverhang() {
  const chip = guide.querySelector('.tour-chip');
  return chip ? Math.max(0, guide.getBoundingClientRect().top - chip.getBoundingClientRect().top) : 0;
}

function measureGuide() {
  const sheet = !guide.hidden && !$('visit').hidden && sheetMode() && !step?.complete;
  root.style.setProperty('--tour-top', '0px');
  root.style.setProperty('--tour-bottom', sheet ? Math.ceil(guide.offsetHeight + chipOverhang() + 20) + 'px' : '0px');
}

// The part of the window a highlighted control must stay inside: above the sheet on phones.
function clearBand() {
  if (guide.hidden || $('visit').hidden || !sheetMode() || step?.complete) return { top: 0, bottom: innerHeight };
  return { top: 0, bottom: guide.getBoundingClientRect().top - chipOverhang() };
}

function reveal(element) {
  if (!element?.isConnected || dialog.open) return;
  const box = element.getBoundingClientRect();
  const band = clearBand();
  // On desktop the callout also needs room above or below the control.
  const room = sheetMode() ? 12 : Math.min(150, (band.bottom - band.top - box.height) / 2);
  if (box.top >= band.top + room && box.bottom <= band.bottom - room) return;
  element.scrollIntoView({
    block: box.height > band.bottom - band.top - 16 ? 'start' : 'center',
    behavior: reducedMotion.matches ? 'auto' : 'smooth',
  });
}

function setBox(element, x, y, width, height) {
  element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  element.style.width = Math.max(0, Math.round(width)) + 'px';
  element.style.height = Math.max(0, Math.round(height)) + 'px';
}

function placeCallout(box, width, height) {
  const anchored = !sheetMode() && !step.complete;
  guide.classList.toggle('is-anchored', anchored);
  if (!anchored) {
    guide.style.transform = '';
    delete guide.dataset.side;
    return '';
  }
  const w = guide.offsetWidth;
  const h = guide.offsetHeight;
  const gap = 18;
  const margin = 14;
  const clampX = (x) => Math.min(Math.max(x, margin), width - w - margin);
  const clampY = (y) => Math.min(Math.max(y, margin), height - h - margin);
  if (!box) {
    guide.dataset.side = 'none';
    guide.style.transform = `translate(${Math.round(clampX((width - w) / 2))}px, ${Math.round(clampY((height - h) / 2))}px)`;
    return guide.style.transform;
  }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const options = [
    { side: 'bottom', x: clampX(cx - w / 2), y: box.y + box.h + gap, room: height - (box.y + box.h) - gap - margin - h },
    { side: 'top', x: clampX(cx - w / 2), y: box.y - gap - h, room: box.y - gap - margin - h },
    { side: 'right', x: box.x + box.w + gap, y: clampY(cy - h / 2), room: width - (box.x + box.w) - gap - margin - w },
    { side: 'left', x: box.x - gap - w, y: clampY(cy - h / 2), room: box.x - gap - margin - w },
  ];
  const choice = options.find((option) => option.room >= 0) ?? options.reduce((a, b) => (b.room > a.room ? b : a));
  const x = clampX(choice.x);
  const y = clampY(choice.y);
  const along = choice.side === 'bottom' || choice.side === 'top' ? cx - x : cy - y;
  const span = choice.side === 'bottom' || choice.side === 'top' ? w : h;
  const visible = box.y + box.h > 0 && box.y < height && box.x + box.w > 0 && box.x < width;
  guide.dataset.side = visible ? choice.side : 'none';
  guide.style.setProperty('--arrow', Math.round(Math.min(Math.max(along, 28), span - 28)) + 'px');
  guide.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  return guide.style.transform + guide.dataset.side;
}

function layoutCoach() {
  const active = Boolean(step) && !$('visit').hidden && !guide.hidden && !dialog.open;
  if (coach.hidden === active) coach.hidden = !active;
  if (!active) {
    coachShown = false;
    return 'off';
  }
  if (!coachShown) {
    // First appearance: place everything without gliding in from a corner.
    coach.classList.remove('is-moving');
    guide.classList.remove('is-moving');
    coachShown = true;
  }
  const width = document.documentElement.clientWidth;
  const height = innerHeight;
  const target = tourTarget();
  const rect = target?.getBoundingClientRect();
  const box = rect ? { x: rect.left - holePad, y: rect.top - holePad, w: rect.width + holePad * 2, h: rect.height + holePad * 2 } : null;
  coach.classList.toggle('is-full', !box);
  if (box) {
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    setBox(hole, box.x, box.y, box.w, box.h);
    setBox(blocks[0], 0, 0, width, box.y);
    setBox(blocks[1], 0, bottom, width, height - bottom);
    setBox(blocks[2], 0, box.y, box.x, box.h);
    setBox(blocks[3], right, box.y, width - right, box.h);
  } else {
    setBox(hole, width / 2, height / 2, 0, 0);
    setBox(blocks[0], 0, 0, width, height);
    for (const block of blocks.slice(1)) setBox(block, 0, 0, 0, 0);
  }
  const callout = placeCallout(box, width, height);
  return (box ? [box.x, box.y, box.w, box.h].map(Math.round).join(',') : 'full') + callout;
}

function tickCoach() {
  coachFrame = 0;
  const layout = layoutCoach();
  stableFrames = layout === lastLayout ? stableFrames + 1 : 0;
  lastLayout = layout;
  if (layout !== 'off' && stableFrames < 45) coachFrame = requestAnimationFrame(tickCoach);
}

function kickCoach() {
  stableFrames = 0;
  if (!coachFrame) coachFrame = requestAnimationFrame(tickCoach);
}

window.addEventListener('scroll', kickCoach, { passive: true });
dialog.addEventListener('close', kickCoach);
coach.addEventListener('click', () => {
  guide.classList.remove('is-nudged');
  void guide.offsetWidth;
  guide.classList.add('is-nudged');
});

// A short warning inside the callout, for a Next that the reader has to complete first.
function coachAlert(text) {
  const holder = guide.querySelector('.tour-scroll');
  if (!holder) return;
  let line = guide.querySelector('.coach-alert');
  if (!line) {
    line = document.createElement('p');
    line.className = 'coach-alert';
    line.setAttribute('role', 'alert');
    holder.querySelector('.tour-actions')?.before(line);
  }
  line.textContent = text;
  guide.classList.remove('is-nudged');
  void guide.offsetWidth;
  guide.classList.add('is-nudged');
  hole.classList.remove('is-pulsing');
  void hole.offsetWidth;
  hole.classList.add('is-pulsing');
  kickCoach();
}

function spotlight() {
  const id = step?.id ?? null;
  const entering = id !== spotId;
  spotId = id;
  if (step && entering) {
    if (coachShown) {
      coach.classList.add('is-moving');
      guide.classList.add('is-moving');
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        coach.classList.remove('is-moving');
        guide.classList.remove('is-moving');
      }, 650);
    }
    hole.classList.remove('is-pulsing');
    void hole.offsetWidth;
    hole.classList.add('is-pulsing');
    guide.querySelector('.tour-scroll, .tour-final')?.classList.add('is-entering');
    guide.querySelector('.tour-chip')?.classList.add('is-entering');
    requestAnimationFrame(() => reveal(tourTarget()));
  }
  // Place the coach now, so the callout is visible (and focusable) before anything moves focus to it.
  layoutCoach();
  kickCoach();
}

// The welcome page is built once and kept while it is shown, so its entrance and scroll motion
// are not restarted by every render. Only the busy state of its buttons changes.
function renderWelcome(show) {
  const welcome = $('welcome');
  welcome.hidden = !show;
  if (!show) {
    stopLanding?.();
    stopLanding = null;
    return welcome.replaceChildren();
  }
  if (!welcome.hasChildNodes()) {
    welcome.innerHTML = welcomeUi();
    stopLanding = startLanding(welcome);
  }
  for (const button of welcome.querySelectorAll('[data-action^="start-"]')) button.disabled = Boolean(busy);
  for (const label of welcome.querySelectorAll('.cta-text strong')) label.textContent = busy ? 'Preparing the visit…' : 'Start guided demo';
}

function render() {
  const showWelcome = preview && !state.visit;
  step = preview && state.visit && guideEnabled ? guideStep(state, config, { reloaded: reloadedAt === String(state.rev) }) : null;
  const orders = orderUi(state, choiceOpen);
  renderWelcome(showWelcome);
  $('visit').hidden = showWelcome;
  layout.toggleAttribute('data-checklist-first', Boolean(step && step.stage >= 2));
  arrangePanels();
  guide.hidden = !step;
  const html = step ? guideUi(step, { busy, state }) : '';
  if (html !== guideHtml) {
    guide.innerHTML = html;
    guideHtml = html;
  }
  guide.dataset.step = step?.id ?? '';
  guide.dataset.target = step?.target ?? '';
  guide.classList.toggle('is-complete', Boolean(step?.complete));
  guide.classList.toggle('is-warn', step?.tone === 'warn');
  $('connection').innerHTML = showWelcome
    ? `<a class="nav-link" href="#how">How it works</a><a class="nav-link" href="#watch">Live run</a><a class="nav-link" href="#faq">FAQ</a>
      <a class="nav-link" href="${repositoryUrl}" target="_blank" rel="noreferrer">GitHub</a>
      <button type="button" class="button button-header" data-action="start-guided"${busy ? ' disabled' : ''}>Start demo</button>`
    : (preview ? `<button type="button" class="button button-header" data-action="toggle-guide" aria-controls="guide" aria-expanded="${Boolean(step)}">${step ? 'Hide guide' : 'Show guide'}</button>` : '')
      + connectionUi(state);
  $('visit-header').innerHTML = headerUi(state, config);
  $('thread').innerHTML = threadUi(state, busy);
  $('unit-options').innerHTML = orders;
  $('closeout').innerHTML = checklistUi(state, config, busy);
  $('runtime-label').textContent = config.mode === 'preview' ? 'Browser demo · Sample parser'
    : config.model ? config.model + ' · On-device model' : 'Local app · Sample parser';
  $('cache-state').innerHTML = state.visit
    ? '<button class="cache-tag" type="button" data-action="source">' + icon('check', 14) + '2 jobs &amp; source cached</button>' : '';
  $('footer').hidden = showWelcome;
  $('footer').innerHTML = '<span>' + (config.remote === 'salesforce' ? 'Salesforce development org' : 'Synthetic visit · Simulated sync')
    + '</span><div><button type="button" data-action="diagnostics">Diagnostics</button>'
    + (state.visit && !(config.remote === 'salesforce' && state.outbox && state.outbox.status !== 'synced')
      ? '<button type="button" data-action="reset">Start over</button>' : '') + '</div>';
  $('composer-area').hidden = !state.visit || Boolean(state.outbox);
  const reading = busy === 'turn';
  $('send').disabled = Boolean(busy);
  $('send').innerHTML = reading ? 'Reading…' : 'Send ' + icon('arrow', 16);
  note.disabled = reading;
  const suggestions = [];
  if (state.visit && state.messages.length < 2) suggestions.push('<button type="button" class="suggestion" data-action="sample-note">Use example note</button>');
  if (state.draft.orderId && !state.draft.attestation && !state.draft.file && !state.draft.fields.signatureUnavailable) {
    suggestions.push('<button type="button" class="suggestion" data-action="manager-left">The manager already left</button>');
  }
  $('suggestions').innerHTML = suggestions.join('');
  const thread = $('thread');
  thread.scrollTop = thread.scrollHeight;
  renderMic();
  spotlight();
  measureGuide();
}

narrowLayout.addEventListener('change', () => {
  arrangePanels();
  measureGuide();
  kickCoach();
});
window.addEventListener('resize', () => {
  measureGuide();
  kickCoach();
});
if ('ResizeObserver' in window) new ResizeObserver(() => { measureGuide(); kickCoach(); }).observe(guide);

function setGuide(enabled) {
  guideEnabled = enabled;
  try {
    localStorage.setItem(guidePreference, enabled ? 'on' : 'off');
  } catch {
    // The choice lasts for this page only.
  }
}

function focusGuide() {
  $('guide-heading')?.focus({ preventScroll: true });
}

function fillDialog(kind) {
  const guided = preview && guideEnabled;
  const content = {
    source: () => sourceUi(state),
    diagnostics: () => diagnosticsUi(state),
    review: () => reviewUi(state, config, guided, guided ? reviewHint(step) : ''),
    upload: () => uploadUi(state),
    reset: () => dialogFrame('Start a fresh visit?', '<div class="dialog-body"><p>This clears the current draft, conversation and evidence from this workspace.</p><div class="signature-actions"><button type="button" class="button button-quiet" data-action="close">Keep visit</button><button type="button" class="button button-primary" data-action="confirm-reset">Start over</button></div></div>'),
  };
  $('dialog-inner').innerHTML = content[kind]();
  if (!dialog.open) dialog.showModal();
  layoutCoach();
  kickCoach();
  if (kind === 'review') validatePreview();
}

async function dispatch(type, detail = {}) {
  if (!state || busy) return false;
  busy = type;
  render();
  try {
    ({ state, config } = await client.dispatch({ type, rev: state.rev, ...detail }));
    return true;
  } catch (error) {
    if (error.code === 'REVISION') ({ state, config } = await client.load());
    notify(error.message || 'The workspace could not complete this action.', true);
    return false;
  } finally {
    busy = null;
    render();
  }
}

function readEdits(form) {
  const data = new FormData(form);
  const fields = Object.fromEntries(data);
  fields.noParts = data.has('noParts');
  return fields;
}

function validatePreview() {
  const form = $('review');
  if (!form || state.outbox) return;
  for (const name of ['partNumber', 'partQty']) {
    const input = form.elements[name];
    input.disabled = form.elements.noParts.checked;
    input.closest('label').hidden = input.disabled;
  }
  const label = $('review-validation');
  try {
    const copy = structuredClone(state);
    editDraft(copy, readEdits(form));
    const summary = $('repair-summary');
    if (summary) summary.innerHTML = repairSummaryUi(copy.draft.fields);
    const missing = checks(copy).filter((item) => !item.ok);
    $('approve').disabled = missing.length > 0 || !$('approve-consent').checked;
    label.textContent = missing.length ? missing[0].detail : 'The checklist is complete.';
  } catch (error) {
    $('approve').disabled = true;
    label.textContent = error.message;
  }
}

async function send(text = note.value, focusNote = true) {
  if (!text.trim() || busy) return false;
  const success = await dispatch('turn', { text });
  if (success) note.value = '';
  if (focusNote) note.focus();
  return success;
}

$('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  send();
});
note.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
});

const capture = microphone(
  (value) => { recording = value; renderMic(); },
  (value) => { transcribing = value; renderMic(); },
  (blob) => client.transcribe(blob),
  (text) => { note.value = [note.value, text].filter(Boolean).join(' ').slice(0, 1500); note.focus(); },
  (message) => notify(message, true),
);
$('mic').addEventListener('click', capture);

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || !state) return;
  const action = target.dataset.action;
  if (busy && !['source', 'diagnostics', 'close'].includes(action)) return;
  const inGuide = Boolean(target.closest('#guide'));
  let advanced = false;
  switch (action) {
    case 'start-guided':
    case 'start-free':
      setGuide(action === 'start-guided');
      if (await dispatch('prepare')) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        (guideEnabled ? $('guide-heading') : $('visit-heading'))?.focus({ preventScroll: true });
      }
      break;
    case 'toggle-guide':
    case 'finish-tour':
      setGuide(action === 'toggle-guide' && !guideEnabled);
      render();
      if (guideEnabled) focusGuide();
      else $('connection').querySelector('[data-action="toggle-guide"]')?.focus({ preventScroll: true });
      if (action === 'finish-tour') reveal($('closeout').querySelector('.transfer') ?? $('closeout'));
      break;
    case 'prepare':
      await dispatch('prepare');
      break;
    case 'toggle-connection':
      advanced = await dispatch('connection', { offline: !state.offline });
      break;
    case 'guide-note':
      advanced = await send(starterNote, false);
      break;
    case 'guide-reload':
      writeSession(reloadPreference, String(state.rev));
      window.location.reload();
      break;
    case 'guide-skip-reload':
      reloadedAt = String(state.rev);
      writeSession(reloadPreference, reloadedAt);
      render();
      advanced = true;
      break;
    case 'play-walkthrough': {
      const player = target.closest('.watch-player');
      const video = player?.querySelector('video');
      if (video) {
        video.play().catch(() => {});
        video.focus();
      }
      break;
    }
    case 'guide-attest': {
      // Next never ticks the statements. Once the reader has ticked both, it confirms them.
      const form = $('attest');
      if (!form) break;
      if (form.checkValidity()) {
        form.requestSubmit();
        break;
      }
      form.querySelector('input:not(:checked)')?.focus({ preventScroll: true });
      coachAlert('Tick both statements first. The tour can’t attest for you.');
      break;
    }
    case 'sample-note':
      note.value = starterNote;
      note.focus();
      break;
    case 'manager-left':
      advanced = await send(signerNote, !inGuide);
      break;
    case 'change-order':
      choiceOpen = !choiceOpen;
      render();
      $('unit-options').querySelector('button')?.focus();
      break;
    case 'order':
      choiceOpen = false;
      advanced = await dispatch('order', { orderId: target.dataset.order });
      break;
    case 'fixture':
      advanced = await dispatch('fixture');
      break;
    case 'view-evidence': {
      const file = state.draft.file;
      const url = file && client.evidenceUrl(file);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      break;
    }
    case 'source':
    case 'diagnostics':
    case 'review':
    case 'upload':
    case 'reset':
      fillDialog(action);
      break;
    case 'close':
      dialog.close();
      break;
    case 'refresh':
      advanced = await dispatch('refresh');
      break;
    case 'sync':
      await dispatch('sync', { dropAck: $('drop-ack')?.checked === true });
      break;
    case 'guide-sync':
    case 'guide-drop-response':
      if (preview) advanced = await dispatch('sync', { dropAck: config.failpoint && action === 'guide-drop-response' });
      break;
    case 'confirm-reset':
      if (await dispatch('reset', { confirm: true })) {
        note.value = '';
        choiceOpen = false;
        dialog.close();
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (preview) $('welcome').querySelector('[data-action="start-guided"]')?.focus();
      }
      break;
  }
  if (inGuide && advanced) focusGuide();
});

// Esc skips the tour (a dialog closes itself first). "Show guide" brings it back at the same step.
// → presses Next, outside text fields.
document.addEventListener('keydown', (event) => {
  if (dialog.open || !step || !preview || event.defaultPrevented) return;
  if (event.key === 'Escape') {
    setGuide(false);
    render();
    $('connection').querySelector('[data-action="toggle-guide"]')?.focus({ preventScroll: true });
  } else if (event.key === 'ArrowRight' && !event.altKey && !event.metaKey && !event.ctrlKey
    && !event.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
    const next = guide.querySelector('.coach-next:not(:disabled)');
    if (next) {
      event.preventDefault();
      next.click();
    }
  }
});

document.addEventListener('input', (event) => {
  if (event.target.closest('#review')) validatePreview();
});

document.addEventListener('change', async (event) => {
  if (event.target.id !== 'review-order' || busy) return;
  const orderId = event.target.value;
  if (await dispatch('edit', { fields: readEdits($('review')) }) && await dispatch('order', { orderId })) fillDialog('review');
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['attest', 'upload', 'review'].includes(form.id)) return;
  event.preventDefault();
  if (busy) return;
  const data = new FormData(form);
  if (form.id === 'attest') {
    if (await dispatch('attest', { signed: data.has('signed'), belongs: data.has('belongs') })) focusGuide();
  } else if (form.id === 'upload') {
    const file = data.get('file');
    if (!file?.size || file.size > fileLimit) return notify('Choose a document under 2 MB.', true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mime = file.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' })[ext];
    if (await dispatch('upload', { name: file.name, mime, data: encodeFile(bytes), orderId: data.get('order') })) dialog.close();
  } else if (form.id === 'review' && !state.outbox) {
    if (event.submitter?.value === 'approve') {
      if (await dispatch('approve', { fields: readEdits(form), consent: $('approve-consent').checked })) {
        dialog.close();
        focusGuide();
      }
    } else if (await dispatch('edit', { fields: readEdits(form) })) {
      fillDialog('review');
      notify('Edits saved on this device.');
    }
  }
});

try {
  if (preview) {
    try {
      guideEnabled = localStorage.getItem(guidePreference) !== 'off';
    } catch {
      guideEnabled = true;
    }
  }
  ({ state, config } = await client.load());
  if (performance.getEntriesByType?.('navigation')[0]?.type === 'reload') {
    reloadedAt = String(state.rev);
    writeSession(reloadPreference, reloadedAt);
  }
  render();
  if (preview && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  $('runtime-label').textContent = 'Workspace unavailable';
  $('thread').innerHTML = '<div class="start"><h3>Could not open the workspace</h3><p>Check browser storage or restart the local app, then reload this page.</p></div>';
}
