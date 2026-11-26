import { cleanObservations, groundedObservations, observationSchema } from '../core/observations.mjs';
import { prompts, promptVersion } from './prompts.mjs';

export const defaultModel = 'qwen3:4b';
const tool = {
  type: 'function',
  function: { name: 'update_draft', description: 'Extract new, explicitly stated repair observations.', parameters: observationSchema },
};
const callSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'arguments'],
  properties: {
    name: { type: 'string', enum: [tool.function.name] },
    arguments: observationSchema,
  },
};

export function localOllamaUrl(input = 'http://127.0.0.1:11434') {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Ollama must use a loopback HTTP address.');
  }
  return url.origin;
}

export function ollamaExtractor({ model = defaultModel, origin, version = promptVersion, request = fetch } = {}) {
  const endpoint = localOllamaUrl(origin) + '/api/chat';
  const system = prompts[version];
  if (!system) throw new Error('Unknown prompt version.');
  const nativeBaseline = version === '1.0.0';
  // Ollama cloud tags proxy model inference. This app consumes locally installed model tags only.
  if (!/^[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(model) || /cloud/i.test(model)) throw new Error('Select a local Ollama model tag.');
  return async (text, state) => {
    const start = performance.now();
    const diagnostics = () => ({ model, promptVersion: version, latencyMs: Math.round(performance.now() - start) });
    try {
      const response = await request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(50_000),
        redirect: 'error',
        body: JSON.stringify({
          model, think: false, stream: false, keep_alive: '15m',
          options: { temperature: 0, seed: 23, num_ctx: 4096, num_predict: 370 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify({
              stage: state.draft?.attestation ? 'signature recorded' : 'may be waiting for a customer signature',
              previousFields: state.draft?.fields ?? {},
              note: text,
            }) },
          ],
          ...(nativeBaseline ? { tools: [tool] } : { format: callSchema }),
        }),
      });
      if (!response.ok) throw new Error('Local inference failed.');
      const data = await response.json();
      let call;
      try {
        const calls = data.message?.tool_calls;
        call = nativeBaseline ? calls?.length === 1 && calls[0].function : JSON.parse(data.message.content);
      } catch {
        // Unparseable output leaves the draft editable and drives a normal clarification.
      }
      if (call?.name !== tool.function.name || !call.arguments || typeof call.arguments !== 'object') {
        return { observations: {}, diagnostics: { ...diagnostics(), invalidTool: true } };
      }
      return {
        observations: version === '1.2.0' ? groundedObservations(text, call.arguments, state) : cleanObservations(call.arguments),
        diagnostics: { ...diagnostics(), inputTokens: data.prompt_eval_count, outputTokens: data.eval_count },
      };
    } catch {
      return { observations: {}, diagnostics: { ...diagnostics(), failed: true } };
    }
  };
}
