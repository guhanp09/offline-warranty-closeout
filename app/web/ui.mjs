import { draftStatus, retrieveProcedure, selectedOrder } from '../core/workflow.mjs';

const paths = {
  chat: '<path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 2 1.5-4.4A7.5 7.5 0 0 1 2 11.5 7.5 7.5 0 0 1 9.5 4h4a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="M7 10h9m-9 4h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6m-6 4h6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  wifi: '<path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0m-9 3.4a4.8 4.8 0 0 1 6 0M12 19h.01"/>',
  offline: '<path d="M3 9a14 14 0 0 1 3-2m4-1.1A14 14 0 0 1 21 9M6 12.5a9.5 9.5 0 0 1 4-1.8m4.5 0a9.5 9.5 0 0 1 3.5 1.8m-9 3.4a4.8 4.8 0 0 1 6 0M12 19h.01M3 3l18 18"/>',
  box: '<path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v8"/>',
  clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 6V4h6v2m-6 5h6m-6 4h6"/>',
  signature: '<path d="M4 18h16M5 14c2 0 5-8 7-8s-1 7-1 8 2-1 3-2 2 2 3 2l3-2"/>',
  alert: '<path d="M12 8v5m0 3h.01"/><path d="M10.3 4.8a2 2 0 0 1 3.4 0l7.1 12.4A2 2 0 0 1 19 20H5a2 2 0 0 1-1.8-2.8z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  external: '<path d="M13 4h7v7m0-7-9 9m7 0v7H4V6h7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  refresh: '<path d="M19 8a8 8 0 1 0 1 7m-1-7V3m0 5h-5"/>',
};

