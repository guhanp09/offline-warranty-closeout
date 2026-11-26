import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { applyAction } from '../app/core/actions.mjs';
import { evidenceFile } from '../app/core/evidence.mjs';
import { groundedObservations, sampleObservations } from '../app/core/observations.mjs';
import {
  approve, attachEvidence, attestEvidence, checks, confirmOrder, conversationTurn, draftStatus, editDraft, newState,
  prepare, refreshVisit, retrieveProcedure, selectedOrder,
} from '../app/core/workflow.mjs';
import { cacheProcedure } from '../fixtures/procedure.mjs';
import { demoVisit } from '../fixtures/visit.mjs';

const note = 'The machine wasn’t making ice. I replaced the pump. The test cycle passed and it’s making ice again. 40 minutes.';
const fixture = (name) => readFile(new URL('../fixtures/' + name, import.meta.url));
const prep = () => prepare(newState(), demoVisit(), cacheProcedure());
const say = (state, text) => conversationTurn(state, text, sampleObservations(text));
const check = (state, key) => checks(state).find((item) => item.key === key);
const actions = { loadVisit: demoVisit, getFixture: fixture };

test('same-model complaint asks for both serials and preserves facts through confirmation', () => {
  const state = prep();
  state.offline = true;
  say(state, note);
  assert.equal(state.draft.orderId, null);
  assert.match(state.messages.at(-1).text, /DEMO-KM-17042.+DEMO-KM-17086/);
  say(state, 'It was serial ending 7086.');
  assert.equal(selectedOrder(state).ticket, 'WO-1086');
  assert.equal(state.draft.fields.laborMinutes, 40);
  assert.equal(state.draft.origins.laborMinutes, 'technician');
  assert.equal(state.draft.fields.partNumber, 'DEMO-PUMP-01');
  assert.equal(state.draft.origins.partNumber, 'cached job');
  assert.equal(draftStatus(state), 'Awaiting signature');
  assert.equal(state.messages.at(-1).source, 'signature');
  assert.equal(retrieveProcedure(state, 'signature').section, 'II.b · Section 2, item F');
  assert.equal(retrieveProcedure(state, 'signature').page, 3);
  assert.doesNotMatch(JSON.stringify(state.events), /replaced the pump|DEMO-KM-17086/);
});

test('correction carries repair facts forward and invalidates the old order’s evidence', async () => {
  const state = prep();
  say(state, note + ' The kitchen one.');
  await applyAction(state, { type: 'fixture' }, actions);
  attestEvidence(state, { signed: true, belongs: true });
  assert.equal(draftStatus(state), 'Ready to review');
  say(state, 'Actually, not 17042. It was 17086. Took 48 minutes.');
  assert.equal(selectedOrder(state).serial, 'DEMO-KM-17086');
  assert.equal(state.draft.fields.laborMinutes, 48);
  assert.equal(state.draft.attestation, null);
  assert.match(check(state, 'signature').detail, /another work order/);
  assert.throws(() => attestEvidence(state, { signed: true, belongs: true }), /confirm the work order/i);
  assert.throws(() => approve(state, true, 'test'), /another work order/);
  await applyAction(state, { type: 'fixture' }, actions);
  attestEvidence(state, { signed: true, belongs: true });
  assert.equal(draftStatus(state), 'Ready to review');
});

test('uncertain reference interrupts approval and allows reselecting a cached unit', () => {
  const state = prep();
  say(state, note + ' The kitchen unit.');
  say(state, 'Could be 17042 or 17086 actually.');
  assert.equal(draftStatus(state), 'Identify the unit');
  assert.match(state.messages.at(-1).text, /Which unit/);
  confirmOrder(state, 'OWC-DEMO-1086');
  assert.equal(draftStatus(state), 'Awaiting signature');
});

test('one focused repair clarification follows a speculative note', () => {
  const state = prep();
  say(state, 'Kitchen machine had no ice. I checked the pump. I might replace the pump tomorrow.');
  assert.equal(state.draft.fields.remedy, undefined);
  assert.equal(state.draft.fields.partNumber, undefined);
  assert.equal(state.messages.at(-1).text, 'What repair did you actually complete?');
  assert.throws(() => approve(state, true, 'test'), /signed work order/);
  assert.equal(state.outbox, null);
});

