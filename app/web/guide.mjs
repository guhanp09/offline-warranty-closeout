import { demoVisit } from '../../fixtures/visit.mjs';
import { selectedOrder } from '../core/workflow.mjs';
import { esc, icon } from './ui.mjs';

export const repositoryUrl = 'https://github.com/guhanp09/offline-warranty-closeout';
const walkthroughUrl = repositoryUrl + '/releases/tag/v1.0.1';
const stages = ['Visit', 'Repair', 'Evidence', 'Sync'];

export function welcomeUi(busy) {
  const visit = demoVisit();
  const disabled = busy ? ' disabled' : '';
  return `<div class="welcome-intro">
    <h1 id="welcome-heading">Finish a service visit offline.</h1>
    <p class="welcome-description">Two ice machines share a model. Match the repair to the right unit, catch the missing customer signature, and verify the handoff.</p>
    <div class="welcome-actions">
      <button type="button" class="button button-primary welcome-start" data-action="start-guided"${disabled}>
        ${busy ? 'Preparing the visit…' : 'Start guided demo ' + icon('arrow', 18)}
      </button>
      <button type="button" class="button button-quiet welcome-explore" data-action="start-free"${disabled}>Explore on your own</button>
    </div>
    <p class="welcome-meta">About 2 minutes <span aria-hidden="true">·</span> No install or sign-in</p>
    <div class="welcome-video">
      <p>This demo uses sample data and simulated sync.</p>
      <a href="${walkthroughUrl}" target="_blank" rel="noreferrer">Watch the live Salesforce handoff ${icon('external', 14)}</a>
    </div>
  </div>
  <section class="visit-preview" aria-labelledby="preview-heading">
    <div class="preview-header">
      <span class="preview-icon">${icon('clipboard', 23)}</span>
      <div><h2 id="preview-heading">${esc(visit.title)}</h2><p>Hoshizaki ${esc(visit.orders[0].model)}</p></div>
    </div>
    <ul class="preview-orders" aria-label="Work orders in this demo">
      ${visit.orders.map((order) => `<li>
        <span class="preview-unit">${icon('box', 20)}</span>
        <div><strong>${esc(order.location)}</strong><span>${esc(order.serial)}</span></div>
        <span class="preview-ticket">${esc(order.ticket)}</span>
      </li>`).join('')}
    </ul>
    <div class="preview-evidence">
      <span>${icon('signature', 22)}</span>
      <div><strong>Customer signature</strong><p>Required for warranty closeout</p></div>
    </div>
  </section>`;
}

function syncStep(state, config) {
  const { outbox } = state;
  if (outbox.status === 'synced') return {
    stage: 3, complete: true, title: 'Demo complete',
    text: 'See how the verified closeout appears on a Work Order in the live Salesforce walkthrough.',
  };
  if (state.offline) return {
    stage: 3, title: 'Closeout saved on this device',
    text: 'You approved the repair and signed PDF while offline. Reconnect to test the handoff.',
    action: 'toggle-connection', label: 'Go online',
  };
  if (outbox.status === 'review') return {
    stage: 3, title: 'The handoff needs review', text: outbox.error.message,
    action: 'review', label: 'View approved closeout',
  };
  if (outbox.attempts) return {
    stage: 3, title: 'Verify the handoff on retry',
    text: outbox.error?.code === 'ACK_LOST'
      ? 'The destination saved the closeout before the response was lost. Retry to confirm the original record and file.'
      : 'The approved closeout is still saved. Retry to verify that it reached the destination.',
    action: 'guide-sync', label: 'Retry sync',
  };
  return config.failpoint ? {
    stage: 3, title: 'Test a lost response',
    text: 'Simulate a connection drop immediately after the destination saves the record and PDF.',
    action: 'guide-drop-response', label: 'Simulate lost response',
  } : {
    stage: 3, title: 'Send the approved closeout',
    text: 'Verify the record and signed PDF at the demo destination.',
    action: 'guide-sync', label: 'Simulate sync',
  };
}

