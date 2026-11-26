import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { parseArgs } from 'node:util';
import { conversationTurn, draftStatus, newState, prepare } from '../app/core/workflow.mjs';
import { defaultModel, localOllamaUrl, ollamaExtractor } from '../app/server/ollama.mjs';
import { promptVersion } from '../app/server/prompts.mjs';
import { cacheProcedure } from '../fixtures/procedure.mjs';
import { demoVisit } from '../fixtures/visit.mjs';
import { cases } from './cases.mjs';

const { values } = parseArgs({ options: {
  model: { type: 'string', default: process.env.WC_MODEL || defaultModel },
  prompt: { type: 'string', default: promptVersion },
  out: { type: 'string' },
} });
const origin = localOllamaUrl(process.env.WC_OLLAMA_URL);
const request = (path) => fetch(origin + path, { signal: AbortSignal.timeout(5_000) }).then((response) => response.json());
const [tags, runtime] = await Promise.all([request('/api/tags'), request('/api/version')]);
const model = tags.models.find((entry) => entry.name === values.model);
if (!model) throw new Error('Run npm run setup before evaluating the local model.');
const extract = ollamaExtractor({ model: values.model, origin, version: values.prompt });
const hardware = {
  cpu: platform() === 'darwin' ? execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim() : cpus()[0]?.model,
  memoryGiB: Math.round(totalmem() / 1024 ** 3), arch: arch(), os: platform(), release: release(), node: process.version,
};
const percentile = (observations, p) => [...observations].sort((a, b) => a - b)[Math.ceil(observations.length * p) - 1];

function nextDecision(state) {
  if (draftStatus(state) === 'Needs review') return 'exception';
  const text = state.messages.at(-1).text;
  if (text.startsWith('Which unit')) return 'identify';
  if (text.startsWith('What repair')) return 'repair';
  if (text.includes('Draft saved as Awaiting signature')) return 'signature-deferred';
  if (state.messages.at(-1).source === 'signature') return 'signature';
  return 'other';
}

const warmup = await extract('The unit was not making ice.', newState());
if (warmup.diagnostics.failed) throw new Error('The local model could not run.');
const rows = [];
for (const sample of cases) {
  const state = prepare(newState(), demoVisit(), cacheProcedure());
  const turns = [];
  for (const text of sample.notes) {
    const result = await extract(text, state);
    conversationTurn(state, text, result.observations, result.diagnostics);
    turns.push(result.diagnostics);
  }
  const actual = { ...state.draft.fields, orderId: state.draft.orderId, attestation: state.draft.attestation, outbox: state.outbox };
  const fields = Object.entries(sample.expected).map(([field, expected]) => {
    const value = actual[field] ?? null;
    return {
      field, expected: expected instanceof RegExp ? expected.toString() : expected, actual: value,
      correct: expected instanceof RegExp ? expected.test(String(value ?? '')) : expected === value,
    };
  });
  const next = nextDecision(state);
  rows.push({ id: sample.id, fields, next: { expected: sample.next, actual: next, correct: next === sample.next }, turns });
  process.stderr.write(sample.id + ' · ' + fields.filter((item) => item.correct).length + '/' + fields.length
    + ' fields · ' + next + (next === sample.next ? '' : ' (expected ' + sample.next + ')') + '\n');
}
const latencies = rows.flatMap((row) => row.turns.map((turn) => turn.latencyMs));
const fields = rows.flatMap((row) => row.fields);
const report = {
  hardware, model: { name: model.name, digest: model.digest, details: model.details, ollama: runtime.version }, prompt: values.prompt,
  totals: {
    cases: rows.length, turns: latencies.length, fieldsCorrect: fields.filter((field) => field.correct).length,
    fields: fields.length, decisionsCorrect: rows.filter((row) => row.next.correct).length,
    latencyMs: { warmup: warmup.diagnostics.latencyMs, median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    invalidOrFailedResponses: rows.flatMap((row) => row.turns).filter((turn) => turn.invalidTool || turn.failed).length,
  },
  cases: rows,
};
const json = JSON.stringify(report, null, 2) + '\n';
if (values.out) await writeFile(values.out, json);
else process.stdout.write(json);
process.stderr.write(JSON.stringify(report.totals) + '\n');
