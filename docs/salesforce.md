# Connect a personal Salesforce org

Use a Developer Edition, a Trailhead Playground, or a scratch org with enabled Work Orders, API access, and Salesforce Files. Use a system administrator for the synthetic seeding and assign the included permission set for the closeout fields. In Setup, check **Field Service Settings** if Work Orders are unavailable. [Create a Trailhead Playground](https://trailhead.salesforce.com/content/learn/modules/trailhead_playground_management/create-a-trailhead-playground) · [Work Order setup](https://help.salesforce.com/s/articleView?id=sf.fs_manage_wo.htm&type=5)

Install a current Salesforce CLI release with `org auth show-access-token`. Launch the official OAuth flow with your org’s My Domain URL and approve access in the browser. The app uses the alias to read the org endpoint and refresh its local CLI session for each sync attempt. The token stays in process memory. [Salesforce CLI installation](https://developer.salesforce.com/tools/salesforcecli) · [CLI credential commands](https://developer.salesforce.com/docs/platform/sfdx-dev/guide/sfdx-dev-auth-view-secrets.html)

```sh
sf org login web --alias owc-dev --instance-url https://YOUR-DOMAIN.my.salesforce.com
sf data query --target-org owc-dev --query 'SELECT OrganizationType, IsSandbox FROM Organization'
sf sobject describe --target-org owc-dev --sobject WorkOrder
(cd salesforce && sf project deploy start --source-dir force-app --target-org owc-dev --wait 10)
sf org assign permset --name Warranty_Closeout_Demo --target-org owc-dev
npm run sf:seed -- owc-dev
WC_SALESFORCE_ORG=owc-dev WC_DEMO_FAILPOINT=1 npm start
```

Open http://127.0.0.1:4173. Download the visit. The cached list shows the actual Work Order numbers and two synthetic machine serials. The two example PDFs show the stable demo assignment keys and serials. Salesforce generates its own Work Order numbers.

`sf:seed` upserts a synthetic Account, two Assets and two standard Work Orders by unique external keys. The closeout package deploys `Warranty_Closeout__c`, the related Work Order lookup, review fields, job revision gates, layout and permission set. You can expose the **Warranty Closeouts** related list on the Work Order layout for the coordinator. [REST external ID upsert](https://developer.salesforce.com/docs/platform/api-rest/guide/dome-upsert.html)

## Verify the live write

After approving and syncing, run the verification command against the same dev alias and workspace.

```sh
npm run sf:verify -- owc-dev
```

The script looks up the unique closeout key, checks the Work Order and the approved payload digest, verifies the evidence link, then downloads the linked file to compare its SHA-256. It returns record counts and URLs for the closeout and Work Order. The app’s receipt uses the same read-back.

With the demo failpoint configured, select **Test a lost sync response** before the first sync. The app drops the response after Salesforce accepts the all-or-none create. Run the verification command before and after **Retry sync** and compare the receipt IDs and hash. The first record and attachment must be reused. Normal local runs leave the failpoint disabled. [Salesforce Composite API](https://developer.salesforce.com/docs/platform/api-rest/guide/resources-composite-composite-post.html)

If the app asks you to sign in again, repeat `sf org login web` with the same alias and retry. If a timed-out browser tab remains open, start a new flow for the org’s My Domain. You can lengthen the wait using `SF_WEB_OAUTH_SERVER_TIMEOUT=600000`. [Salesforce CLI browser authorization](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_login_web.html)

When the Work Order, Asset or Account revision changes, refresh the visit and reselect the unit. The reviewed repair observations remain available. Confirm the signed document again before approving the new snapshot. A conflicting Salesforce record or file requires coordinator review.
