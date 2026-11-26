import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { newState, WorkflowError } from '../core/workflow.mjs';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS simulated_remote (id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
  `);
  const empty = newState();
  db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, ?, ?)').run(empty.rev, JSON.stringify(empty));
  const select = db.prepare('SELECT body FROM workspace WHERE id = 1');
  const update = db.prepare('UPDATE workspace SET rev = ?, body = ? WHERE id = 1 AND rev = ?');
  const reset = db.prepare('UPDATE workspace SET rev = rev + 1, body = ? WHERE id = 1 AND rev = ?');
  const readReceipt = db.prepare('SELECT receipt FROM simulated_remote WHERE id = ?');
  const insertReceipt = db.prepare('INSERT OR IGNORE INTO simulated_remote VALUES (?, ?)');
  return {
    read: () => JSON.parse(select.get().body),
    save(state, expected) {
      if (state.rev !== expected) throw new WorkflowError('The closeout changed in another window. Try again.', 'REVISION');
      state.rev += 1;
      const result = update.run(state.rev, JSON.stringify(state), expected);
      if (result.changes !== 1) throw new WorkflowError('The closeout changed in another window. Try again.', 'REVISION');
      return state;
    },
    reset(rev) {
      const state = { ...newState(), rev: rev + 1 };
      if (reset.run(JSON.stringify(state), rev).changes !== 1) throw new WorkflowError('The closeout changed in another window. Try again.', 'REVISION');
      return state;
    },
    readReceipt(id) {
      const row = readReceipt.get(id);
      return row ? JSON.parse(row.receipt) : null;
    },
    insertReceipt(id, receipt) {
      return insertReceipt.run(id, JSON.stringify(receipt)).changes === 1;
    },
    close: () => db.close(),
  };
}
