import { cleanObservations, repairKeys } from './observations.mjs';

export class WorkflowError extends Error {
  constructor(message, code = 'INVALID_ACTION') {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}

function requireAction(condition, message, code) {
  if (!condition) throw new WorkflowError(message, code);
}

export function newState() {
  return {
    rev: 0, visit: null, procedure: null, offline: false,
    draft: { orderId: null, orderNeedsConfirmation: false, fields: {}, origins: {}, file: null, attestation: null },
    messages: [], events: [], outbox: null,
  };
}

export const selectedOrder = (state) => state.visit?.orders.find((order) => order.id === state.draft.orderId);
export const draftFile = (state) => {
  const { file } = state.draft;
  if (!file) return null;
  const { data, ...details } = file;
  return details;
};

export function viewState(state) {
  const { outbox, ...details } = state;
  return {
    ...details,
    draft: { ...state.draft, file: draftFile(state) },
    outbox: outbox ? {
      id: outbox.id, status: outbox.status, attempts: outbox.attempts, receipt: outbox.receipt, error: outbox.error,
    } : null,
    checks: checks(state),
  };
}

export function recordEvent(state, name, details = {}) {
  state.events.push({ at: new Date().toISOString(), name, ...details });
  state.events = state.events.slice(-60);
}

function message(state, role, text, source) {
  state.messages.push({ role, text, source });
  state.messages = state.messages.slice(-80);
}

export function prepare(state, visit, procedure) {
  requireAction(!state.offline, 'Go online to prepare the visit.');
  requireAction(!state.visit, 'This visit is already saved.');
  state.visit = visit;
  state.procedure = procedure;
  recordEvent(state, 'visit.cached', { orders: visit.orders.length, source: procedure?.id });
  message(state, 'assistant', 'Both work orders and the Hoshizaki procedure are saved on this device. Tell me what happened at the machine.');
  return state;
}

export function lookupWorkOrders(state, text = '') {
  if (!state.visit) return [];
  const normalized = text.toUpperCase().replace(/[–—]/g, '-').replace(/\b(\d{2})[ ,](\d{3})\b/g, '$1$2');
  const orders = state.visit.orders;
  const other = /\b(?:ACTUALLY|MEANT|SWITCH|CHANGE|CORRECT|IT WAS)\b.*\b(?:THE )?OTHER (?:UNIT|ONE|MACHINE)\b/.test(normalized);
  if (other && state.draft.orderId && orders.length === 2) return orders.filter((order) => order.id !== state.draft.orderId);
  const tokens = normalized.split(/[^A-Z0-9]+/);
  const fixed = orders.filter((order) => {
    const suffix = order.serial.match(/\d+$/)?.[0] ?? order.serial;
    const ticket = order.ticket.replace(/^WO-/i, '');
    return normalized.includes(order.serial.toUpperCase()) || normalized.includes(order.ticket.toUpperCase())
      || tokens.includes(suffix) || tokens.includes(suffix.slice(-4)) || (ticket.length >= 4 && tokens.includes(ticket))
      || (order.location && normalized.includes(order.location.toUpperCase()))
      || (order.location === 'Prep room' && tokens.includes('PREP'));
  });
  // “Not 17042, it was 17086” rebinds to the affirmative reference.
  if (fixed.length === 2) {
    const negation = normalized.match(/\b(?:NOT|INSTEAD OF|RATHER THAN)\s+(?:THE\s+)?(?:UNIT\s+)?([A-Z0-9-]+(?: ROOM)?)/);
    if (negation) {
      return fixed.filter((order) => ![order.serial, order.serial.slice(-5), order.serial.slice(-4), order.ticket, order.location]
        .some((alias) => alias?.toUpperCase() === negation[1]));
    }
  }
  if (fixed.length === 1) {
    const [order] = fixed;
    const onlyNegated = [order.serial, order.serial.slice(-5), order.serial.slice(-4), order.ticket, order.location]
      .some((alias) => alias && normalized.includes('NOT ' + alias.toUpperCase()));
    if (onlyNegated || /\b(?:MAYBE|NOT SURE|EITHER|COULD BE|POSSIBLY|I THINK)\b/.test(normalized)) return [];
  }
  return fixed;
}

export function retrieveProcedure(state, key, now = Date.now()) {
  const { visit, procedure } = state;
  if (!visit || !procedure || procedure.id !== visit.policyId || procedure.workflow !== visit.workflow
    || !/^[a-f0-9]{64}$/.test(procedure.sha256) || procedure.id !== 'hoshizaki-' + procedure.sha256.slice(0, 8)
    || !Number.isFinite(Date.parse(procedure.reviewBy)) || Date.parse(procedure.reviewBy) <= now) return null;
  const passage = procedure.passages?.[key];
  return passage ? {
    ...passage, id: procedure.id, publisher: procedure.publisher, document: procedure.title, url: procedure.url,
  } : null;
}

function expectEditable(state) {
  requireAction(state.visit, 'Prepare the visit before starting a closeout.');
  requireAction(!state.outbox, 'This approved closeout is locked.');
}

export function selectOrder(state, id) {
  expectEditable(state);
  const order = state.visit.orders.find((candidate) => candidate.id === id);
  requireAction(order, 'Choose a work order from the cached visit.');
  state.draft.orderNeedsConfirmation = false;
  if (state.draft.orderId !== order.id) {
    const { fields, origins } = state.draft;
    state.draft.orderId = order.id;
    state.draft.attestation = null;
    for (const field of ['failedOn', 'repairedOn']) {
      if (origins[field] !== 'technician') writeField(state, field, order[field] ?? '', 'cached job');
    }
    for (const key of ['partNumber', 'partQty']) {
      if (origins[key] === 'cached job') {
        delete fields[key];
        delete origins[key];
      }
    }
    applyIssuedPart(state, order);
    recordEvent(state, 'work_order.selected', { evidenceMatches: bindingMatches(state) });
  }
  return order;
}

function writeField(state, key, value, origin = 'technician') {
  state.draft.fields[key] = value;
  state.draft.origins[key] = origin;
}

function applyIssuedPart(state, order) {
  const { fields } = state.draft;
  const part = order?.issuedPart;
  if (part && fields.part && /\bpump\b/i.test(fields.part) && !fields.noParts
    && !/\b(?:drain|remote|condensate|booster|recirculation motor)\b/i.test(fields.part)) {
    if (!fields.partNumber) writeField(state, 'partNumber', part.number, 'cached job');
    if (!fields.partQty && fields.partNumber === part.number) writeField(state, 'partQty', part.quantity, 'cached job');
  }
}

export function updateDraft(state, input) {
  expectEditable(state);
  const obs = cleanObservations(input);
  for (const key of ['complaint', 'remedy', 'outcome', 'laborMinutes', 'exception']) {
    if (key in obs) writeField(state, key, obs[key]);
  }
  if (obs.noParts) {
    writeField(state, 'noParts', true);
    for (const key of ['part', 'partNumber', 'partQty']) {
      delete state.draft.fields[key];
      delete state.draft.origins[key];
    }
  } else if (obs.part) {
    if (state.draft.fields.part && state.draft.fields.part.toLowerCase() !== obs.part.toLowerCase()) {
      for (const key of ['partNumber', 'partQty']) {
        delete state.draft.fields[key];
        delete state.draft.origins[key];
      }
    }
    delete state.draft.fields.noParts;
    delete state.draft.origins.noParts;
    writeField(state, 'part', obs.part);
    if (/^[A-Z0-9][A-Z0-9.-]*\d[A-Z0-9.-]*$/i.test(obs.part)) writeField(state, 'partNumber', obs.part.toUpperCase());
  }
  if (obs.partQty && !obs.noParts) writeField(state, 'partQty', obs.partQty);
  if (obs.signatureUnavailable) {
    state.draft.attestation = null;
    writeField(state, 'signatureUnavailable', true);
  }
  applyIssuedPart(state, selectedOrder(state));
  return Object.keys(obs).length;
}

export function editDraft(state, edits) {
  expectEditable(state);
  requireAction(edits && typeof edits === 'object', 'Enter the repair details first.');
  for (const key of repairKeys) {
    if (!(key in edits)) continue;
    let value = edits[key];
    if (key === 'laborMinutes' || key === 'partQty') {
      value = value === '' ? null : Number(value);
      const max = key === 'laborMinutes' ? 1440 : 999;
      requireAction(value === null || (Number.isFinite(value) && value > 0 && value <= max
        && (key !== 'partQty' || Number.isInteger(value))), 'Check the labor time or part quantity.');
    } else {
      requireAction(typeof value === 'string' && value.length <= (key === 'partNumber' ? 80 : 500), 'Check the length of the edited field.');
      value = value.trim();
    }
    if (value !== state.draft.fields[key]) writeField(state, key, value);
  }
  if ('noParts' in edits) {
    requireAction(typeof edits.noParts === 'boolean', 'Choose whether parts were used.');
    if (edits.noParts !== Boolean(state.draft.fields.noParts)) writeField(state, 'noParts', edits.noParts);
  }
  recordEvent(state, 'draft.edited');
  return state;
}

function bindingMatches(state) {
  const order = selectedOrder(state);
  const file = state.draft.file;
  return !!(order && file && file.orderId === order.id && file.serial === order.serial);
}

export function attachEvidence(state, file) {
  expectEditable(state);
  const order = state.visit.orders.find((candidate) => candidate.id === file.orderId);
  requireAction(order && file.serial === order.serial, 'Identify the cached job for this document.');
  state.draft.file = file;
  state.draft.attestation = null;
  recordEvent(state, 'evidence.attached', { evidenceMatches: bindingMatches(state) });
  return state;
}

export function attestEvidence(state, input) {
  expectEditable(state);
  requireAction(bindingMatches(state) && !state.draft.orderNeedsConfirmation, 'Confirm the work order and attach its signed document.');
  requireAction(input?.signed === true && input?.belongs === true, 'Confirm the signature and the work order.');
  const { file } = state.draft;
  state.draft.attestation = { fileId: file.id, orderId: file.orderId, at: new Date().toISOString() };
  recordEvent(state, 'evidence.attested');
  return state;
}

function validDate(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input ?? '')) return false;
  const date = new Date(input);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === input;
}

