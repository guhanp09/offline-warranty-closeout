import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { demoCustomer, demoOrders, issuedPump, policyId, workflow } from '../../fixtures/visit.mjs';
import { SyncError } from '../core/sync.mjs';

const run = promisify(execFile);
const api = '/services/data/v64.0';
const objectName = 'Warranty_Closeout__c';
const sfId = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const keyPattern = /^[a-zA-Z0-9-]{1,80}$/;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function quotedKey(value, pattern = keyPattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new SyncError('INTEGRITY', 'A record identifier is invalid.');
  return "'" + value + "'";
}

function authError() {
  return new SyncError('AUTH', 'Reconnect the development org with sf org login web, then retry.');
}

export async function sessionFor(alias, binary = 'sf') {
  try {
    const cli = async (...command) => {
      const { stdout } = await run(binary, [...command, '--target-org', alias, '--json'], {
        timeout: 20_000, maxBuffer: 256_000,
        env: { ...process.env, SF_DISABLE_TELEMETRY: 'true' },
      });
      return JSON.parse(stdout).result;
    };
    const { instanceUrl } = await cli('org', 'display');
    const url = new URL(instanceUrl);
    if (url.protocol !== 'https:' || !/^[a-z0-9.-]+\.(?:salesforce|force)\.com$/i.test(url.hostname)
      || url.username || url.password) throw authError();
    const { accessToken } = await cli('org', 'auth', 'show-access-token');
    if (typeof accessToken !== 'string' || !/^\S+$/.test(accessToken)) throw authError();
    return { origin: url.origin, token: accessToken };
  } catch {
    throw authError();
  }
}

export function salesforceClient({ origin, token, request = fetch }) {
  const send = async (route, { method = 'GET', body, binary = false } = {}) => {
    const headers = { authorization: 'Bearer ' + token };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await request(origin + route, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000), redirect: 'error',
    });
    if (response.status === 401) throw authError();
    if (!response.ok) {
      const errors = await response.json().catch(() => []);
      if (Array.isArray(errors) && errors.some((item) => item.errorCode === 'INVALID_SESSION_ID')) throw authError();
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new SyncError('CONNECTION', 'Salesforce is temporarily unavailable. Retry when the connection is stable.');
      }
      throw new SyncError('SALESFORCE', 'Salesforce rejected this request. Check the org setup, metadata, and permissions.');
    }
    if (binary) return new Uint8Array(await response.arrayBuffer());
    return response.status === 204 ? null : response.json();
  };
  return {
    origin,
    async query(soql) {
      const response = await send(api + '/query?q=' + encodeURIComponent(soql));
      if (!response.done) throw new SyncError('INTEGRITY', 'The seeded visit or verification result exceeded the expected size.');
      return response.records;
    },
    upsert(object, key, fields) {
      quotedKey(key);
      return send(api + '/sobjects/' + object + '/Warranty_Demo_Key__c/' + key, { method: 'PATCH', body: fields });
    },
    atomicCreate(body) { return send(api + '/composite', { method: 'POST', body }); },
    file(id) {
      quotedKey(id, sfId);
      return send(api + '/sobjects/ContentVersion/' + id + '/VersionData', { binary: true });
    },
  };
}

async function checkDevelopmentOrg(client) {
  const [org] = await client.query('SELECT IsSandbox, OrganizationType FROM Organization LIMIT 1');
  if (!org || (!org.IsSandbox && org.OrganizationType !== 'Developer Edition')) {
    throw new SyncError('SALESFORCE', 'Use a personal Developer Edition or scratch org with synthetic data.');
  }
}

const orderFields = [
  'Id', 'Warranty_Demo_Key__c', 'WorkOrderNumber', 'Status', 'LastModifiedDate', 'Asset.Name', 'Asset.SerialNumber',
  'Asset.LastModifiedDate', 'Account.Name', 'Account.BillingStreet', 'Account.BillingCity', 'Account.BillingState',
  'Account.BillingPostalCode', 'Account.LastModifiedDate', 'Warranty_Failed_On__c', 'Warranty_Repaired_On__c',
].join(', ');

const revision = (row) => [row.LastModifiedDate, row.Asset?.LastModifiedDate, row.Account?.LastModifiedDate].join('|');

