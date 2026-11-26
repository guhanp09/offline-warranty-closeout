import { checks, editDraft } from '../core/workflow.mjs';
import { encodeFile, fileLimit } from '../core/evidence.mjs';
import { localClient, previewClient } from './client.mjs';
import { microphone } from './mic.mjs';
import {
  checklistUi, connectionUi, diagnosticsUi, dialogFrame, headerUi, icon, orderUi, reviewUi,
  signerNote, sourceUi, starterNote, threadUi, uploadUi,
} from './ui.mjs';

const $ = (id) => document.getElementById(id);
const preview = document.body.dataset.mode === 'preview';
const client = preview ? previewClient() : localClient();
const dialog = $('dialog');
const note = $('note');
let state;
let config;
let busy;
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

function render() {
  $('connection').innerHTML = connectionUi(state);
  $('visit-header').innerHTML = headerUi(state, config);
  $('thread').innerHTML = threadUi(state, busy);
  $('unit-options').innerHTML = orderUi(state, choiceOpen);
  $('closeout').innerHTML = checklistUi(state, config, busy);
  $('runtime-label').textContent = config.mode === 'preview' ? 'Browser demo · Sample parser'
    : config.model ? config.model + ' · On-device model' : 'Local app · Sample parser';
  $('cache-state').innerHTML = state.visit
    ? '<button class="cache-tag" type="button" data-action="source">' + icon('check', 14) + '2 jobs &amp; source cached</button>' : '';
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
}

function fillDialog(kind) {
  const content = {
    source: () => sourceUi(state),
    diagnostics: () => diagnosticsUi(state),
    review: () => reviewUi(state, config),
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
    const missing = checks(copy).filter((item) => !item.ok);
    $('approve').disabled = missing.length > 0 || !$('approve-consent').checked;
    label.textContent = missing.length ? missing[0].detail : 'The checklist is complete.';
  } catch (error) {
    $('approve').disabled = true;
    label.textContent = error.message;
  }
}

async function send(text = note.value) {
  if (!text.trim() || busy) return;
  const success = await dispatch('turn', { text });
  if (success) note.value = '';
  note.focus();
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
  switch (action) {
    case 'prepare':
      await dispatch('prepare');
      break;
    case 'toggle-connection':
      await dispatch('connection', { offline: !state.offline });
      break;
    case 'sample-note':
      note.value = starterNote;
      note.focus();
      break;
    case 'manager-left':
      await send(signerNote);
      break;
    case 'change-order':
      choiceOpen = !choiceOpen;
      render();
      $('unit-options').querySelector('button')?.focus();
      break;
    case 'order':
      choiceOpen = false;
      await dispatch('order', { orderId: target.dataset.order });
      break;
    case 'fixture':
      await dispatch('fixture');
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
      await dispatch('refresh');
      break;
    case 'sync':
      await dispatch('sync', { dropAck: $('drop-ack')?.checked === true });
      break;
    case 'confirm-reset':
      if (await dispatch('reset', { confirm: true })) {
        note.value = '';
        choiceOpen = false;
        dialog.close();
      }
      break;
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
    await dispatch('attest', { signed: data.has('signed'), belongs: data.has('belongs') });
  } else if (form.id === 'upload') {
    const file = data.get('file');
    if (!file?.size || file.size > fileLimit) return notify('Choose a document under 2 MB.', true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mime = file.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' })[ext];
    if (await dispatch('upload', { name: file.name, mime, data: encodeFile(bytes), orderId: data.get('order') })) dialog.close();
  } else if (form.id === 'review' && !state.outbox) {
    if (event.submitter?.value === 'approve') {
      if (await dispatch('approve', { fields: readEdits(form), consent: $('approve-consent').checked })) dialog.close();
    } else if (await dispatch('edit', { fields: readEdits(form) })) {
      fillDialog('review');
      notify('Edits saved on this device.');
    }
  }
});

try {
  ({ state, config } = await client.load());
  render();
  if (preview && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  $('runtime-label').textContent = 'Workspace unavailable';
  $('thread').innerHTML = '<div class="start"><h3>Could not open the workspace</h3><p>Check browser storage or restart the local app, then reload this page.</p></div>';
}
