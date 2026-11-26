import { decodeFile, evidenceFile } from './evidence.mjs';
import { sampleObservations } from './observations.mjs';
import { syncApproved } from './sync.mjs';
import {
  approve, attachEvidence, attestEvidence, confirmOrder, conversationTurn, editDraft, prepare,
  recordEvent, refreshVisit, selectedOrder, WorkflowError,
} from './workflow.mjs';
import { cacheProcedure } from '../../fixtures/procedure.mjs';
import { demoOrders } from '../../fixtures/visit.mjs';

const sampleExtract = async (text) => ({ observations: sampleObservations(text), diagnostics: { model: 'sample parser' } });

export async function applyAction(state, action, {
  loadVisit, getFixture, remote, extract = sampleExtract, allowFailpoint = false,
}) {
  const id = () => crypto.randomUUID();
  switch (action.type) {
    case 'prepare':
    case 'refresh': {
      if (state.offline) throw new WorkflowError('Go online to download the visit.');
      const visit = await loadVisit();
      return action.type === 'prepare' ? prepare(state, visit, cacheProcedure()) : refreshVisit(state, visit, cacheProcedure());
    }
    case 'connection':
      if (typeof action.offline !== 'boolean' || (action.offline && !state.visit)) throw new WorkflowError('Download the visit before going offline.');
      state.offline = action.offline;
      recordEvent(state, state.offline ? 'connection.offline' : 'connection.online');
      return state;
    case 'turn': {
      if (!state.visit || state.outbox) throw new WorkflowError('Open an editable visit to add a note.');
      if (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 1500) {
        throw new WorkflowError('Enter a service note up to 1,500 characters.');
      }
      const result = await extract(action.text, state);
      return conversationTurn(state, action.text, result.observations, result.diagnostics);
    }
    case 'order':
      return confirmOrder(state, action.orderId);
    case 'edit':
      return editDraft(state, action.fields);
    case 'fixture': {
      const order = selectedOrder(state);
      const fixture = demoOrders.find((item) => item.key === order?.key && item.serial === order?.serial);
      if (!fixture || state.outbox) throw new WorkflowError('Choose a seeded work order before attaching its sample.');
      const name = 'signed-work-order-' + fixture.serial.slice(-5) + '.pdf';
      const bytes = await getFixture(name);
      return attachEvidence(state, await evidenceFile({ bytes, order, name, mime: 'application/pdf', id: id() }));
    }
    case 'upload': {
      if (!state.visit || state.outbox) throw new WorkflowError('Open an editable visit to attach evidence.');
      const order = state.visit.orders.find((item) => item.id === action.orderId);
      return attachEvidence(state, await evidenceFile({
        bytes: decodeFile(action.data), order, name: action.name, mime: action.mime, id: id(),
      }));
    }
    case 'attest':
      return attestEvidence(state, action);
    case 'approve':
      if (action.fields) editDraft(state, action.fields);
      return approve(state, action.consent, id());
    case 'sync':
      if (action.dropAck && !allowFailpoint) throw new WorkflowError('The lost response test is disabled.');
      return syncApproved(state, remote, { dropAck: action.dropAck === true });
    default:
      throw new WorkflowError('Unknown action.');
  }
}