export function checks(state, now = Date.now()) {
  const order = selectedOrder(state);
  const { fields, file, attestation, orderNeedsConfirmation } = state.draft;
  const signature = retrieveProcedure(state, 'signature', now);
  const make = (key, label, ok, detail, action) => ({ key, label, ok: Boolean(ok), detail, action });
  const orderOk = order?.ticket && order.serial && order.model && order.revision && !orderNeedsConfirmation;
  const partOk = Boolean(fields.noParts) || (fields.partNumber && fields.partQty > 0);
  const dateOk = validDate(fields.failedOn) && validDate(fields.repairedOn) && fields.repairedOn >= fields.failedOn;
  const repairOk = fields.complaint && fields.remedy && fields.outcome;
  const customer = order?.customer;
  const customerOk = customer && ['name', 'street', 'city', 'region', 'postalCode'].every((key) => customer[key]);
  const signatureOk = bindingMatches(state) && attestation?.fileId === file?.id && attestation?.orderId === order?.id;
  let evidenceDetail = 'Attach the signed work order while you’re on site.';
  if (file) evidenceDetail = bindingMatches(state) ? 'Confirm the customer signed and this file is for the selected job.'
    : 'This document belongs to another work order. Attach the correct file.';
  return [
    make('policy', 'Hoshizaki procedure', signature && ['identity', 'customer', 'repair', 'labor', 'parts', 'attachment', 'final']
      .every((key) => retrieveProcedure(state, key, now)), 'Refresh the procedure online before approving.', 'source'),
    make('order', 'Work order & serial', orderOk, 'Confirm which ice machine was serviced.', 'order'),
    make('signature', 'Customer signature', signatureOk, evidenceDetail, 'evidence'),
    make('customer', 'Service location', customerOk, 'Ask the coordinator to complete the service address in the work order.', 'preview'),
    make('dates', 'Failure & repair dates', dateOk, 'Enter the failure and repair dates.', 'preview'),
    make('repair', 'Problem, remedy & test', repairOk, !fields.complaint ? 'What problem did you observe?'
      : !fields.remedy ? 'What repair did you actually complete?' : 'What did the machine do after your test?', 'preview'),
    make('labor', 'Labor time', fields.laborMinutes > 0, 'How many minutes did the repair take?', 'preview'),
    make('parts', 'Part number & quantity', partOk, 'What part number and quantity did you install?', 'preview'),
    make('exception', 'Coordinator exceptions', !fields.exception, 'Ask a coordinator to review the flagged detail.', 'preview'),
  ];
}