export async function fetchVisit(client) {
  await checkDevelopmentOrg(client);
  const keys = demoOrders.map((order) => quotedKey(order.key)).join(', ');
  const rows = await client.query('SELECT ' + orderFields + ' FROM WorkOrder WHERE Warranty_Demo_Key__c IN (' + keys + ')');
  if (rows.length !== demoOrders.length || rows.some((row) => !row.Asset?.SerialNumber || !row.Account)) {
    throw new SyncError('SALESFORCE', 'Seed both demo work orders and their assets with npm run sf:seed.');
  }
  return {
    title: 'North Dock Café',
    workflow,
    policyId,
    cachedAt: new Date().toISOString(),
    orders: demoOrders.map((fixture) => {
      const row = rows.find((candidate) => candidate.Warranty_Demo_Key__c === fixture.key);
      const { Asset, Account } = row;
      return {
        key: fixture.key,
        location: fixture.location,
        id: row.Id,
        ticket: 'WO-' + row.WorkOrderNumber,
        model: Asset.Name,
        serial: Asset.SerialNumber,
        customer: {
          name: Account.Name, street: Account.BillingStreet, city: Account.BillingCity,
          region: Account.BillingState, postalCode: Account.BillingPostalCode,
        },
        revision: revision(row),
        failedOn: row.Warranty_Failed_On__c,
        repairedOn: row.Warranty_Repaired_On__c,
        issuedPart: { ...issuedPump },
      };
    }),
  };
}

export async function seedOrg(client) {
  await checkDevelopmentOrg(client);
  const accountKey = 'OWC-DEMO-ACCOUNT';
  await client.upsert('Account', accountKey, {
    Name: demoCustomer.name,
    BillingStreet: demoCustomer.street,
    BillingCity: demoCustomer.city,
    BillingState: demoCustomer.region,
    BillingPostalCode: demoCustomer.postalCode,
  });
  const [account] = await client.query('SELECT Id FROM Account WHERE Warranty_Demo_Key__c = ' + quotedKey(accountKey));
  for (const order of demoOrders) {
    await client.upsert('Asset', order.key, { Name: 'KM-520MAJ', SerialNumber: order.serial, AccountId: account.Id });
    const [asset] = await client.query('SELECT Id FROM Asset WHERE Warranty_Demo_Key__c = ' + quotedKey(order.key));
    await client.upsert('WorkOrder', order.key, {
      Subject: 'OWC demo · ' + order.location + ' ice machine',
      AccountId: account.Id, AssetId: asset.Id, Status: 'New',
      Warranty_Failed_On__c: '2026-11-20', Warranty_Repaired_On__c: '2026-11-21',
    });
  }
  return fetchVisit(client);
}

function closeoutFields(submission) {
  const { order, repair, evidence, source, attestation } = submission.payload;
  const [workOrderRevision, assetRevision, accountRevision] = order.revision.split('|');
  return {
    External_Key__c: submission.id,
    Work_Order__c: order.id,
    Work_Order_Revision__c: workOrderRevision,
    Asset_Revision__c: assetRevision,
    Account_Revision__c: accountRevision,
    Asset_Serial__c: order.serial,
    Asset_Model__c: order.model,
    Problem__c: repair.complaint,
    Remedy__c: repair.remedy,
    Test_Result__c: repair.outcome,
    Failure_Date__c: repair.failedOn,
    Repair_Date__c: repair.repairedOn,
    Labor_Minutes__c: repair.laborMinutes,
    Part_Number__c: repair.partNumber,
    Part_Quantity__c: repair.partQty,
    Service_Location__c: Object.values(order.customer).join(', '),
    Signature_Confirmed__c: true,
    Signature_Checked_At__c: attestation.at,
    Device_Approved_At__c: submission.approvedAt,
    Source_Version__c: source.id + ' · p. ' + source.page,
    Payload_Digest__c: digest(JSON.stringify(submission.payload)),
    Evidence_Digest__c: evidence.sha256,
    Review_Status__c: 'Ready for coordinator review',
  };
}

