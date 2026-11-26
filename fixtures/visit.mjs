export const workflow = 'hoshizaki-parts-labor/v1';
export const policyId = 'hoshizaki-c66dfb2e';

export const demoCustomer = {
  name: 'North Dock Café (demo)',
  street: '12 Sample Quay',
  city: 'Portland',
  region: 'OR',
  postalCode: '97201',
};

export const issuedPump = { number: 'DEMO-PUMP-01', label: 'Water circulation pump', quantity: 1 };

export const demoOrders = [
  { key: 'OWC-DEMO-1042', ticket: 'WO-1042', serial: 'DEMO-KM-17042', location: 'Kitchen' },
  { key: 'OWC-DEMO-1086', ticket: 'WO-1086', serial: 'DEMO-KM-17086', location: 'Prep room' },
];

export function demoVisit(now = Date.now()) {
  return {
    title: 'North Dock Café',
    workflow,
    policyId,
    cachedAt: new Date(now).toISOString(),
    orders: demoOrders.map((order) => ({
      ...order,
      id: order.key,
      model: 'KM-520MAJ',
      customer: { ...demoCustomer },
      failedOn: '2026-11-20',
      repairedOn: '2026-11-21',
      revision: 'demo-1',
      issuedPart: { ...issuedPump },
    })),
  };
}
