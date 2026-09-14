# SimplyCodes scraping

The `simplycodes-url-v1` strategy applies only to HTTPS `simplycodes.com/store/*`
sources with a reveal selector and without a row selector. Existing feed and other
aggregator strategies remain separate. No database migration is required.

The collector observes the clicked page and its popups before clicking. It reads
`sc_code` from navigation requests and URLs for the exact configured store, with
nonempty DOM text as a fallback. Codes are decoded once and preserve case.

The discovery page stays untouched. Each offer is matched by its attributes on a
fresh page; the collector never continues querying an affiliate destination or
assumes offers remain in the same order. This uses additional store-page loads
(at most 25 offer attempts), in exchange for isolating navigation and modal state.
Individual waits and the overall offer loop are bounded. Missing or ambiguous
offers fail visibly instead of being counted as successful empty scrapes. A page
with no reveal buttons currently requires review: it is not classified as a
confirmed empty listing without a verified site-specific empty-state signal.

Collected codes are upserted before an incomplete scrape throws, so the existing
BullMQ attempts/backoff can recover remaining offers without duplicate coupons.
`lastRunAt` records an attempt, including a failed attempt; use job state for success.

## Verification

From the repository root:

```sh
npm test --workspace @saverlly/backend -- --runInBand simplycodes-reveals.spec.ts scrape-browser.spec.ts
npm run build --workspace @saverlly/backend
```

The browser regression tests intercept every request with fixtures. They exercise
the real processor with a mocked database and browser launcher, including absent
modals, delayed popups, reordered offers, partial failures, and repeated upserts.
They do not establish production access or coupon validity at checkout.

## Production canary

After deploying the reviewed build using the existing deployment workflow:

1. Record the running image ID, deployed Git commit, and compiled processor checksum.
2. Trigger one existing SimplyCodes source through the authenticated run-now endpoint.
3. Confirm logs identify `strategy=simplycodes-url-v1`, browser version, job attempt,
   stage elapsed times, and each offer's capture/failure outcome.
4. Check the saved merchant/code rows and BullMQ outcome. A partial result must be
   reported as a failed attempt, not a successful zero-code scrape.
5. Space further runs out and check more than one merchant before expanding use.

The headed/CDP browser recipe remains for compatibility; the previous experiments
did not prove a specific fingerprint or `Runtime.enable` detection mechanism.