test('signature and serial corrections cannot overwrite previous model observations', () => {
  const state = prep();
  say(state, note);
  const hallucination = { exception: 'Manager left', part: '17042', laborMinutes: 10, remedy: 'Changed the entire machine' };
  const serial = 'The kitchen one, ending 17042.';
  conversationTurn(state, serial, groundedObservations(serial, hallucination, state));
  const unavailable = 'The manager already left.';
  conversationTurn(state, unavailable, groundedObservations(unavailable, hallucination, state));
  assert.equal(state.draft.fields.laborMinutes, 40);
  assert.equal(state.draft.fields.partNumber, 'DEMO-PUMP-01');
  assert.equal(state.draft.fields.exception, undefined);
  assert.match(state.messages.at(-1).text, /Draft saved as Awaiting signature/);
  const signed = 'The customer says she signed it.';
  assert.deepEqual(groundedObservations(signed, { signatureUnavailable: true }, state), {});
  assert.equal(state.draft.attestation, null);
});

test('a pump motor observation does not inherit the issued circulation pump part number', () => {
  const state = prep();
  conversationTurn(state, 'The kitchen ice machine had no ice. I replaced the pump motor. Cycle passed. 35 minutes.', {
    complaint: 'No ice', remedy: 'Replaced the pump motor', part: 'pump motor', outcome: 'Cycle passed', laborMinutes: 35,
  });
  assert.equal(state.draft.fields.partNumber, undefined);
  assert.equal(check(state, 'parts').ok, false);
});

test('matching attachment and explicit technician attestation plus approval are independent gates', async () => {
  const state = prep();
  say(state, note + ' 17042.');
  say(state, 'The manager already left.');
  assert.match(state.messages.at(-1).text, /Draft saved as Awaiting signature/);
  say(state, 'The customer says she signed. Send the claim.');
  assert.equal(state.outbox, null);
  assert.throws(() => approve(state, true, 'test'), /Attach the signed work order/);

  const other = state.visit.orders[1];
  const file = await evidenceFile({
    id: 'other', order: other, mime: 'application/pdf', name: '../signed.pdf', bytes: await fixture('signed-work-order-17086.pdf'),
  });
  attachEvidence(state, file);
  assert.equal(state.draft.file.name, 'signed.pdf');
  assert.throws(() => approve(state, true, 'test'), /another work order/);
  await applyAction(state, { type: 'fixture' }, actions);
  assert.throws(() => attestEvidence(state, { signed: true, belongs: false }), /confirm/i);
  assert.throws(() => approve(state, true, 'test'), /confirm/i);
  attestEvidence(state, { signed: true, belongs: true });
  editDraft(state, { laborMinutes: '' });
  assert.throws(() => approve(state, true, 'test'), /How many minutes/);
  editDraft(state, { laborMinutes: '42' });
  assert.throws(() => approve(state, false, 'test'), /confirm approval/);
  approve(state, true, 'test');
  assert.equal(state.outbox.status, 'pending');
  assert.equal(state.outbox.payload.repair.laborMinutes, 42);
  assert.equal(state.outbox.payload.evidence.sha256, state.draft.file.sha256);
  assert.equal(state.outbox.payload.messages, undefined);
  assert.throws(() => editDraft(state, { laborMinutes: 41 }), /locked/);
});

test('missing, stale and conflicting policy versions fail closed', async () => {
  for (const modification of [
    (state) => { state.procedure = null; },
    (state) => { state.procedure.reviewBy = '2001-01-01T00:00:00.000Z'; },
    (state) => { state.procedure.id = 'different-version'; },
    (state) => { delete state.procedure.passages.parts; },
    (state) => { state.procedure.workflow = 'different-workflow'; },
  ]) {
    const state = prep();
    say(state, note + ' 17042.');
    await applyAction(state, { type: 'fixture' }, actions);
    attestEvidence(state, { signed: true, belongs: true });
    modification(state);
    assert.equal(draftStatus(state), 'Needs review');
    assert.throws(() => approve(state, true, 'test'), /Refresh the procedure/);
    refreshVisit(state, demoVisit(), cacheProcedure());
    assert.equal(draftStatus(state), 'Ready to review');
  }
});
