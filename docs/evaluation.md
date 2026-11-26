# Evaluation

Measured on 26 November 2026 on a MacBook Pro with Apple M1 Pro and 16 GiB RAM, macOS 26.3, Node 24.13.0 and Ollama 0.15.4. All runs used `qwen3:4b` Q4_K_M with model digest starting `359d7dd4bcda`. The same 12 labeled synthetic conversations produced 16 timed turns per run.

| Prompt and runtime path | Repair extraction | All field checks | Correct next action | Warm median / p95 | Invalid tool responses |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1.0.0 · native tool call | 4 / 41 | 17 / 62 | 3 / 12 | 10.51 s / 12.25 s | 16 / 16 |
| 1.1.0 · schema-constrained output | 37 / 41 | 56 / 62 | 9 / 12 | 2.68 s / 3.69 s | 0 / 16 |
| 1.2.0 · structured output with workflow guards | 41 / 41 | 62 / 62 | 12 / 12 | 2.62 s / 3.08 s | 0 / 16 |

Repair extraction covers problem, remedy, operational result, duration, part mention, no-parts assertion and an explicit exception. The broader score includes selected Work Order, parts fields derived from cached stock, signature availability, attestation and outbox invariants. Labels use exact comparisons for identifiers, numbers and booleans and keyword patterns for free text. Decisions use the next assistant action after each labeled conversation. Latency is measured around local inference requests after a warm-up. [Cases](../evals/cases.mjs) · [Native results](../evals/results/native-tools.json) · [Structured results](../evals/results/structured.json) · [Guarded results](../evals/results/guarded.json)

## Failure and change

In the initial run, Qwen returned prose instead of a callable payload. A single-turn probe confirmed that it exhausted the token budget while describing the extraction. Constraining the output to an `update_draft` JSON schema made every response parseable with the same weights.

The structured run still turned *“The manager already left”* into a generic coordinator exception and proposed a future pump replacement as completed work. The final workflow recognizes short signature-only and serial-only turns, preserves prior observations and rejects tentative remedies. When a note mentions two serials, a serial-shaped model output cannot become a part. The last run retained the original pump and labor, saved **Awaiting signature**, and requested real technician attestation before approval.

The cases are a small, retested development set with synthetic repairs. The pilot will measure real review time and completeness. [Pilot protocol](pilot.md)

## Reproduce

```sh
npm run setup
npm test
npm run eval -- --prompt 1.0.0 --out .data/native-tools.json
npm run eval -- --prompt 1.1.0 --out .data/structured.json
npm run eval -- --prompt 1.2.0 --out .data/guarded.json
npm run check:offline
```

The offline check ran separate app and Ollama processes under a macOS network sandbox. External IPv4 and IPv6 probes both failed with `EPERM`. The test transcribed a synthetic audio sample with Whisper base.en, ran the model and signature gate, attached and attested a PDF, then verified SQLite state across two server restarts. The Chrome browser demo also retained the draft and cached source through a reload with Chrome offline and verified its simulated receipt after the lost-response retry.

Salesforce REST integration tests use an in-process test double for the response-lost, expired-session, changed-Work-Order, corrupted-file and concurrent-writer cases. [Integration tests](../tests/salesforce.test.mjs) · [Live verification commands](salesforce.md)

## Live Salesforce read-back

On 26 November 2026, the full metadata package deployed to a fresh Trailhead Developer Edition Playground with Salesforce CLI 2.159.7. The app downloaded two actual Work Orders for synthetic machines. The technician selected `DEMO-KM-17042`, saved the unsigned draft offline, and attached and attested the synthetic PDF before approving the package for `WO-00000001`.

| Read-back | Device attempt | Closeout records | Linked files |
| --- | ---: | ---: | ---: |
| After Salesforce accepted the write and the test dropped the response | 1 | 1 | 1 |
| After retry verified and marked the outbox synced | 2 | 1 | 1 |

Both reads returned the same closeout and Work Order. The downloaded PDF matched the approved file's SHA-256, `6686d82cf6f27c29bfa6b80b969a9e70c3a17fdaacb843ead69355c23c0f2dd4`. The walkthrough shows the **Ready for coordinator review** record and its **Files (1)** list in Salesforce. [Live walkthrough](https://guhanp09.github.io/offline-warranty-closeout/walkthrough/) · [Reproduce the live test](salesforce.md#verify-the-live-write)