export function draftStatus(state) {
  if (!state.visit) return 'Visit available';
  if (state.outbox) return {
    pending: 'Pending sync', retry: 'Pending sync', auth: 'Sign-in needed', review: 'Needs review', synced: 'Synced',
  }[state.outbox.status];
  const list = checks(state);
  if (!list.find((item) => item.key === 'policy').ok || state.draft.fields.exception) return 'Needs review';
  if (!state.draft.orderId || state.draft.orderNeedsConfirmation) return 'Identify the unit';
  if (!list.find((item) => item.key === 'signature').ok
    && (list.find((item) => item.key === 'repair').ok || state.draft.fields.signatureUnavailable)) return 'Awaiting signature';
  return list.every((item) => item.ok) ? 'Ready to review' : 'Draft incomplete';
}

function nextReply(state) {
  const list = checks(state);
  const order = selectedOrder(state);
  if (!list[0].ok) return { text: list[0].detail };
  if (!order || state.draft.orderNeedsConfirmation) {
    return { text: 'Which unit did you service? ' + state.visit.orders.map((item) => item.serial + ' (' + item.location + ')').join(' or ') + '?' };
  }
  const repair = list.find((item) => item.key === 'repair');
  if (state.draft.fields.exception) return { text: 'The repair has an exception. Add the detail in the preview and ask the coordinator to review it.' };
  if (!repair.ok && !state.draft.fields.signatureUnavailable) return { text: repair.detail };
  if (!list[2].ok) {
    const source = retrieveProcedure(state, 'signature');
    if (state.draft.file && !bindingMatches(state)) return { text: 'I matched ' + order.ticket + ' to ' + order.serial + '. ' + list[2].detail, source: 'signature' };
    if (state.draft.fields.signatureUnavailable && !state.draft.file) {
      return { text: 'Draft saved as Awaiting signature. You can reopen it offline and attach the signed work order when it’s available.', source: 'signature' };
    }
    return { text: 'I matched ' + order.ticket + ' to ' + order.serial + '. “' + source.quote + '” ' + list[2].detail, source: 'signature' };
  }
  const missing = list.find((item) => !item.ok);
  if (missing) return { text: missing.detail };
  return { text: 'The checklist is complete. Review the fields and signed work order, then approve the transfer when you’re ready.' };
}

