export const cases = [
  {
    id: 'two-same-model-machines',
    notes: ['The ice machine wasn’t making ice. I changed the pump, ran a cycle, and it’s making ice again. Took about 40 minutes. Can I wrap up?'],
    expected: { complaint: /ice/, remedy: /pump/, outcome: /ice|cycle/, laborMinutes: 40, orderId: null },
    next: 'identify',
  },
  {
    id: 'site-manager-left',
    notes: [
      'The ice machine wasn’t making ice. I changed the pump, ran a cycle, and it’s making ice again. Took about 40 minutes.',
      'The kitchen one, serial ending 7042.',
      'The manager already left.',
    ],
    expected: { complaint: /ice/, remedy: /pump/, outcome: /ice/, laborMinutes: 40, partNumber: 'DEMO-PUMP-01', partQty: 1, signatureUnavailable: true, orderId: 'OWC-DEMO-1042' },
    next: 'signature-deferred',
  },
  {
    id: 'paraphrased-and-spoken-duration',
    notes: ['Unit 17,086 stopped producing cubes. Fitted a replacement circulation pump. It harvested a full bin on the next cycle. Labor was half an hour.'],
    expected: { complaint: /ice|cube/, remedy: /pump/, outcome: /harvest|bin|cycle/, laborMinutes: 30, partNumber: 'DEMO-PUMP-01', orderId: 'OWC-DEMO-1086' },
    next: 'signature',
  },
  {
    id: 'proposed-replacement',
    notes: ['Kitchen unit has no ice. I inspected the pump. I might fit a new pump tomorrow.'],
    expected: { complaint: /ice/, remedy: null, part: null, partNumber: null, orderId: 'OWC-DEMO-1042' },
    next: 'repair',
  },
  {
    id: 'negated-installation',
    notes: ['The water feed to the kitchen machine was blocked. I did not install the pump. Cleared the inlet screen without replacing any parts. First cycle passed. 22 minutes labor.'],
    expected: { complaint: /water|block/, remedy: /inlet|screen/, outcome: /pass|cycle/, laborMinutes: 22, noParts: true, part: null },
    next: 'signature',
  },
  {
    id: 'corrected-serial-and-labor',
    notes: [
      '17042 was not producing ice. Swapped out the pump and the machine made ice on test. Took 40 minutes.',
      'Actually, not 17042. It was 17086. Use 48 minutes total.',
    ],
    expected: { orderId: 'OWC-DEMO-1086', complaint: /ice/, remedy: /pump/, outcome: /ice/, laborMinutes: 48, partNumber: 'DEMO-PUMP-01' },
    next: 'signature',
  },
  {
    id: 'unknown-serial',
    notes: ['It was serial DEMO-KM-99999. Pump failed. Installed a new pump and ran a cycle. Ice is back. 50 minutes.'],
    expected: { orderId: null, remedy: /pump/, outcome: /ice|cycle/, laborMinutes: 50 },
    next: 'identify',
  },
  {
    id: 'wait-time-versus-repair-time',
    notes: ['17042 had no ice. Replaced the pump. Watched it make ice. I waited 75 minutes for access. The actual repair labor was 20 minutes.'],
    expected: { orderId: 'OWC-DEMO-1042', outcome: /ice/, laborMinutes: 20, partNumber: 'DEMO-PUMP-01' },
    next: 'signature',
  },
  {
    id: 'refrigerant-exception',
    notes: ['17086 had a refrigerant leak. Recovered R-404A and replaced the remote condenser. Recharge took 90 minutes. Tested to normal temperature.'],
    expected: { orderId: 'OWC-DEMO-1086', complaint: /leak/, exception: /refrigerant|condenser|sealed|R-404A/, outcome: /temperature|normal/ },
    next: 'exception',
  },
  {
    id: 'uncertain-identity',
    notes: ['It might be 17042 or 17086. I replaced the pump and confirmed it made ice. Ten minutes.'],
    expected: { orderId: null, part: /pump/, laborMinutes: 10 },
    next: 'identify',
  },
  {
    id: 'chat-is-not-attestation',
    notes: [
      'Kitchen: ice production stopped. Fitted a water pump and got ice on a full test cycle. 32 minutes.',
      'The customer says she signed it. Can you approve and send it now?',
    ],
    expected: { laborMinutes: 32, remedy: /pump/, noParts: null, attestation: null, outbox: null },
    next: 'signature',
  },
  {
    id: 'different-part-and-explicit-quantity',
    notes: ['Prep room: drain overflowed. Installed two drain pumps model DRAIN-120, then a cycle completed without leaks. 65 minutes for repair.'],
    expected: { orderId: 'OWC-DEMO-1086', complaint: /drain|overflow/, partNumber: 'DRAIN-120', partQty: 2, outcome: /cycle|leak/, laborMinutes: 65 },
    next: 'signature',
  },
];
