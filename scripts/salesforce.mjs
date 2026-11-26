import { resolve } from 'node:path';
import { openStore } from '../app/server/store.mjs';
import { salesforceClient, salesforceRemote, seedOrg, sessionFor } from '../app/server/salesforce.mjs';

const [mode, alias = process.env.WC_SALESFORCE_ORG] = process.argv.slice(2);
if (!alias) {
  console.error('Provide your personal development org alias, e.g. npm run sf:seed -- owc-dev.');
  process.exit(2);
}

try {
  const client = salesforceClient(await sessionFor(alias, process.env.WC_SF_BIN));
  if (mode === 'seed') {
    const visit = await seedOrg(client);
    console.table(visit.orders.map(({ ticket, serial, location }) => ({ ticket, serial, location })));
  } else if (mode === 'verify') {
    const store = openStore(resolve(process.env.WC_DATA_DIR || '.data', 'salesforce.sqlite'));
    try {
      const { outbox } = store.read();
      if (!outbox) throw new Error('Approve a closeout in the Salesforce-backed app first.');
      const receipt = await salesforceRemote(client).read(outbox);
      if (!receipt) throw new Error('The closeout was not found on Salesforce.');
      console.log(JSON.stringify({
        workOrder: outbox.payload.order.ticket,
        serial: outbox.payload.order.serial,
        attemptsOnDevice: outbox.attempts,
        ...receipt,
      }, null, 2));
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(error.name === 'SyncError' ? error.message : 'The request failed. Check the configured org, then try again.');
  process.exitCode = 1;
}
