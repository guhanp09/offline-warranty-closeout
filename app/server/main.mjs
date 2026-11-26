import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demoVisit } from '../../fixtures/visit.mjs';
import { simulatedRemote } from '../core/sync.mjs';
import { createAppServer } from './http.mjs';
import { defaultModel, ollamaExtractor } from './ollama.mjs';
import { fetchVisit, salesforceClient, salesforceRemote, sessionFor } from './salesforce.mjs';
import { transcribe } from './speech.mjs';
import { openStore } from './store.mjs';

const demo = process.argv.includes('--demo');
const org = demo ? '' : process.env.WC_SALESFORCE_ORG;
const model = process.env.WC_MODEL || defaultModel;
const profile = demo ? 'sample' : org ? 'salesforce' : 'local';
const data = resolve(process.env.WC_DATA_DIR || '.data');
const port = Number(process.env.WC_PORT ?? 4173);
const store = openStore(resolve(data, profile + '.sqlite'));
const client = async () => salesforceClient(await sessionFor(org, process.env.WC_SF_BIN));
const realRemote = {
  async read(submission) { return salesforceRemote(await client()).read(submission); },
  async checkJob(submission) { return salesforceRemote(await client()).checkJob(submission); },
  async commit(submission, file) { return salesforceRemote(await client()).commit(submission, file); },
};
const config = {
  mode: demo ? 'sample' : 'local',
  remote: org ? 'salesforce' : 'simulation',
  model: demo ? null : model,
  speech: !demo,
  failpoint: demo || process.env.WC_DEMO_FAILPOINT === '1',
};
const server = createAppServer({
  store,
  config,
  actions: {
    loadVisit: org ? async () => fetchVisit(await client()) : demoVisit,
    extract: demo ? undefined : ollamaExtractor({ model, origin: process.env.WC_OLLAMA_URL }),
    getFixture: (name) => readFile(new URL('../../fixtures/' + name, import.meta.url)),
    remote: org ? realRemote : simulatedRemote(store.readReceipt, store.insertReceipt),
    allowFailpoint: config.failpoint,
  },
  transcribe: (bytes) => transcribe(bytes, resolve(process.env.WC_WHISPER_MODEL || '.data/models/ggml-base.en.bin')),
});
server.listen(port, '127.0.0.1', () => {
  console.log('Offline Warranty Closeout · http://127.0.0.1:' + server.address().port);
  console.log(demo ? 'Sample parser · Simulated sync' : model + ' · ' + (org ? 'Salesforce development org' : 'Simulated sync'));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => {
    store.close();
    process.exit(0);
  }));
}
