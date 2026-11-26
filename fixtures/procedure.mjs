import { policyId, workflow } from './visit.mjs';

export const procedure = {
  id: policyId,
  workflow,
  title: 'One Page External Warranty Claim Procedures',
  publisher: 'Hoshizaki America',
  sha256: 'c66dfb2e832b26eb3586a6d486eb64e33edef3c561c315c833b864df93b542cc',
  url: 'https://www.hoshizakiamerica.com/wp-content/uploads/2025/02/External-Warranty-Claim-Instructions.pdf',
  passages: {
    identity: {
      page: 2, section: 'II.a · Section 1',
      title: 'Machine and failure date',
      text: 'Enter the serial first, select the corresponding model, and provide the date of failure. Conditional supplier and special authorization details are reviewed separately.',
    },
    customer: {
      page: 3, section: 'II.c · Section 3',
      title: 'Service location',
      text: 'Provide the customer name and the street, city, state or province, and postal code for the location where the unit was repaired.',
    },
    signature: {
      page: 3, section: 'II.b · Section 2, item F',
      title: 'Customer signature',
      quote: 'A Customer Signature (F) must be obtained for a claim to be approved.',
      text: 'Record the repair date and work order or service ticket. The signature confirmation is affirmative once the signature is obtained.',
    },
    repair: {
      page: 4, section: 'II.d · Section 4',
      title: 'Problem and remedy',
      text: 'Record the problem and the remedy in separate fields. Each field has a 500-character limit.',
    },
    labor: {
      page: 5, section: 'II.e · Costs',
      title: 'Labor time',
      text: 'The labor cost line uses hours and, when applicable, a rate.',
    },
    parts: {
      page: 7, section: 'II.f · Parts',
      title: 'Parts used',
      text: 'Use a part number and enter a quantity for the part line.',
    },
    attachment: {
      page: 9, section: 'II.h · Attachments',
      title: 'Work order attachment',
      text: 'Work Order is one of the supported document types in the attachment section.',
    },
    final: {
      page: 10, section: 'II.i · Final confirmation',
      title: 'Signature delivery',
      text: 'The claim workflow asks whether the signature is attached or will be sent separately. A valid signature must be sent for processing.',
    },
  },
};

export function cacheProcedure(now = Date.now()) {
  return {
    ...structuredClone(procedure),
    reviewBy: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
