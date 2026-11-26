import { applyAction } from '../core/actions.mjs';
import { decodeFile } from '../core/evidence.mjs';
import { simulatedRemote } from '../core/sync.mjs';
import { newState, viewState, WorkflowError } from '../core/workflow.mjs';
import { demoVisit } from '../../fixtures/visit.mjs';

const storageKey = 'warranty-closeout:v1';
const receiptPrefix = storageKey + ':receipt:';

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new WorkflowError(body.message, body.code);
  return body;
}

export function localClient() {
  const headers = { 'x-warranty-local': '1' };
  return {
    load: () => json('./api/state'),
    dispatch(action) {
      return json('./api/action', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(action) });
    },
    transcribe: async (blob) => (await json('./api/audio', { method: 'POST', headers, body: blob })).text,
    evidenceUrl: (file) => './api/evidence/' + file.id,
  };
}

export function previewClient() {
  const config = { mode: 'preview', remote: 'simulation', model: null, speech: false, failpoint: true };
  const read = () => JSON.parse(localStorage.getItem(storageKey)) ?? newState();
  const result = (state) => ({ state: viewState(state), config });
  const remote = simulatedRemote(async (id) => JSON.parse(localStorage.getItem(receiptPrefix + id)), async (id, receipt) => {
    const key = receiptPrefix + id;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, JSON.stringify(receipt));
    return true;
  });
  return {
    load: async () => result(read()),
    async dispatch(action) {
      const current = read();
      if (action.rev !== current.rev) throw new WorkflowError('The closeout changed in another tab. Try again.', 'REVISION');
      let updated;
      if (action.type === 'reset' && action.confirm === true) {
        if (current.outbox) localStorage.removeItem(receiptPrefix + current.outbox.id);
        updated = newState();
      } else {
        updated = await applyAction(current, action, {
          loadVisit: demoVisit,
          remote, allowFailpoint: true,
          getFixture: async (name) => {
            const response = await fetch(new URL('../../fixtures/' + name, import.meta.url));
            if (!response.ok) throw new WorkflowError('The sample file is unavailable.');
            return new Uint8Array(await response.arrayBuffer());
          },
        });
      }
      if (read().rev !== action.rev) throw new WorkflowError('The closeout changed in another tab. Try again.', 'REVISION');
      updated.rev = action.rev + 1;
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        throw new WorkflowError('Browser storage is unavailable or full. Try a smaller file or use the local app.');
      }
      return result(updated);
    },
    evidenceUrl(file) {
      const stored = read().draft.file;
      if (!stored || stored.id !== file.id) return null;
      return URL.createObjectURL(new Blob([decodeFile(stored.data)], { type: stored.mime }));
    },
  };
}