export function conversationTurn(state, text, observations, diagnostics = {}) {
  expectEditable(state);
  requireAction(typeof text === 'string' && text.trim() && text.length <= 1500, 'Enter a service note up to 1,500 characters.');
  const candidates = lookupWorkOrders(state, text);
  const mentionsUnmatchedSerial = /\b(?:DEMO-KM-[A-Z0-9-]+|serial(?: number)?\s+[#]?\d{4,})\b/i.test(text);
  const uncertainReference = /\b(?:maybe|not sure|either|could be|possibly|I think|not)\b/i.test(text)
    && state.visit.orders.some((order) => text.toUpperCase().includes(order.serial.slice(-5)));
  if (candidates.length === 1) selectOrder(state, candidates[0].id);
  else if (candidates.length > 1 || mentionsUnmatchedSerial || uncertainReference) state.draft.orderNeedsConfirmation = true;
  if (diagnostics.failed) {
    message(state, 'technician', text.trim());
    message(state, 'assistant', 'The local model is unavailable. Your note was saved. Retry the note after restarting Ollama, or enter the details in the preview.');
    recordEvent(state, 'model.unavailable', { model: diagnostics.model, latencyMs: diagnostics.latencyMs });
    return state;
  }
  const count = updateDraft(state, observations);
  const reply = nextReply(state);
  const reference = reply.source ? retrieveProcedure(state, reply.source) : null;
  message(state, 'technician', text.trim());
  message(state, 'assistant', reply.text, reply.source);
  recordEvent(state, 'tool.lookup_work_orders', { candidates: candidates.length });
  recordEvent(state, 'tool.retrieve_procedure', { source: reference?.id, page: reference?.page });
  recordEvent(state, 'tool.update_draft', { fields: count, ...diagnostics });
  recordEvent(state, 'draft.validated', { missing: checks(state).filter((item) => !item.ok).map((item) => item.key) });
  return state;
}

export function confirmOrder(state, id) {
  const order = selectOrder(state, id);
  message(state, 'technician', order.serial + ' · ' + order.location);
  const reply = nextReply(state);
  message(state, 'assistant', reply.text, reply.source);
  return state;
}

export function approve(state, consent, id, now = Date.now()) {
  expectEditable(state);
  requireAction(consent === true, 'Review the transfer and confirm approval.');
  const missing = checks(state, now).filter((item) => !item.ok);
  requireAction(!missing.length, missing[0]?.detail ?? 'Complete the checklist before approval.');
  const order = selectedOrder(state);
  const { fields, origins, attestation, file } = state.draft;
  const payload = {
    order: {
      id: order.id, ticket: order.ticket, serial: order.serial, model: order.model, revision: order.revision,
      customer: order.customer, key: order.key,
    },
    repair: {
      complaint: fields.complaint, remedy: fields.remedy, outcome: fields.outcome, failedOn: fields.failedOn,
      repairedOn: fields.repairedOn, laborMinutes: fields.laborMinutes,
      partNumber: fields.noParts ? null : fields.partNumber, partQty: fields.noParts ? 0 : fields.partQty,
    },
    attestation,
    source: { id: state.procedure.id, page: state.procedure.passages.signature.page },
    evidence: { name: file.name, mime: file.mime, sha256: file.sha256, size: file.size },
  };
  state.outbox = {
    id, payload, fileId: file.id, approvedAt: new Date(now).toISOString(), status: 'pending', attempts: 0,
  };
  recordEvent(state, 'outbox.approved', { source: payload.source.id, provenance: [...new Set(Object.values(origins))] });
  return state;
}

export function refreshVisit(state, visit, procedure) {
  requireAction(state.visit && !state.offline, 'Go online to refresh the visit.');
  const refreshable = state.outbox?.status === 'review' && ['JOB_CHANGED', 'SOURCE_CHANGED'].includes(state.outbox.error?.code);
  requireAction(!state.outbox || refreshable,
    'The approved closeout needs coordinator review.');
  const oldOrder = selectedOrder(state);
  state.visit = visit;
  state.procedure = procedure;
  if (refreshable) state.outbox = null;
  if (oldOrder) {
    const updated = selectedOrder(state);
    if (!updated || updated.revision !== oldOrder.revision) {
      state.draft.orderId = null;
      state.draft.orderNeedsConfirmation = true;
      state.draft.attestation = null;
    }
  }
  recordEvent(state, 'visit.refreshed', { source: procedure.id });
  return state;
}
