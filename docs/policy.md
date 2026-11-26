# Hoshizaki workflow and evidence

The supported workflow prepares an internal parts-and-labor closeout for one Hoshizaki commercial ice-machine service visit. The warranty coordinator decides whether and how to submit the manufacturer claim.

The app ships a curated passage index for Hoshizaki America’s *One Page External Warranty Claim Procedures*. The source file SHA-256 is `c66dfb2e832b26eb3586a6d486eb64e33edef3c561c315c833b864df93b542cc». The URL has a 2025 upload path. The PDF metadata records a 2018 creation date, so the content hash identifies the edition. Page and section IDs below come from the visible pages. [Publisher PDF](https://www.hoshizakiamerica.com/wp-content/uploads/2025/02/External-Warranty-Claim-Instructions.pdf)

| Publisher location | What the closeout checks |
| --- | --- |
| p. 2, Section 1 | Select the cached serial and corresponding model. Require a valid failure date. |
| p. 3, Section 2, items B, E, F | Require a repair date, linked job and obtained customer signature. The signature sentence is quoted in the offline source viewer. |
| p. 3, Section 3 | Require the customer name and service street, city, state or province and postal code from the work order. |
| p. 4, Section 4 | Require separate problem and remedy fields of up to 500 characters. The app also asks for the operational check. |
| p. 5, Costs | Capture minutes spent on the repair for the coordinator’s labor line. |
| p. 7, Parts | Require a part number and quantity for an installed part. The synthetic issued pump may supply its part number and quantity after a matching repair observation. The preview shows their provenance. |
| p. 9, Attachments and p. 10, Final confirmation | The publisher accepts a Work Order attachment and asks whether the signature was attached or will be sent separately. This app’s review gate requires an attached signed job document and affirmative technician attestation for signature and job identity. |

An unsigned draft remains **Awaiting signature**. If the technician corrects the serial, the app keeps the repair observations, clears the attestation and checks the existing attachment’s Work Order and serial binding. A technician can view the PDF and manually confirm identity. Document contents are reviewed by the technician.

The cache checks the visit’s required workflow and source version and expires after 30 days as an app configuration choice. A missing passage, version conflict or expired cache requires refresh and review. An online visit download loads the checked-in passage pack. A maintainer updates the version and passages after checking the publisher for a replacement.

Special authorization, remote condensers, sealed-system work, refrigerant, coverage questions, rates, supplier requirements, taxes, and claim submission remain with the coordinator. The coordinator can also resolve ambiguous records or an evidence conflict.
