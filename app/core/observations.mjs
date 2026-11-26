export const observationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    complaint: { type: 'string', description: 'Reported symptom, using only stated facts.' },
    remedy: { type: 'string', description: 'Completed work. Exclude plans and speculation.' },
    outcome: { type: 'string', description: 'Observed after-repair test or symptom.' },
    laborMinutes: { type: 'number', description: 'Explicit time on this repair, in minutes.' },
    part: { type: 'string', description: 'Installed part name or part number stated by the technician.' },
    partQty: { type: 'integer', description: 'Explicit installed quantity.' },
    noParts: { type: 'boolean', description: 'True if they explicitly say no parts were installed.' },
    signatureUnavailable: { type: 'boolean', description: 'True when the technician says the customer or signature is unavailable.' },
    exception: { type: 'string', description: 'Explicit unusual condition requiring coordinator review.' },
  },
};

const repairKeys = ['complaint', 'remedy', 'outcome', 'laborMinutes', 'partNumber', 'partQty', 'failedOn', 'repairedOn', 'exception'];
export { repairKeys };

function normalizedText(value, max = 500) {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
}

export function cleanObservations(value) {
  const fields = {};
  for (const key of ['complaint', 'remedy', 'outcome', 'part', 'exception']) {
    const clean = normalizedText(value?.[key], key === 'part' ? 80 : 500);
    if (clean) fields[key] = clean;
  }
  if (Number.isFinite(value?.laborMinutes) && value.laborMinutes > 0 && value.laborMinutes <= 1440) {
    fields.laborMinutes = Math.round(value.laborMinutes * 100) / 100;
  }
  if (Number.isInteger(value?.partQty) && value.partQty > 0 && value.partQty <= 999) fields.partQty = value.partQty;
  if (value?.noParts === true) fields.noParts = true;
  if (value?.signatureUnavailable === true) fields.signatureUnavailable = true;
  return fields;
}

const numberWords = {
  one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

export function groundedObservations(note, candidate, state) {
  const fields = cleanObservations(candidate);
  const flags = sampleObservations(note);
  const repairSignal = /\b(?:repair|labor|minutes?|hours?|mins?|hrs?|ice|pump|replaced|changed|cleared|installed|fitted|failed|stopped|leak|tested|cycle)\b/i;
  const signatureSignal = flags.signatureUnavailable || /\b(?:signed|signature|signer)\b/i.test(note);
  if (signatureSignal && !repairSignal.test(note)) return flags.signatureUnavailable ? { signatureUnavailable: true } : {};

  const orderReference = (text) => state.visit?.orders.some((order) => text.toUpperCase().includes(order.serial.toUpperCase())
    || text.includes(order.serial.slice(-5)) || text.toLowerCase().includes(order.location.toLowerCase()));
  if (note.length <= 100 && orderReference(note) && !repairSignal.test(note)) return {};

  const explicitException = note.match(/\b(?:refrigerant|R-?\d{3}[A-Z]?|sealed[- ]system|remote condenser|special authorization|coverage dispute)\b/i);
  if (explicitException) fields.exception = 'Coordinator review for ' + explicitException[0] + '.';
  else delete fields.exception;

  if (flags.signatureUnavailable) fields.signatureUnavailable = true;
  if (fields.signatureUnavailable && !flags.signatureUnavailable &&
    !/\b(?:signature|signer|customer|manager|they|she|he)\b/i.test(note)) delete fields.signatureUnavailable;

  const tentative = /\b(?:might|may|will|would|could|plan to|need to|thinking of|tomorrow)\b/i;
  const installation = /\b(?:replaced|changed|swapped|installed|fitted|put in)\b/i;
  if (tentative.test(fields.remedy ?? '') || /\b(?:inspected|checked|looked at)\b/i.test(fields.remedy ?? '') &&
    !/\b(?:repaired|replaced|changed|swapped|cleaned|cleared|adjusted|installed|fitted|fixed)\b/i.test(fields.remedy ?? '')) delete fields.remedy;
  if (!installation.test(note) && tentative.test(note)) {
    delete fields.part;
    delete fields.partQty;
  }
  if (orderReference(fields.part ?? '')) delete fields.part;
  if (flags.part && !fields.part) fields.part = flags.part;
  const quantity = note.match(/\b(?:installed|replaced with|fitted|put in)\s+(\d{1,3}|one|two|three|four|five)\s+\w/i);
  if (fields.part && !fields.partQty && quantity) fields.partQty = numberWords[quantity[1].toLowerCase()] ?? Number(quantity[1]);
  return cleanObservations(fields);
}

// This small parser keeps the public sample usable with the same rules and no model download.
export function sampleObservations(text) {
  const result = {};
  const duration = text.match(/\b(\d+(?:\.\d+)?|one|two|three|ten|fifteen|twenty|thirty|forty|fifty|sixty)[ -]?(minutes?|mins?|hours?|hrs?)\b/i);
  if (duration) {
    const amount = numberWords[duration[1].toLowerCase()] ?? Number(duration[1]);
    result.laborMinutes = duration[2].toLowerCase().startsWith('h') ? amount * 60 : amount;
  }
  if (/\b(?:no ice|(?:not|wasn['’]t|isn['’]t|stopped) (?:making|producing) ice|no ice production)\b/i.test(text)) {
    result.complaint = 'Ice machine was not making ice.';
  }
  const code = text.match(/\bDEMO-[A-Z]+-\d+\b/i);
  if (/\b(?:replaced|changed|swapped|installed|put in)\b.{0,42}\b(?:pump|part)\b/i.test(text)
      && !/\b(?:didn['’]t|did not|might|may|will|would|plan to|need to)\b[^.!?]{0,32}\b(?:replaced?|changed?|swap|install|put in)\b/i.test(text)) {
    result.remedy = 'Replaced the water circulation pump.';
    result.part = code?.[0] ?? 'pump';
  }
  if (/\b(?:cleaned|cleared|rinsed|flushed)\b/i.test(text)) {
    result.remedy = text.match(/[^.!?;]*\b(?:cleaned|cleared|rinsed|flushed)\b[^.!?;]*/i)?.[0].trim();
  }
  if (/\b(?:making ice again|making ice now|ice production (?:returned|resumed)|made ice|cycle (?:passed|completed)|harvested ice|back to making ice)\b/i.test(text)) {
    result.outcome = 'Ice production confirmed after the repair.';
  }
  if (/\b(?:manager|customer|signer|they|she|he).{0,28}(?:left|gone|unavailable|away|went home|stepped out)|(?:no|missing|can['’]t get).{0,12}signature/i.test(text)) {
    result.signatureUnavailable = true;
  }
  if (/\b(?:no parts|without replacing|didn['’]t install (?:a|any) part)\b/i.test(text)) result.noParts = true;
  return cleanObservations(result);
}