export function salesforceRemote(client) {
  return {
    async read(submission) {
      const fields = 'Id, Work_Order__c, Asset_Serial__c, Payload_Digest__c, Evidence_Digest__c, Signature_Confirmed__c';
      const records = await client.query('SELECT ' + fields + ' FROM ' + objectName
        + ' WHERE External_Key__c = ' + quotedKey(submission.id));
      if (records.length === 0) return null;
      const [record] = records;
      const { order, evidence } = submission.payload;
      if (records.length !== 1 || record.Work_Order__c !== order.id || record.Asset_Serial__c !== order.serial
        || record.Payload_Digest__c !== digest(JSON.stringify(submission.payload))
        || record.Evidence_Digest__c !== evidence.sha256 || record.Signature_Confirmed__c !== true) {
        throw new SyncError('REMOTE_CONFLICT', 'A Salesforce record has the same key with different details. Ask the coordinator to review it.');
      }
      const links = await client.query('SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = ' + quotedKey(record.Id, sfId));
      if (links.length !== 1) throw new SyncError('REMOTE_CONFLICT', 'Salesforce has an unexpected number of linked files. Ask the coordinator to review the record.');
      const files = await client.query('SELECT Id, ContentSize FROM ContentVersion WHERE ContentDocumentId = '
        + quotedKey(links[0].ContentDocumentId, sfId));
      if (files.length !== 1 || files[0].ContentSize !== evidence.size) {
        throw new SyncError('REMOTE_CONFLICT', 'The Salesforce file is missing or has an unexpected size.');
      }
      const evidenceSha256 = digest(await client.file(files[0].Id));
      if (evidenceSha256 !== evidence.sha256) throw new SyncError('REMOTE_CONFLICT', 'The Salesforce file does not match the approved evidence.');
      return {
        mode: 'salesforce', id: record.Id, orderId: order.id,
        closeoutCount: records.length, fileCount: files.length, evidenceSha256,
        url: client.origin + '/lightning/r/' + objectName + '/' + record.Id + '/view',
        workOrderUrl: client.origin + '/lightning/r/WorkOrder/' + order.id + '/view',
      };
    },
    async checkJob(submission) {
      await checkDevelopmentOrg(client);
      const { order } = submission.payload;
      const [row] = await client.query('SELECT ' + orderFields + ' FROM WorkOrder WHERE Id = ' + quotedKey(order.id, sfId));
      if (!row || revision(row) !== order.revision || row.Asset?.SerialNumber !== order.serial
        || row.Warranty_Demo_Key__c !== order.key || ['Canceled', 'Cancelled'].includes(row.Status)) {
        throw new SyncError('JOB_CHANGED', 'The Salesforce work order changed. Refresh the job and review the closeout again.');
      }
    },
    async commit(submission, file) {
      if (digest(Buffer.from(file.data, 'base64')) !== submission.payload.evidence.sha256) {
        throw new SyncError('INTEGRITY', 'The local file changed after approval.');
      }
      // Create-only plus a unique key makes the loser of any race roll back its attachment.
      const result = await client.atomicCreate({
        allOrNone: true,
        compositeRequest: [
          { method: 'POST', url: api + '/sobjects/' + objectName, referenceId: 'closeout', body: closeoutFields(submission) },
          { method: 'POST', url: api + '/sobjects/ContentVersion', referenceId: 'evidence', body: {
            Title: file.name,
            PathOnClient: file.name,
            VersionData: file.data,
            FirstPublishLocationId: '@{closeout.id}',
          } },
        ],
      });
      const responses = result.compositeResponse ?? [];
      if (responses.length === 2 && responses.every((part) => part.httpStatusCode === 201)) return true;
      const errors = responses.flatMap((part) => Array.isArray(part.body) ? part.body : []);
      if (errors.some((item) => item.errorCode === 'DUPLICATE_VALUE' || item.errorCode === 'DUPLICATES_DETECTED')) return false;
      if (errors.some((item) => item.errorCode === 'FIELD_CUSTOM_VALIDATION_EXCEPTION' && item.message.includes('OWC_JOB_CHANGED'))) {
        throw new SyncError('JOB_CHANGED', 'The Salesforce work order changed during sync. Refresh it and review the closeout again.');
      }
      throw new SyncError('SALESFORCE', 'Salesforce rolled back the closeout and file. Check metadata, file access, and permissions.');
    },
  };
}
