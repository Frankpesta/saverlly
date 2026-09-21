# Temporary reviewer access

Admins have a **Reviewers** sidebar item and page at `/admin/reviewers`. Create a reviewer with a name, optional contact email, expiry (up to 90 days), and installation limit (1–20). Copy the code from the success screen and share it yourself; no email is sent automatically. Full codes are shown only when created and are stored hashed.

Reviewer access starts **off**. Enable it on the Reviewers page when ready. The master switch pauses all existing sessions and new activations. Re-enabling it restores only unexpired, individually unrevoked invitations. Revoking a reviewer permanently invalidates that invitation and all its installations; create a new invitation if they need access again. Uninstalling does not replenish the invitation's lifetime installation limit.

Reviewers install the same Chrome Web Store extension, open the disconnected popup, choose **Have a reviewer code?**, and enter the code. They do not install the agent. The extension does not install machine policies or prevent normal removal through Chrome. Existing disclosures and checkout behavior are unchanged.

## Build and deployment

Apply the `20260921120000_reviewer_access` migration before starting the updated backend, and regenerate Prisma. This task tested the migration on the isolated reliability database; it did not migrate the application database or deploy.

The reviewer build connects directly to the backend because the agent is not there to supply its address. At the user's explicit direction, reviewer builds default to `http://56.228.62.8:3000` for now. No backend address is shown or entered by reviewers. This temporary HTTP endpoint does not encrypt access codes or tokens in transit; the build supports overriding it with HTTPS later.

```powershell
# Uses the confirmed live backend by default.
npm run package:reviewers --workspace=@saverlly/extension
```

`SAVERLLY_REVIEWER_API_URL` can override the reviewer default. HTTP is accepted for localhost development and the explicitly approved live origin above; other remote origins require HTTPS. A standard build without this variable hides reviewer activation and keeps the normal agent workflow. The reviewer extension was rebuilt with the confirmed live origin after local verification. Use the next extension version when preparing the release.

## Separation and access checks

- Reviewer sessions and activity have their own tables and authenticated `/reviewer-public` endpoints. Reviewer tokens cannot authenticate normal device APIs or dashboard APIs.
- The extension uses the same merchant data, coupons, checkout recipe, coupon application, and attribution code. Reviewer coupon events and attribution sub-IDs remain outside kiosk commission ingestion, coupon statistics, and payouts. Only untargeted promotions are shown.
- Every reviewer API request checks the master switch, expiry, and revocation. The extension checks again before applying coupons and polls approximately once per minute while Chrome is running. Reviewer access has no offline grace. A running coupon attempt may finish safely; revocation prevents subsequent authenticated work rather than remotely uninstalling the extension.
- Redemption is rate limited and serialized against the installation limit. A browser-generated activation secret makes retries safe after a lost response without consuming an additional installation. Neither code nor token is sent in a URL.
- A token received from the desktop agent takes precedence and clears temporary reviewer state. New activation cannot overwrite an existing managed-device token.

## Turn it off after testing

Disable **Reviewer access** first. This blocks previously issued sessions even if an older extension is still installed. Build the normal extension without `SAVERLLY_REVIEWER_API_URL` to remove the activation entry point. The isolated Reviewers module, routes, tables, and dashboard page can then be removed in a later cleanup release without changing device authentication or the agent.

Verification covers admin role restrictions, hash-only storage, expiry/revocation, simultaneous redemption, replay-safe activation and events, financial isolation, existing device authentication, popup activation, and agent priority. The dashboard list, form, and success screen were also checked in the running local app using the isolated test database.
