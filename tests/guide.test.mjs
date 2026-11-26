import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { applyAction } from '../app/core/actions.mjs';
import { simulatedRemote } from '../app/core/sync.mjs';
import { newState, viewState } from '../app/core/workflow.mjs';
import { guideStep, tourSteps } from '../app/web/guide.mjs';
import { signerNote, starterNote } from '../app/web/ui.mjs';
import { demoVisit } from '../fixtures/visit.mjs';

const config = { mode: 'preview', remote: 'simulation', failpoint: true };
const fixture = (name) => readFile(new URL('../fixtures/' + name, import.meta.url));

// Buttons the tour may press for the reader. Evidence attestation and transfer approval are
// deliberately absent: the tour can point at them, but a person has to tick them.
const tourActions = {
  'toggle-connection': (state) => ({ type: 'connection', offline: !state.offline }),
  'guide-note': () => ({ type: 'turn', text: starterNote }),
  'manager-left': () => ({ type: 'turn', text: signerNote }),
  fixture: () => ({ type: 'fixture' }),
  'guide-drop-response': () => ({ type: 'sync', dropAck: true }),
  'guide-sync': () => ({ type: 'sync' }),
  order: (state, step) => ({ type: 'order', orderId: step.order }),
};
// Next on the evidence step only submits statements the reader ticked; it never ticks them.
const pointers = new Set(['guide-reload', 'review', 'source', 'guide-skip-reload', 'view-evidence', 'guide-attest']);

function demo() {
  const receipts = new Map();
  const remote = simulatedRemote(async (id) => receipts.get(id) ?? null, async (id, receipt) => {
    if (receipts.has(id)) return false;
    receipts.set(id, receipt);
    return true;
  });
  const session = { state: newState(), reloaded: false };
  session.step = () => guideStep(viewState(session.state), config, { reloaded: session.reloaded });
  session.run = async (action) => {
    session.state = await applyAction(session.state, action, { loadVisit: demoVisit, getFixture: fixture, remote, allowFailpoint: true });
    session.reloaded = false;
    return session.step();
  };
  return session;
}

for (const serial of ['DEMO-KM-17042', 'DEMO-KM-17086']) {
  test(`the tour walks every step in order for ${serial} and leaves both gates to the reader`, async () => {
    const demoRun = demo();
    let step = await demoRun.run({ type: 'prepare' });
    const seen = [];
    while (!step.complete) {
      seen.push(step.id);
      assert.equal(step.index, seen.length - 1, step.id + ' is out of order');
      assert.match(step.target ?? '', /^#/, step.id + ' spotlights a real control');
      assert.ok(step.action && step.label, step.id + ' has a Next button');
      for (const action of [step.action, ...(step.secondary ?? []).map((item) => item.action)].filter(Boolean)) {
        assert.ok(action in tourActions || pointers.has(action), 'the tour offers an unknown action: ' + action);
      }
      const view = viewState(demoRun.state);
      if (step.chooseUnit) {
        step = await demoRun.run({ type: 'order', orderId: view.visit.orders.find((order) => order.serial === serial).id });
      } else if (step.id === 'reload') {
        assert.equal(demoRun.step().id, 'reload', 'the reload step waits for a reload');
        demoRun.reloaded = true;
        step = demoRun.step();
        assert.match(step.recap, /Restored from this device/);
      } else if (step.id === 'attest') {
        assert.equal(view.checks.find((check) => check.key === 'signature').ok, false);
        step = await demoRun.run({ type: 'attest', signed: true, belongs: true });
      } else if (step.id === 'review') {
        assert.equal(view.outbox, null, 'nothing is queued before the reader approves');
        step = await demoRun.run({ type: 'approve', consent: true });
      } else {
        step = await demoRun.run(tourActions[step.action](demoRun.state));
      }
    }
    assert.deepEqual(seen, tourSteps.map(([id]) => id));
    const { outbox } = viewState(demoRun.state);
    assert.equal(outbox.status, 'synced');
    assert.equal(outbox.attempts, 2);
    assert.deepEqual([outbox.receipt.closeoutCount, outbox.receipt.fileCount], [1, 1]);
    assert.equal(demoRun.state.outbox.payload.order.serial, serial);
  });
}

test('the tour reports what the note captured and warns about evidence for the other machine', async () => {
  const demoRun = demo();
  await demoRun.run({ type: 'prepare' });
  await demoRun.run({ type: 'connection', offline: true });
  let step = await demoRun.run({ type: 'turn', text: starterNote });
  assert.equal(step.id, 'unit');
  assert.equal(step.recap, 'The note became typed fields: problem, repair, test and 40 minutes of labor.');
  const [kitchen, prep] = viewState(demoRun.state).visit.orders;
  await demoRun.run({ type: 'order', orderId: kitchen.id });
  const bytes = await fixture('signed-work-order-17086.pdf');
  step = await demoRun.run({ type: 'upload', name: 'signed-work-order-17086.pdf', mime: 'application/pdf', data: bytes.toString('base64'), orderId: prep.id });
  assert.equal(step.id, 'mismatch');
  assert.equal(step.tone, 'warn');
  assert.equal(step.action, 'fixture');
  step = await demoRun.run({ type: 'fixture' });
  assert.equal(step.id, 'attest');
});

test('skipping the reload is an explicit choice, not the default', async () => {
  const demoRun = demo();
  await demoRun.run({ type: 'prepare' });
  await demoRun.run({ type: 'turn', text: starterNote + ' It was the kitchen one, 17042.' });
  const step = await demoRun.run({ type: 'turn', text: signerNote });
  assert.equal(step.id, 'reload');
  assert.deepEqual(step.secondary.map((item) => item.action), ['guide-skip-reload']);
});

test('Next on the unit step picks the first unit, and Next on the evidence step waits for the reader', async () => {
  const demoRun = demo();
  await demoRun.run({ type: 'prepare' });
  await demoRun.run({ type: 'connection', offline: true });
  let step = await demoRun.run({ type: 'turn', text: starterNote });
  assert.equal(step.id, 'unit');
  step = await demoRun.run(tourActions.order(demoRun.state, step));
  assert.equal(viewState(demoRun.state).visit.orders[0].id, demoRun.state.draft.orderId);
  await demoRun.run({ type: 'turn', text: signerNote });
  demoRun.reloaded = true;
  step = await demoRun.run({ type: 'fixture' });
  assert.equal(step.id, 'attest');
  assert.equal(step.action, 'guide-attest');
  assert.equal(viewState(demoRun.state).checks.find((check) => check.key === 'signature').ok, false);
});