export function guideStep(state, config) {
  if (state.outbox) return syncStep(state, config);
  if (state.messages.length < 2) return state.offline ? {
    stage: 1, title: 'Describe the repair',
    text: 'Send a sample note about a pump replacement, or write your own in Service notes.',
    action: 'guide-note', label: 'Send example note',
  } : {
    stage: 0, title: 'Take the visit offline',
    text: 'Both work orders and the Hoshizaki procedure are saved here for offline use.',
    action: 'toggle-connection', label: 'Work offline',
  };

  const [policy, orderCheck, signature] = state.checks;
  if (!policy.ok) return {
    stage: 2, title: 'Refresh the warranty procedure', text: policy.detail,
    action: state.offline ? 'toggle-connection' : 'refresh', label: state.offline ? 'Go online' : 'Refresh source',
  };
  if (!orderCheck.ok) return {
    stage: 1, title: 'Which unit did you repair?',
    text: 'The two machines share a model. Confirm which serial belongs on the work order.',
    chooseUnit: true,
  };

  const { file, fields } = state.draft;
  const order = selectedOrder(state);
  if (signature.ok) {
    const missing = state.checks.find((check) => !check.ok);
    return {
      stage: 2, title: missing ? 'Finish the repair details' : 'Review and approve',
      text: missing?.detail ?? 'Check the repair details and signed PDF before approving the handoff.',
      action: 'review', label: 'Open closeout preview',
    };
  }
  if (file?.orderId === order.id && file.serial === order.serial) return {
    stage: 2, title: 'Confirm the signed document', text: signature.detail,
    action: 'guide-attest', label: 'Go to evidence checks', highlight: 'evidence',
  };
  if (file || fields.signatureUnavailable) return {
    stage: 2, title: file ? 'Use evidence for the selected unit' : 'Resume the saved draft',
    text: file ? signature.detail : state.offline
      ? 'Reload to see the draft persist offline, then attach the signed PDF for this unit.'
      : 'The draft stays open for a signature. Attach the matching signed PDF when it’s available.',
    action: 'fixture', label: 'Attach sample PDF', highlight: 'evidence', canReload: !file && state.offline,
  };
  return {
    stage: 2, title: 'Catch the missing signature',
    text: 'Check the cited warranty requirement. What happens if the customer can’t sign before you leave?',
    action: 'manager-left', label: 'Manager has left', highlight: 'evidence', showSource: true,
  };
}

export function guideUi(step, busy, orderOptions) {
  const progress = stages.map((label, index) => {
    const current = !step.complete && index === step.stage;
    const done = step.complete || index < step.stage;
    return `<li${current ? ' aria-current="step"' : ''} class="${done ? 'guide-done' : ''}">
      <span class="guide-marker" aria-hidden="true">${done ? icon('check', 12) : index + 1}</span>${label}${done ? '<span class="sr-only"> complete</span>' : ''}
    </li>`;
  }).join('');
  const actions = step.complete
    ? `<a class="button button-quiet" href="${walkthroughUrl}" target="_blank" rel="noreferrer">Watch live Salesforce ${icon('external', 15)}</a>`
    : step.chooseUnit ? orderOptions
      : `<button type="button" class="button button-primary" data-action="${step.action}"${busy ? ' disabled' : ''}>${step.label} ${icon('arrow', 16)}</button>
        ${step.showSource ? '<button type="button" class="button button-quiet" data-action="source">Read requirement</button>' : ''}
        ${step.canReload ? '<button type="button" class="button button-quiet" data-action="guide-reload">Reload page</button>' : ''}`;
  return `<ol class="guide-track" aria-label="Demo progress">${progress}</ol>
    <div class="guide-content">
      <div><h2 id="guide-heading" tabindex="-1">${esc(step.title)}</h2><p>${esc(step.text)}</p></div>
      <div class="guide-actions${step.chooseUnit ? ' guide-choose' : ''}">${actions}</div>
    </div>`;
}
