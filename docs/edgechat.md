# EdgeChat handoff

The standalone Mac build contains the runtime and test fixtures for reproducing this workflow. The EdgeChat product describes local Edge Apps and on-premise operation. The public Edgepedia API covers source articles. Native authoring and deployment need access to an authorized EdgeChat authoring workspace. [EdgeChat Enterprise](https://www.edgechat.ai/enterprise) · [EdgeChat Edge Apps](https://www.edgechat.ai/) · [Edgepedia API](https://www.edgepedia.org/developers)

## Authoring assets

| Tool | Inputs | Outputs and boundary |
| --- | --- | --- |
| `lookup_work_orders` | `{ visitId: string, technicianReference: string }` | Cached candidates with `id`, `ticket`, `serial`, `model` and `location`. Require a single unambiguous match or technician selection. |
| `retrieve_procedure` | `{ workflow: string, version: string, key: string }` | `{ page: integer, section: string, title: string, quote?: string, text: string, url: string }` or an unavailable result. Require a valid local cache. |
| `update_draft` | Optional typed observations for complaint, remedy, outcome, minutes, part, quantity, no-parts flag, signature availability and exception | Candidate state changes and provenance. The app applies deterministic rules before saving them. An utterance gives no attachment attestation or approval. |

Transfer the versioned system prompt and the observation schema together, then bind the three actions to the device-side state store and run the labeled cases. The `update_draft` output is constrained JSON with `name` and `arguments`. The standalone runtime handles work-order lookup and policy retrieval deterministically. [Prompt](../app/server/prompts.mjs) · [Observation schema](../app/core/observations.mjs) · [Workflow tools](../app/core/workflow.mjs)

Keep evidence attachment, signature attestation, transfer approval, and sync as distinct UI actions. In a native deployment, bind these to durable local storage and use the Salesforce adapter only for explicit online prepare, refresh and sync. Run the offline restart and lost-response tests in the workspace when access is available.
