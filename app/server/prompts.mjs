const base = `You extract observations for a commercial ice machine repair. Call update_draft exactly once.
Use only the latest technician note as evidence for new fields. The previous fields are context for short replies and corrections.
Omit fields that the technician did not state. Do not give advice. Do not infer a serial, signature, warranty decision, part number or quantity.
Use complaint for the reported fault, remedy for work already performed, outcome for an observed post-repair result, and laborMinutes for the stated duration of this repair.
Put an installed part name or the stated part number in part. Keep noParts and signatureUnavailable absent unless the technician explicitly says so.
Use exception for explicit sealed-system or refrigerant work, a remote condenser, a special authorization issue, or another condition requiring coordinator review.
A customer saying they signed is not a signature attestation. Never approve or sync.`;

const structured = base.replace(
    'Call update_draft exactly once.',
    'Return a single JSON object matching the update_draft tool contract, with name and arguments. Put the observations inside arguments.',
  ) + `
If a clause describes checking, inspecting, planning, recommending, needing, or possibly replacing a part, it does not establish installation. In "I checked the pump; I might fit a pump tomorrow" omit part and remedy. In "I didn't fit a pump; I cleaned the inlet" return only the cleaning as remedy and set noParts true if the note excludes other parts.
When a technician describes two different time periods, use only the time spent on this repair (not earlier visits, delays or travel). When correcting one field, omit the other earlier fields. "She's left" can refer to the customer when the workflow is waiting for a signature.`;

export const prompts = {
  '1.0.0': base,
  '1.1.0': structured,
  '1.2.0': structured + `
Parts and machine serials are distinct. "Installed two drain pumps model DRAIN-120" means part "DRAIN-120" and partQty 2.
Use signatureUnavailable alone for "The manager already left." Omit exception for a missing signature, an unknown serial, a routine repair or a request to send the closeout.`,
};

export const promptVersion = '1.2.0';
