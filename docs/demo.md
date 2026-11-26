# Live demo

Choose **Start guided demo** in the browser for a two-minute walkthrough with a sample parser and simulated sync. The guide follows your progress and offers a reload while the draft is awaiting a signature. You can hide it or reopen it at any stage.

[Start the guided demo](https://guhanp09.github.io/offline-warranty-closeout/) · [Watch the live Salesforce handoff](https://guhanp09.github.io/offline-warranty-closeout/walkthrough/)

## Run the live workflow

Use the local Mac build to try your own phrasing or push to talk. Connect a personal Salesforce org to run the live handoff. [Mac setup](../README.md#run-on-apple-silicon) · [Salesforce setup](salesforce.md)

| Step | What to do | What to look for |
| --- | --- | --- |
| Prepare | Download the demo visit while online. | Two KM-520MAJ units and the Hoshizaki procedure are cached. |
| Disconnect | Choose **Work offline**. For a live demo, disconnect Wi-Fi too. Type or record *“The ice machine wasn’t making ice. I changed the pump, ran a cycle, and it’s making ice again. Took about 40 minutes. Can I wrap up?”* | The assistant asks which unit. It carries the repair and time forward. |
| Pick a unit | Say *“The kitchen one, ending 7042.”* You can also select the serial card. | The correct Work Order appears. The customer-signature rule points to page 3, Section 2, item F. The source opens offline. |
| Defer the signature | Say *“The manager already left.”* Reload the browser or restart the local server. | **Awaiting signature** survives the restart with the draft and source. |
| Finish offline | Use the example PDF. Open it to compare its serial to the draft. Confirm both evidence checkboxes. Open **Review closeout**, inspect or edit the repair, and approve the transfer. | **Saved on device · Pending sync**. Approval covers the selected job, service details and signed document. |
| Recover from a lost response | Reconnect. In the live build started with `WC_DEMO_FAILPOINT=1`, select **Test a lost sync response**, then choose **Sync to Salesforce**. | The app reports that the response was dropped after the remote write and keeps the closeout pending. |
| Verify | Run `npm run sf:verify -- owc-dev`, then choose **Retry sync**. Run the command again and open the closeout and Work Order links. | Same closeout ID and evidence hash before and after retry. The app shows **Synced**, a count of one record and one matching file, and the correct Work Order lookup. |

For the correction test, attach the kitchen PDF and attest it, then say *“Actually, it was 17086 instead of 17042.”* The existing PDF remains visible, its attestation is cleared, and approval is blocked until the prep-room evidence is attached and attested.

To start a fresh local demo without clearing your current workspace, run with a new `WC_DATA_DIR`. For a live demonstration, seed once before downloading the visit. Reseeding updates the Work Order revisions.
