import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { WorkflowError } from '../core/workflow.mjs';

const run = promisify(execFile);
export const audioLimit = 2_000_000;

export async function transcribe(bytes, modelPath, tools = { ffmpeg: 'ffmpeg', whisper: 'whisper-cli' }) {
  if (!bytes.length || bytes.length > audioLimit) throw new WorkflowError('Record up to 18 seconds of audio.');
  try {
    await access(modelPath);
  } catch {
    throw new WorkflowError('Speech setup is incomplete. Run npm run setup, or type the note.');
  }
  const folder = await mkdtemp(join(tmpdir(), 'warranty-audio-'));
  try {
    const source = join(folder, 'recording');
    const wav = join(folder, 'speech.wav');
    const output = join(folder, 'transcript');
    await writeFile(source, bytes, { mode: 0o600 });
    await run(tools.ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', source,
      '-t', '18', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { timeout: 15_000 });
    await run(tools.whisper, ['-m', modelPath, '-f', wav, '-l', 'en', '-nt', '-otxt', '-of', output,
      '--prompt', 'Ice machine service note. Hoshizaki, circulation pump, work order, serial number, customer signature.'], { timeout: 45_000 });
    const text = (await readFile(output + '.txt', 'utf8')).trim().slice(0, 1500);
    if (!text || /^\[.*\]$/.test(text)) throw new WorkflowError('No speech was detected. Try again or type the note.');
    return text;
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError('Local transcription failed. Try again or type the note.');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
