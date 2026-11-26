import { checks, recordEvent, WorkflowError } from './workflow.mjs';

export class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

export async function syncApproved(state, remote, { dropAck = false } = {}) {
  const submission = state.outbox;
  if (state.offline) throw new WorkflowError('Go online before syncing.');
  if (!submission || !['pending', 'retry', 'auth'].includes(submission.status)) {
    throw new WorkflowError('Approve a complete closeout before syncing.');
  }

  state.outbox.attempts += 1;
  try {
    // Read before writing. This also reconciles a commit followed by a lost response.
    let receipt = await remote.read(submission);
    if (!receipt) {
      if (!checks(state)[0].ok) throw new SyncError('SOURCE_CHANGED', 'Refresh the source and approve the closeout again.');
      const file = state.draft.file;
      if (!file || file.id !== submission.fileId || file.sha256 !== submission.payload.evidence.sha256) {
        throw new SyncError('INTEGRITY', 'The approved evidence is unavailable. Ask the coordinator to review the draft.');
      }
      await remote.checkJob(submission);
      const accepted = await remote.commit(submission, file);
      if (dropAck && accepted) throw new SyncError('ACK_LOST', 'The response was dropped after the write. Retry to verify the record and file.');
      receipt = await remote.read(submission);
    }
    if (!receipt || receipt.closeoutCount !== 1 || receipt.fileCount !== 1 ||
      receipt.evidenceSha256 !== submission.payload.evidence.sha256 || receipt.orderId !== submission.payload.order.id) {
      throw new SyncError('UNVERIFIED', 'The remote record could not be verified. The closeout is still on this device.');
    }
    Object.assign(state.outbox, { status: 'synced', receipt, error: null });
    recordEvent(state, 'sync.verified', { remote: receipt.mode, attempt: submission.attempts, fileCount: receipt.fileCount });
  } catch (error) {
    const known = error instanceof SyncError ? error : new SyncError('CONNECTION', 'The connection failed. Retry when it is available.');
    const review = ['JOB_CHANGED', 'SOURCE_CHANGED', 'REMOTE_CONFLICT', 'INTEGRITY'].includes(known.code);
    Object.assign(state.outbox, {
      status: review ? 'review' : known.code === 'AUTH' ? 'auth' : 'retry',
      error: { code: known.code, message: known.message },
    });
    recordEvent(state, 'sync.deferred', { attempt: submission.attempts, reason: known.code });
  }
  return state;
}

export function simulatedRemote(read, insert) {
  return {
    read: (submission) => read(submission.id),
    async checkJob() {},
    async commit(submission) {
      return insert(submission.id, {
        mode: 'simulation',
        id: 'DEMO-' + submission.id.slice(0, 8).toUpperCase(),
        orderId: submission.payload.order.id,
        closeoutCount: 1,
        fileCount: 1,
        evidenceSha256: submission.payload.evidence.sha256,
      });
    },
  };
}
