import { checks, editDraft } from '../core/workflow.mjs';
import { encodeFile, fileLimit } from '../core/evidence.mjs';
import { localClient, previewClient } from './client.mjs';
import { guideStep, guideUi, repositoryUrl, welcomeUi } from './guide.mjs';
import { microphone } from './mic.mjs';
import {
  checklistUi, connectionUi, diagnosticsUi, dialogFrame, headerUi, icon, orderUi, repairSummaryUi, reviewUi,
  signerNote, sourceUi, starterNote, threadUi, uploadUi,
} from './ui.mjs';

const $ = (id) => document.getElementById(id);
const preview = document.body.dataset.mode === 'preview';
const client = preview ? previewClient() : localClient();
const dialog = $('dialog');
const note = $('note');
const layout = $('visit-layout');
const narrowLayout = window.matchMedia('(max-width: 730px)');
const guidePreference = 'warranty-closeout:guide';
let state;
let config;
let busy;
let guideEnabled = true;
let choiceOpen = false;
let recording = false;
let transcribing = false;
let noticeTimer;

$('conversation-icon').innerHTML = icon('chat', 21);

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

narrowLayout.addEventListener('change', arrangePanels);

function render() {
  const showWelcome = preview && !state.visit;
  const step = preview && state.visit && guideEnabled ? guideStep(state, config) : null;
  const orders = orderUi(state, choiceOpen);
  $('welcome').hidden = !showWelcome;
  $('welcome').innerHTML = showWelcome ? welcomeUi(busy) : '';
  $('visit').hidden = showWelcome;
  $('visit').dataset.highlight = step?.highlight ?? '';
  layout.toggleAttribute('data-checklist-first', Boolean(step && step.stage >= 2));
  arrangePanels();
  $('guide').hidden = !step;
  $('guide').innerHTML = step ? guideUi(step, busy, orders) : '';
  $('connection').innerHTML = showWelcome
    ? `<a class="button button-header" href="${repositoryUrl}" target="_blank" rel="noreferrer">GitHub ${icon('external', 15)}</a>`
    : (preview ? `<button type="button" class="button button-header" data-action="toggle-guide" aria-controls="guide" aria-expanded="${Boolean(step)}">${step ? 'Hide guide' : 'Show guide'}</button>` : '')
      + connectionUi(state, !step);
  $('visit-header').innerHTML = headerUi(state, config);
  $('thread').innerHTML = threadUi(state, busy);
  $('unit-options').innerHTML = step?.chooseUnit ? '' : orders;
  $('closeout').innerHTML = checklistUi(state, config, busy, step?.action);
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
  if (state.draft.orderId && !state.draft.attestation && !state.draft.file && !state.draft.fields.signatureUnavailable && step?.action !== 'manager-left') {
    suggestions.push('<button type="button" class="suggestion" data-action="manager-left">The manager already left</button>');
  }
  $('suggestions').innerHTML = suggestions.join('');
  const thread = $('thread');
  thread.scrollTop = thread.scrollHeight;
  renderMic();
}

function setGuide(enabled) {
  guideEnabled = enabled;
  localStorage.setItem(guidePreference, enabled ? 'on' : 'off');
}

function focusGuide() {
  $('guide-heading')?.focus();
}

function fillDialog(kind) {
  const content = {
    source: () => sourceUi(state),
    diagnostics: () => diagnosticsUi(state),
    review: () => reviewUi(state, config, preview && guideEnabled),
    upload: () => uploadUi(state),
    reset: () => dialogFrame('Start a fresh visit?', '<div class="dialog-body"><p>This clears the current draft, conversation and evidence from this workspace.</p><div class="signature-actions"><button type="button" class="button button-quiet" data-action="close">Keep visit</button><button type="button" class="button button-primary" data-action="confirm-reset">Start over</button></div></div>'),
  };
  $('dialog-inner').innerHTML = content[kind]();
  if (!dialog.open) dialog.showModal();
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
      if (await dispatch('prepare')) (guideEnabled ? $('guide-heading') : $('visit-heading'))?.focus();
      break;
    case 'toggle-guide':
      setGuide(!guideEnabled);
      render();
      if (guideEnabled) focusGuide();
      else $('connection').querySelector('[data-action="toggle-guide"]')?.focus();
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
    case 'guide-attest':
      $('attest')?.querySelector('input')?.focus();
      break;
    case 'guide-reload':
      window.location.reload();
      break;
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
        if (preview) $('welcome').querySelector('[data-action="start-guided"]')?.focus();
      }
      break;
  }
  if (inGuide && advanced) focusGuide();
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
  if (preview) guideEnabled = localStorage.getItem(guidePreference) !== 'off';
  ({ state, config } = await client.load());
  render();
  if (preview && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  $('runtime-label').textContent = 'Workspace unavailable';
  $('thread').innerHTML = '<div class="start"><h3>Could not open the workspace</h3><p>Check browser storage or restart the local app, then reload this page.</p></div>';
}
