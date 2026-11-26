import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { simulatedRemote } from '../app/core/sync.mjs';
import { createAppServer } from '../app/server/http.mjs';
import { openStore } from '../app/server/store.mjs';
import { demoVisit } from '../fixtures/visit.mjs';

test('normal HTTP flow survives an offline restart, then verifies a lost acknowledgement after restart', async () => {
  const data = await mkdtemp(join(tmpdir(), 'owc-http-test-'));
  let store, server, base, state;
  const start = async () => {
    store = openStore(join(data, 'case.sqlite'));
    server = createAppServer({
      store,
      config: { mode: 'sample', remote: 'simulation', speech: false, failpoint: true },
      actions: {
        loadVisit: demoVisit,
        getFixture: (name) => readFile(new URL('../fixtures/' + name, import.meta.url)),
        remote: simulatedRemote(store.readReceipt, store.insertReceipt),
        allowFailpoint: true,
      },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
    state = (await (await fetch(base + '/api/state')).json()).state;
  };
  const stop = async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    store?.close();
    store = null;
  };
  const action = async (type, fields = {}, expected = 200) => {
    const response = await fetch(base + '/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-warranty-local': '1' },
      body: JSON.stringify({ type, rev: state.rev, ...fields }),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    if (expected === 200) state = body.state;
    return body;
  };
  try {
    await start();
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/..%2f..%2f.git/config')).status, 404);
    assert.equal((await fetch(base + '/api/action', {
      method: 'POST', headers: { origin: 'https://example.test', 'x-warranty-local': '1' },
    })).status, 403);
    await action('prepare');
    await action('connection', { offline: true });
    await action('turn', { text: 'The ice machine had no ice. Replaced the pump and the cycle passed. 40 minutes.' });
    await action('order', { orderId: 'OWC-DEMO-1042' });
    await action('turn', { text: 'The manager already left.' });
    await stop();
    await start();
    assert.equal(state.offline, true);
    assert.equal(state.draft.fields.laborMinutes, 40);
    assert.equal(state.draft.fields.signatureUnavailable, true);
    assert.equal(state.procedure.passages.signature.page, 3);
    await action('approve', { consent: true }, 422);
    await action('fixture');
    assert.equal(state.draft.file.data, undefined);
    assert.equal((await fetch(base + '/api/evidence/' + state.draft.file.id)).headers.get('content-type'), 'application/pdf');
    await action('attest', { signed: true, belongs: true });
    await action('approve', { consent: true });
    await action('sync', {}, 422);
    await action('connection', { offline: false });
    await action('sync', { dropAck: true });
    assert.equal(state.outbox.status, 'retry');
    assert.equal(state.outbox.error.code, 'ACK_LOST');
    const id = state.outbox.id;
    assert.equal(store.readReceipt(id).fileCount, 1);
    await stop();
    await start();
    await action('sync');
    assert.equal(state.outbox.id, id);
    assert.equal(state.outbox.status, 'synced');
    assert.equal(state.outbox.attempts, 2);
    assert.equal(state.outbox.receipt.closeoutCount, 1);
    assert.equal(state.outbox.receipt.fileCount, 1);
    assert.equal(state.outbox.receipt.evidenceSha256, state.draft.file.sha256);
    await action('edit', { fields: { laborMinutes: '50' }, rev: 0 }, 409);
  } finally {
    await stop();
    await rm(data, { recursive: true, force: true });
  }
});
