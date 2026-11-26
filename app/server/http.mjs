import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyAction } from '../core/actions.mjs';
import { viewState, WorkflowError } from '../core/workflow.mjs';
import { SyncError } from '../core/sync.mjs';
import { audioLimit } from './speech.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const staticFiles = new Map([
  ['/', 'app/web/index.html'],
  ['/index.html', 'app/web/index.html'],
  ...['app.mjs', 'ui.mjs', 'guide.mjs', 'scene.mjs', 'chip.mjs', 'landing.mjs', 'styles.css', 'client.mjs', 'mic.mjs', 'icon.svg'].map((name) => ['/app/web/' + name, 'app/web/' + name]),
  ...['actions.mjs', 'workflow.mjs', 'observations.mjs', 'sync.mjs', 'evidence.mjs'].map((name) => ['/app/core/' + name, 'app/core/' + name]),
  ...['procedure.mjs', 'visit.mjs'].map((name) => ['/fixtures/' + name, 'fixtures/' + name]),
]);
const mime = {
  html: 'text/html; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml',
};
const security = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self'; media-src 'self' blob:",
};

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { ...security, ...headers });
  res.end(body);
}

function json(res, status, data) {
  reply(res, status, JSON.stringify(data), {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  });
}

async function receive(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // Drain while retaining the ability to return a useful error.
      req.resume();
      throw new WorkflowError('This file or note exceeds the upload limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createAppServer({ store, config, actions, transcribe }) {
  const stateView = () => ({ state: viewState(store.read()), config });
  const server = createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const hosts = ['127.0.0.1:' + port, 'localhost:' + port];
      if (!hosts.includes(req.headers.host)) return json(res, 403, { message: 'Open the app using its localhost address.' });
      const path = new URL(req.url, 'http://localhost').pathname;

      if (req.method === 'GET' && path === '/api/state') return json(res, 200, stateView());
      if (req.method === 'GET' && path.startsWith('/api/evidence/')) {
        const file = store.read().draft.file;
        if (!file || path !== '/api/evidence/' + file.id) return json(res, 404, { message: 'Evidence is unavailable.' });
        return reply(res, 200, Buffer.from(file.data, 'base64'), {
          'content-type': file.mime, 'content-disposition': 'inline; filename="' + file.name + '"', 'cache-control': 'no-store',
        });
      }
      if (req.method === 'POST' && (path === '/api/action' || path === '/api/audio')) {
        const origin = req.headers.origin;
        if (req.headers['x-warranty-local'] !== '1' || (origin && !hosts.some((host) => 'http://' + host === origin))) {
          return json(res, 403, { message: 'Use the local app to make changes.' });
        }
        if (path === '/api/audio') {
          if (!config.speech) throw new WorkflowError('Speech is available in the local model mode.');
          return json(res, 200, { text: await transcribe(await receive(req, audioLimit)) });
        }
        if (!req.headers['content-type']?.startsWith('application/json')) throw new WorkflowError('Use a JSON action.');
        let action;
        try {
          action = JSON.parse(await receive(req, 2_800_000));
        } catch {
          throw new WorkflowError('The action or file is invalid.');
        }
        const current = store.read();
        if (!action || action.rev !== current.rev) throw new WorkflowError('The closeout changed in another window. Try again.', 'REVISION');
        if (action.type === 'reset') {
          if (action.confirm !== true || (current.outbox && config.remote === 'salesforce' && current.outbox.status !== 'synced')) {
            throw new WorkflowError('Finish or review the active Salesforce transfer before starting a new demo.');
          }
          store.reset(current.rev);
        } else {
          const updated = await applyAction(current, action, actions);
          store.save(updated, action.rev);
        }
        return json(res, 200, stateView());
      }
      const asset = staticFiles.get(path);
      if (req.method === 'GET' && asset) {
        const bytes = await readFile(root + asset);
        return reply(res, 200, bytes, { 'content-type': mime[asset.split('.').pop()], 'cache-control': 'no-cache' });
      }
      return json(res, 404, { message: 'Page unavailable.' });
    } catch (error) {
      if (error instanceof WorkflowError || error instanceof SyncError) {
        return json(res, error.code === 'REVISION' ? 409 : 422, { message: error.message, code: error.code });
      }
      console.error('Local request failed.', { type: error?.name });
      return json(res, 500, { message: 'The local app could not complete this request.' });
    }
  });
  return server;
}