export function icon(name, size = 18) {
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const button = (action, label, style = 'button-quiet', glyph = '') =>
  '<button type="button" class="button ' + style + '" data-action="' + action + '">' + (glyph ? icon(glyph, 16) : '') + label + '</button>';

export const starterNote = 'The ice machine wasn’t making ice. I changed the pump, ran a cycle, and it’s making ice again. Took about 40 minutes. Can I wrap up?';
export const signerNote = 'The manager already left.';

export function connectionUi(state, showToggle = true) {
  const status = state.offline ? 'Offline' : 'Online';
  return `<span class="connection-chip ${state.offline ? 'is-offline' : ''}">${icon(state.offline ? 'offline' : 'wifi', 17)}${status}</span>
    ${state.visit && showToggle ? button('toggle-connection', state.offline ? 'Go online' : 'Work offline', 'button-header') : ''}`;
}

export function headerUi(state, config) {
  const order = selectedOrder(state);
  const status = state.outbox?.status === 'synced' && config.remote === 'simulation' ? 'Simulation verified' : draftStatus(state);
  const tone = ['Awaiting signature', 'Needs review', 'Sign-in needed'].includes(status) ? 'amber'
    : ['Synced', 'Simulation verified', 'Ready to review'].includes(status) ? 'teal' : 'slate';
  return `<div class="visit-header">
    <div>
      <p class="visit-kicker">Field service <span> / </span> ${config.mode === 'preview' ? 'Browser demo' : 'Demo visit'}</p>
      <h1 id="visit-heading" tabindex="-1">${esc(state.visit?.title ?? 'North Dock Café')}</h1>
      <p class="visit-description">${order ? esc(order.model + '  ·  ' + order.ticket + '  ·  ' + order.location) : 'Hoshizaki ice machines  ·  Parts &amp; labor closeout'}</p>
    </div>
    <span class="status status-${tone}"><span class="status-dot"></span>${esc(status)}</span>
  </div>`;
}

export function threadUi(state, busy) {
  if (!state.visit) return `<div class="start">
    <div class="start-mark">${icon('box', 29)}</div>
    <h3>Prepare the visit</h3>
    <p>Two same-model ice machines are on this assignment. Save their work orders and the Hoshizaki procedure before heading offline.</p>
    ${button('prepare', busy ? 'Downloading…' : 'Download demo visit', 'button-primary', 'download')}
  </div>`;
  const content = state.messages.map((entry) => entry.role === 'technician'
    ? `<article class="message technician"><div class="message-body"><div class="message-label">You</div><p>${esc(entry.text)}</p></div></article>`
    : `<article class="message assistant"><div class="avatar">${icon('chat', 16)}</div><div class="message-body">
      <div class="message-label">Assistant</div><p>${esc(entry.text)}</p>
      ${entry.source ? '<button type="button" class="source-link" data-action="source">' + icon('doc', 14) + ' Hoshizaki · p. 3, item F</button>' : ''}
    </div></article>`).join('');
  return content + (busy === 'turn' ? '<p class="working"><span></span> Reading your service note…</p>' : '');
}

export function orderUi(state, show) {
  if (!state.visit || state.outbox || (!show && (state.draft.orderId && !state.draft.orderNeedsConfirmation)) || (!show && state.messages.length < 2)) return '';
  return `<div class="unit-options" aria-label="Cached work orders">
    ${state.visit.orders.map((order) => `<button type="button" class="unit-button" data-action="order" data-order="${esc(order.id)}">
      <span class="small-tile">${icon('box', 17)}</span>
      <span><strong>${esc(order.serial)}</strong><small>${esc(order.location)} · ${esc(order.ticket)}</small></span>${icon('arrow', 16)}
    </button>`).join('')}
  </div>`;
}

export function checklistUi(state, config, busy, guideAction) {
  const order = selectedOrder(state);
  const file = state.draft.file;
  const checks = state.checks;
  const done = checks.filter((check) => check.ok).length;
  const signature = checks.find((check) => check.key === 'signature');
  const correctFile = order && file?.orderId === order.id && file.serial === order.serial;
  const header = `<div class="card-head"><div class="card-title"><span class="tile">${icon('clipboard', 20)}</span>
    <div><h2 id="closeout-heading">Closeout checklist</h2><p>${order ? esc(order.serial) : 'Warranty coordinator handoff'}</p></div></div>
    ${state.visit ? '<span class="check-count">' + done + ' / ' + checks.length + '</span>' : ''}</div>`;
  if (!state.visit) return header + `<div class="check-content">
    <div class="empty-evidence"><span class="tile">${icon('signature', 22)}</span><div><strong>Customer signature</strong>
          <p>Check this before leaving the site.</p></div></div>
    <ul class="check-list starter-list">
      <li>${icon('box', 17)} Work order and serial</li>
      <li>${icon('doc', 17)} Hoshizaki claim procedure</li>
      <li>${icon('clipboard', 17)} Repair, parts and labor</li>
    </ul>
  </div>`;
  if (state.outbox) return header + transferUi(state, config, busy, Boolean(guideAction));

  const source = retrieveProcedure(state, 'signature');
  const signaturePanel = `<div class="signature ${signature.ok ? 'signature-ok' : ''}" id="signature-panel">
    <div class="signature-top"><span class="signature-icon">${icon(signature.ok ? 'check' : 'signature', 22)}</span>
      <div><h3>Customer signature</h3><p>${signature.ok ? 'Signed document confirmed' : order ? 'Required before approval' : 'Confirm the unit to attach evidence'}</p></div>
    </div>
    ${!signature.ok && source ? `<p class="signature-quote">“${esc(source.quote)}”</p>` : ''}
    ${source ? '<button type="button" class="source-link" data-action="source">' + icon('doc', 14) + ' Hoshizaki · p. 3, item F ' + icon('arrow', 14) + '</button>' : ''}
    ${file ? `<button type="button" class="file-row" data-action="view-evidence">${icon('doc', 17)}
      <span>${esc(file.name)}<small>${correctFile ? 'Saved on device' : 'Belongs to another work order'}</small></span>
      ${icon('external', 14)}</button>` : ''}
    ${correctFile && !signature.ok ? `<form id="attest" class="attest">
      <label><input type="checkbox" name="signed" required> The customer signed this document.</label>
      <label><input type="checkbox" name="belongs" required> This document belongs to ${esc(order.ticket)}.</label>
      <button type="submit" class="button button-primary">Confirm evidence</button>
      </form>` : ''}
    ${order && !state.draft.orderNeedsConfirmation && (!correctFile || signature.ok) ? `<div class="signature-actions">
      ${!signature.ok && guideAction !== 'fixture' ? button('fixture', 'Use example PDF', 'button-primary', 'doc') : ''}
      ${button('upload', signature.ok ? 'Replace file' : 'Attach a file', 'button-quiet', 'upload')}
    </div>` : ''}
  </div>`;
  return header + `<div class="check-content">
    <progress class="progress" value="${done}" max="${checks.length}" aria-label="Closeout checklist complete"></progress>
    ${signaturePanel}
    <ul class="check-list">
      ${checks.filter((check) => check.key !== 'signature').map((check) => `<li>
        <span class="check-icon ${check.ok ? 'is-done' : ''}">${icon(check.ok ? 'check' : 'clock', 15)}</span>
        <span>${esc(check.label)}${!check.ok && ['exception', 'policy'].includes(check.key) ? '<small>' + esc(check.detail) + '</small>' : ''}</span>
        ${check.key === 'order' && order ? button('change-order', 'Change', 'button-text') : ''}
      </li>`).join('')}
    </ul>
    <div class="review-actions">
      ${!checks[0].ok && !state.offline ? button('refresh', 'Refresh source', 'button-quiet', 'refresh') : ''}
      ${order ? button('review', 'Review closeout', 'button-primary', 'arrow') : ''}
    </div>
  </div>`;
}

function transferUi(state, config, busy, guided) {
  const { status, attempts, receipt, error } = state.outbox;
  const real = config.remote === 'salesforce';
  if (status === 'synced') return `<div class="check-content">
    <div class="transfer verified"><span class="signature-icon">${icon('check', 22)}</span>
      <h3>${real ? 'Synced to Salesforce' : 'Simulation verified'}</h3>
      <p>${real ? 'The closeout is ready for coordinator review.' : 'The simulated handoff is complete.'}</p>
      <dl class="receipt"><div><dt>Closeout</dt><dd>${receipt.closeoutCount} record</dd></div>
        <div><dt>Evidence</dt><dd>${receipt.fileCount} matching file</dd></div>
        <div><dt>Sync attempts</dt><dd>${attempts}</dd></div></dl>
      ${real ? `<div class="signature-actions"><a class="button button-primary" target="_blank" rel="noreferrer" href="${esc(receipt.url)}">Open closeout ${icon('external', 16)}</a>
        <a class="button button-quiet" target="_blank" rel="noreferrer" href="${esc(receipt.workOrderUrl)}">Work order ${icon('external', 16)}</a></div>` : ''}
    </div>
    ${button('review', 'View approved closeout', 'button-quiet', 'doc')}
  </div>`;
  const refreshable = ['JOB_CHANGED', 'SOURCE_CHANGED'].includes(error?.code);
  const stateLabel = status === 'review' ? 'Needs review' : status === 'auth' ? 'Sign-in needed' : 'Pending sync';
  const controls = state.offline ? button('toggle-connection', 'Go online', 'button-primary', 'wifi')
    : refreshable ? button('refresh', 'Refresh visit for review', 'button-primary', 'refresh')
      : status === 'review' ? '' : button('sync', busy === 'sync' ? 'Verifying…' : attempts ? 'Retry sync' : real ? 'Sync to Salesforce' : 'Simulate sync', 'button-primary', 'refresh');
  return `<div class="check-content">
    <div class="transfer">
      <span class="signature-icon">${icon(status === 'review' ? 'alert' : 'clock', 22)}</span>
      <h3>Saved on device · ${stateLabel}</h3>
      <p>${error ? esc(error.message) : state.offline ? 'Reconnect when you’re ready to send the approved closeout.' : 'Send the approved work order, repair details and signed PDF.'}</p>
      ${!guided && config.failpoint && !attempts && !state.offline ? '<label class="failpoint"><input type="checkbox" id="drop-ack"> Test a lost sync response</label>' : ''}
      ${controls && (!guided || refreshable) ? '<div class="signature-actions">' + controls + '</div>' : ''}
    </div>
    ${button('review', 'View approved closeout', 'button-quiet', 'doc')}
  </div>`;
}

export function dialogFrame(title, content, description = '') {
  return `<div class="dialog-header"><div><h2 id="dialog-title">${title}</h2>${description ? '<p>' + description + '</p>' : ''}</div>
    <button type="button" aria-label="Close dialog" class="button button-icon" data-action="close">${icon('close', 21)}</button></div>
    ${content}`;
}

export function sourceUi(state) {
  const source = retrieveProcedure(state, 'signature');
  if (!source) return dialogFrame('Hoshizaki procedure', '<div class="dialog-body"><p>The matching source is unavailable. Go online and refresh the visit.</p></div>');
  const passages = ['signature', 'final', 'identity', 'customer', 'repair', 'labor', 'parts', 'attachment'];
  return dialogFrame('Hoshizaki procedure', `<div class="dialog-body source-body">
    <div class="source-meta"><span>${esc(source.publisher)}</span><span>${esc(source.id)}</span><span>Saved on device</span></div>
    ${passages.map((key) => {
      const item = retrieveProcedure(state, key);
      if (!item) return '';
      return `<article class="passage ${key === 'signature' ? 'passage-main' : ''}"><p class="field-origin">Page ${item.page} · ${esc(item.section)}</p>
        <h3>${esc(item.title)}</h3>${item.quote ? '<blockquote>“' + esc(item.quote) + '”</blockquote>' : ''}<p>${esc(item.text)}</p></article>`;
    }).join('')}
    <a href="${esc(source.url)}#page=3" class="source-link" target="_blank" rel="noreferrer">${icon('external', 16)} Open publisher PDF online</a>
  </div>`, esc(source.document));
}

export function uploadUi(state) {
  return dialogFrame('Attach signed work order', `<form id="upload" class="dialog-body form-grid">
    <label class="span-all">Work order printed on the file<select name="order" required>
      <option value="">Choose a work order</option>
      ${state.visit.orders.map((item) => `<option value="${esc(item.id)}">${esc(item.ticket)} · ${esc(item.serial)}</option>`).join('')}
    </select></label>
    <label class="span-all">Signed document<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required></label>
    <p class="form-note span-all">PDF, JPEG or PNG. Up to 2 MB. The file is saved on this device.</p>
    <button class="button button-primary" type="submit">${icon('upload', 16)} Attach document</button>
  </form>`);
}

export function repairSummaryUi(fields) {
  const parts = fields.noParts ? 'No parts installed' : fields.partQty + ' × ' + fields.partNumber;
  const rows = [
    ['Problem', fields.complaint], ['Repair', fields.remedy], ['Test', fields.outcome],
    ['Labor', fields.laborMinutes + ' min'], ['Parts', parts],
  ];
  return rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');
}

export function reviewUi(state, config, compact = false) {
  const order = selectedOrder(state);
  const { fields, origins, file, attestation } = state.draft;
  const locked = !!state.outbox;
  const disabled = locked ? ' disabled' : '';
  const attr = (key) => ' name="' + key + '"' + disabled;
  const origin = (key) => origins[key] ? ' <small class="field-origin">' + esc(origins[key]) + '</small>' : '';
  const input = (key, label, kind, options = '') => `<label><span>${label}${origin(key)}</span><input${attr(key)} type="${kind}" value="${esc(fields[key])}" ${options}></label>`;
  const note = (key, label) => `<label class="span-all"><span>${label}${origin(key)}</span><textarea${attr(key)} maxlength="500" rows="2">${esc(fields[key])}</textarea></label>`;
  const formFields = `<div class="form-grid">
    ${input('failedOn', 'Failure date', 'date')}
    ${input('repairedOn', 'Repair date', 'date')}
    ${note('complaint', 'Reported problem')}
    ${note('remedy', 'Completed repair')}
    ${note('outcome', 'Operational check')}
    ${input('laborMinutes', 'Labor minutes', 'number', 'min="0.01" max="1440" step="0.01"')}
    <label class="checkbox-field"><input type="checkbox" name="noParts" ${fields.noParts ? 'checked' : ''}${disabled}> No parts installed</label>
    ${fields.noParts && locked ? '' : input('partNumber', 'Part number', 'text', 'maxlength="80"')}
    ${fields.noParts && locked ? '' : input('partQty', 'Part quantity', 'number', 'min="1" max="999" step="1"')}
    ${fields.exception || !locked ? note('exception', 'Coordinator exception, if any') : ''}
  </div>`;
  const showSummary = compact && (locked || state.checks.every((check) => check.ok));
  const repairDetails = showSummary ? `<div class="review-fields">
    <dl class="review-summary" id="repair-summary">${repairSummaryUi(fields)}</dl>
    <details><summary>${locked ? 'View all closeout fields' : 'View or edit all fields'}</summary>${formFields}</details>
  </div>` : formFields;
  return dialogFrame(locked ? 'Approved closeout' : 'Review closeout', `<form id="review" class="dialog-body">
    <div class="review-identity">
      ${locked ? `<div><b>${esc(order?.ticket)}</b> · ${esc(order?.serial)} · ${esc(order?.model)}</div>`
      : `<label><span>Work order &amp; serial <small class="field-origin">cached job</small></span>
        <select id="review-order" aria-label="Work order and serial">
          ${state.visit.orders.map((item) => `<option value="${esc(item.id)}" ${item.id === order?.id ? 'selected' : ''}>${esc(item.ticket)} · ${esc(item.serial)} · ${esc(item.location)}</option>`).join('')}
        </select></label>`}
      <p>${esc(order?.model)} · ${esc(Object.values(order?.customer ?? {}).join(', '))}</p>
    </div>
    ${repairDetails}
    <div class="review-evidence">
      ${icon('signature', 21)}<div><strong>Signed work order</strong><p>${file ? esc(file.name) + (attestation ? ' · Attested by technician' : ' · Confirmation pending') : 'Awaiting attachment'}</p></div>
      ${file ? button('view-evidence', 'Open', 'button-text', 'external') : ''}
    </div>
    ${locked ? '' : `<div class="approval">
      <p id="review-validation" class="form-note"></p>
      <label><input type="checkbox" id="approve-consent"> I approve transferring these fields and this signed document to ${config.remote === 'salesforce' ? 'Salesforce' : 'the demo destination'}.</label>
      <div class="signature-actions">
        <button class="button button-quiet" type="submit" value="save">Save edits</button>
        <button class="button button-primary" type="submit" value="approve" id="approve" disabled>Approve closeout ${icon('arrow', 16)}</button>
      </div>
    </div>`}
  </form>`, locked ? 'This is the package approved for transfer.' : 'Check the repair details and evidence before approving the transfer.');
}

export function diagnosticsUi(state) {
  const labels = {
    'tool.lookup_work_orders': 'lookup_work_orders',
    'tool.retrieve_procedure': 'retrieve_procedure',
    'tool.update_draft': 'update_draft',
  };
  return dialogFrame('Device diagnostics', `<div class="dialog-body">
    ${state.events.length ? `<ul class="events">${state.events.slice().reverse().map(({ at, name, ...details }) => `<li>
      <time>${esc(new Date(at).toLocaleTimeString([], { timeStyle: 'medium' }))}</time><div><strong>${esc(labels[name] || name)}</strong>
      <code>${esc(Object.entries(details).map(([key, value]) => key + '=' + String(value)).join(' · '))}</code></div></li>`).join('')}</ul>` : '<p>No workflow events yet.</p>'}
  </div>`, 'Local tool calls, validation and sync outcomes.');
}
