import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function expectBlocked(host) {
  const code = await new Promise((done) => {
    const socket = connect({ host, port: 443 });
    socket.once('connect', () => { socket.destroy(); done('CONNECTED'); });
    socket.once('error', (error) => done(error.code));
    socket.setTimeout(2_000, () => { socket.destroy(); done('TIMED_OUT'); });
  });
  assert.equal(code, 'EPERM', 'Outbound network traffic must be denied by the sandbox');
  console.log(host + ':443 → ' + code);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

async function ready(url, child) {
  for (let i = 0; i < 40; i += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response?.ok) return;
    if (child.exitCode !== null) break;
    await delay(300);
  }
  throw new Error('The isolated process did not start. Run npm run setup first.');
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

let ollama, app;
const working = await mkdtemp(join(tmpdir(), 'owc-offline-'));
try {
  await expectBlocked('1.1.1.1');
  await expectBlocked('2606:4700:4700::1111');
  const modelPort = await freePort();
  const appPort = await freePort();
  const modelUrl = 'http://127.0.0.1:' + modelPort;
  const base = 'http://127.0.0.1:' + appPort;
  const env = {
    ...process.env, WC_DATA_DIR: working, WC_PORT: String(appPort), WC_SALESFORCE_ORG: '',
    WC_WHISPER_MODEL: resolve(process.env.WC_WHISPER_MODEL || '.data/models/ggml-base.en.bin'),
    WC_OLLAMA_URL: modelUrl, OLLAMA_HOST: '127.0.0.1:' + modelPort, OLLAMA_NO_CLOUD: '1',
  };
  ollama = spawn('ollama', ['serve'], { env, stdio: 'ignore' });
  await ready(modelUrl + '/api/tags', ollama);
  const startApp = async () => {
    app = spawn(process.execPath, ['app/server/main.mjs'], { env, stdio: 'ignore' });
    await ready(base + '/api/state', app);
    return (await (await fetch(base + '/api/state')).json()).state;
  };
  let state = await startApp();
  const headers = { 'x-warranty-local': '1' };
  const action = async (type, fields = {}) => {
    const reply = await fetch(base + '/api/action', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ type, rev: state.rev, ...fields }),
    });
    const body = await reply.json();
    assert.equal(reply.status, 200, body.message);
    state = body.state;
  };
  await action('prepare');
  await action('connection', { offline: true });
  const speechFile = join(working, 'synthetic-speech.aiff');
  execFileSync('say', ['-v', 'Samantha', '-o', speechFile,
    'The ice machine was not making ice. I changed the pump. It made ice on the next cycle. The repair took forty minutes.']);
  const audio = await fetch(base + '/api/audio', { method: 'POST', headers, body: await readFile(speechFile) });
  const transcript = await audio.json();
  assert.equal(audio.status, 200, transcript.message);
  assert.match(transcript.text, /ice machine/i);
  assert.match(transcript.text, /pump/i);
  console.log('Whisper transcribed a synthetic service note into editable text.');
  await action('turn', { text: transcript.text });
  assert.match(state.messages.at(-1).text, /Which unit/);
  assert.equal(state.draft.fields.laborMinutes, 40);
  assert.ok(state.events.find((event) => event.name === 'tool.update_draft' && event.latencyMs > 0 && event.fields >= 4));
  await action('order', { orderId: 'OWC-DEMO-1042' });
  assert.equal(state.messages.at(-1).source, 'signature');
  await action('turn', { text: 'The manager already left.' });
  assert.match(state.messages.at(-1).text, /Draft saved as Awaiting signature/);
  await stop(app);
  state = await startApp();
  assert.equal(state.offline, true);
  assert.equal(state.draft.fields.signatureUnavailable, true);
  assert.equal(state.procedure.passages.signature.page, 3);
  await action('fixture');
  await action('attest', { signed: true, belongs: true });
  await action('approve', { consent: true });
  assert.equal(state.outbox.status, 'pending');
  await stop(app);
  state = await startApp();
  assert.equal(state.outbox.status, 'pending');
  console.log('Verified loopback inference, local source, signed evidence, and pending approval across two restarts under blocked egress.');
} finally {
  await stop(app);
  await stop(ollama);
  await rm(working, { recursive: true, force: true });
}
