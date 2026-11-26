# Offline Warranty Closeout

A field-service assistant that catches missing warranty evidence while an ice-machine technician is still on site. It resolves which unit was repaired, opens the applicable Hoshizaki requirement offline, and saves an approved package for a Salesforce warranty coordinator.

**[Try the two-minute browser demo](https://guhanp09.github.io/offline-warranty-closeout/)** · [Watch the walkthrough](https://github.com/guhanp09/offline-warranty-closeout/releases/tag/v1.0.0) · [Run on Apple silicon](#run-on-apple-silicon)

Download the visit, choose **Work offline**, and send the example note. Pick one of the two serials and tell the assistant the manager already left. Reload to see **Awaiting signature** survive. Use the example signed PDF to finish the closeout and try the lost-response retry. The browser demo uses a sample parser and simulated sync.

**Measured on Apple M1 Pro:** 41 / 41 repair extraction checks, 12 / 12 correct next actions, and 2.62 s median local inference across 16 warm turns. [Evaluation](docs/evaluation.md)

[![Offline closeout showing the missing customer signature and the Hoshizaki source citation](docs/awaiting-signature.webp)](https://guhanp09.github.io/offline-warranty-closeout/)

## Verification

The Mac build uses Qwen3 4B for repair extraction and Whisper for push-to-talk. The evaluation compares native tool output with schema-constrained calls on the same 12 labeled conversations. The controlled offline test blocks IPv4 and IPv6 egress while app and model use loopback, restarts the app twice, and checks the saved draft and approved outbox. [Results and reproduction](docs/evaluation.md) · [GitHub Actions](https://github.com/guhanp09/offline-warranty-closeout/actions/workflows/ci.yml)

Live Salesforce read-back is pending a Field Service development org. The adapter’s retry, changed-job and file-integrity checks run in CI against a test double. [Salesforce setup](docs/salesforce.md)

## Run on Apple silicon

Use a Mac with native Node 24.13+ in the Node 24 series and Homebrew. You can install Node with `brew install node@24` and add `$(brew --prefix node@24)/bin` to your PATH. The first setup installs Ollama, FFmpeg and whisper.cpp as needed, and downloads about 2.7 GB of models. The app serves its interface and inference through loopback.

```sh
git clone https://github.com/guhanp09/offline-warranty-closeout.git
cd offline-warranty-closeout
npm run setup
npm start
```

Open **http://127.0.0.1:4173**. In **Push to talk**, allow microphone access, press again to stop, then edit or send the locally transcribed note. `npm run demo` starts the local sample mode with no model download. To read and write real Work Orders and Files, deploy to a personal Salesforce development org. [Salesforce setup](docs/salesforce.md) · [Live demo script](docs/demo.md)

## How it works

- **Prepare online.** Cache the two Work Orders, Asset serials and the versioned Hoshizaki passage index.
- **Close out offline.** The model proposes typed observations. Deterministic checks bind them to the confirmed unit, look up the source, require the signed work order and record the technician’s attestation.
- **Approve and sync.** Preview and approve the exact fields and evidence. SQLite saves the frozen payload. Salesforce creates the closeout and file together. Retries find the unique key and verify the linked file’s SHA-256 before the app says **Synced**.

The workflow covers one Hoshizaki parts-and-labor case. The warranty coordinator decides what to submit. Chat stays on the device. [Architecture and privacy](docs/architecture.md) · [Supported policy and exceptions](docs/policy.md) · [EdgeChat handoff](docs/edgechat.md) · [Pilot protocol](docs/pilot.md)

## Repository

| Path | Contents |
| --- | --- |
| [app/](app/) | Browser interface, local workflow and Node server |
| [salesforce/](salesforce/) | Deployable closeout metadata, Work Order relationship and layout |
| [fixtures/](fixtures/) | Same-model visit, versioned passages and synthetic signed PDFs |
| [tests/](tests/) · [evals/](evals/) | Regression tests, labeled conversations and observed results |
| [scripts/](scripts/) | Mac setup, blocked-egress verification and Salesforce commands |

```sh
npm test
npm run check:offline
npm run eval
```
