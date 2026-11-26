import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { applyAction } from '../app/core/actions.mjs';
import { sampleObservations } from '../app/core/observations.mjs';
import { syncApproved } from '../app/core/sync.mjs';
import { approve, attestEvidence, conversationTurn, newState, prepare, refreshVisit } from '../app/core/workflow.mjs';
import { salesforceClient, salesforceRemote } from '../app/server/salesforce.mjs';
import { cacheProcedure } from '../fixtures/procedure.mjs';
import { demoVisit } from '../fixtures/visit.mjs';

const sf = {
  order: '0WO000000000001AAA',
  closeout: 'a00000000000001AAA',
  document: '069000000000001AAA',
  version: '068000000000001AAA',
};
const stamp = '2026-11-26T10:00:00.000+0000';

async function approved() {
  const visit = demoVisit();
  visit.orders[0].id = sf.order;
  visit.orders[0].revision = [stamp, stamp, stamp].join('|');
  const state = prepare(newState(), visit, cacheProcedure());
  const note = 'Kitchen unit had no ice. I replaced the pump. The test cycle passed, making ice again. 40 minutes.';
  conversationTurn(state, note, sampleObservations(note));
  await applyAction(state, { type: 'fixture' }, { getFixture: (name) => readFile(new URL('../fixtures/' + name, import.meta.url)) });
  attestEvidence(state, { signed: true, belongs: true });
  approve(state, true, 'e4070b14-1170-4380-9f87-e541da82a8c2');
  return state;
}

function fakeSalesforce() {
  let record, file;
  const calls = [];
  const controls = { unauthorized: false, changed: false, corruptFile: false, loseNetworkResponse: false };
  const records = (items) => Response.json({ done: true, records: items });
  const request = async (url, { body, method }) => {
    const path = new URL(url);
    calls.push([method, path.pathname]);
    if (controls.unauthorized) return Response.json([{ errorCode: 'INVALID_SESSION_ID' }], { status: 401 });
    if (path.pathname.endsWith('/VersionData')) {
      return new Response(controls.corruptFile ? Buffer.from('different bytes') : Buffer.from(file.VersionData, 'base64'));
    }
    if (path.pathname.endsWith('/composite')) {
      const { allOrNone, compositeRequest } = JSON.parse(body);
      assert.equal(allOrNone, true);
      assert.equal(compositeRequest.length, 2);
      assert.equal(compositeRequest[0].body.Work_Order__c, sf.order);
      assert.equal(compositeRequest[1].body.FirstPublishLocationId, '@{closeout.id}');
      if (record) return Response.json({ compositeResponse: [{ body: [{ errorCode: 'DUPLICATE_VALUE' }], httpStatusCode: 400 }] });
      record = { Id: sf.closeout, ...compositeRequest[0].body };
      file = compositeRequest[1].body;
      if (controls.loseNetworkResponse) throw new Error('connection closed before reading response');
      return Response.json({ compositeResponse: [{ httpStatusCode: 201 }, { httpStatusCode: 201 }] });
    }
    const query = path.searchParams.get('q');
    if (query.includes('FROM Organization')) return records([{ IsSandbox: false, OrganizationType: 'Developer Edition' }]);
    if (query.includes('FROM WorkOrder')) return records([{
      LastModifiedDate: controls.changed ? '2026-11-27T10:00:00.000+0000' : stamp,
      Asset: { LastModifiedDate: stamp, SerialNumber: 'DEMO-KM-17042' }, Account: { LastModifiedDate: stamp },
      Warranty_Demo_Key__c: 'OWC-DEMO-1042', Status: 'New',
    }]);
    if (query.includes('FROM Warranty_Closeout__c')) return records(record ? [record] : []);
    if (query.includes('FROM ContentDocumentLink')) return records([{ ContentDocumentId: sf.document }]);
    if (query.includes('FROM ContentVersion')) return records([{ Id: sf.version, ContentSize: Buffer.from(file.VersionData, 'base64').length }]);
    assert.fail('Unexpected query in Salesforce adapter test');
  };
  const client = salesforceClient({ origin: 'https://warranty.example.test', token: 'fixture', request });
  return { controls, calls, remote: salesforceRemote(client) };
}

test('Salesforce adapter recovers a lost HTTP response with one create and a file digest read-back', async () => {
  const state = await approved();
  const { calls, controls, remote } = fakeSalesforce();
  controls.loseNetworkResponse = true;
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'retry');
  assert.equal(state.outbox.receipt, undefined);
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'synced');
  assert.equal(state.outbox.receipt.orderId, sf.order);
  assert.equal(state.outbox.receipt.fileCount, 1);
  assert.equal(state.outbox.receipt.evidenceSha256, state.draft.file.sha256);
  assert.equal(calls.filter(([, path]) => path.endsWith('/composite')).length, 1);
});

test('Salesforce auth expiry keeps the approved payload for a retry', async () => {
  const state = await approved();
  const { controls, remote } = fakeSalesforce();
  const payload = structuredClone(state.outbox.payload);
  controls.unauthorized = true;
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'auth');
  assert.deepEqual(state.outbox.payload, payload);
  controls.unauthorized = false;
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'synced');
});

test('changed job requires new review before any Salesforce write', async () => {
  const state = await approved();
  const { controls, remote, calls } = fakeSalesforce();
  controls.changed = true;
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'review');
  assert.equal(state.outbox.error.code, 'JOB_CHANGED');
  assert.equal(calls.some(([method]) => method === 'POST'), false);
  const updated = structuredClone(state.visit);
  updated.orders[0].revision = 'new revision';
  refreshVisit(state, updated, cacheProcedure());
  assert.equal(state.outbox, null);
  assert.equal(state.draft.attestation, null);
  assert.equal(state.draft.fields.laborMinutes, 40);
  assert.equal(state.draft.orderNeedsConfirmation, true);
});

test('a mismatched remote file can never verify as synced', async () => {
  const state = await approved();
  const { controls, remote } = fakeSalesforce();
  controls.corruptFile = true;
  await syncApproved(state, remote);
  assert.equal(state.outbox.status, 'review');
  assert.equal(state.outbox.error.code, 'REMOTE_CONFLICT');
});

test('concurrent retries reconcile the unique-key winner without a second file', async () => {
  const state = await approved();
  const otherWindow = structuredClone(state);
  const { remote, calls } = fakeSalesforce();
  await Promise.all([syncApproved(state, remote), syncApproved(otherWindow, remote)]);
  assert.equal(calls.filter(([, path]) => path.endsWith('/composite')).length, 2);
  assert.deepEqual(state.outbox.receipt, otherWindow.outbox.receipt);
  assert.equal(state.outbox.receipt.fileCount, 1);
});
