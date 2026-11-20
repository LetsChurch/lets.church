# Donations

Let's Church accepts one-time and monthly donations through Stripe Checkout.
Donors can give without an account. If they later verify the same email address
on a Let's Church account, their guest gifts appear in account history.

## Donor identity and payment isolation

The email entered at checkout is an unverified receipt address. It is never
used to look up or reuse a stored Stripe Customer. Every native checkout starts
without a `customer` parameter and passes only `customer_email`; Stripe creates
a new Customer when a recurring checkout needs one. This prevents someone from
entering another donor's email to expose or charge that donor's saved payment
method.

Stripe Customer IDs created by guest checkout are stored on their individual
recurring subscriptions, not promoted to the shared donor record. Billing
portal and cancellation actions require a signed-in account that has verified
the checkout email and are scoped to that account's subscription.

The donation status endpoint does not return the checkout email. The donation
page keeps the address in same-tab session storage long enough to prefill the
post-checkout email sign-in form, then removes it. Checkout and email sign-in
requests are rate-limited by keyed, non-plaintext IP and normalized-email
identifiers; email sign-in is also CAPTCHA-protected. Checkout has no CAPTCHA:
it only opens a Stripe Checkout Session, and donor and checkout rows are written
only once Stripe reports on the session, from metadata the server set on it.
For a monthly gift, `checkout.session.completed` also records the paid first
invoice, so the first gift lands even if `invoice.paid` was applied earlier,
while the subscription still read as incomplete.
Public failures are generic; operational details belong in server logs.

## Stripe setup

Set these server-side environment variables in production:

```sh
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The web application also needs its existing `WEB_URL` setting so Stripe can
return donors to the right host.

### API key permissions

Create a restricted server-side key for `STRIPE_SECRET_KEY`. Use an
`rk_test_...` key in test mode and a separate `rk_live_...` key in production.
An unrestricted `sk_...` secret key also works, but grants access to the entire
Stripe account and is not recommended.

The current application uses one Stripe API key for checkout, webhook
reconciliation, donor and administrator subscription controls, refunds, and
recurring-plan imports. Give that restricted key these permissions:

| Stripe resource     | Permission | Used for                                                      |
| ------------------- | ---------- | ------------------------------------------------------------- |
| Customers           | Write      | Creating Checkout customers and validating imported customers |
| Checkout Sessions   | Write      | Creating donation checkouts and retrieving completed sessions |
| Customer portal     | Write      | Opening Stripe's billing portal for donors and administrators |
| Subscriptions       | Write      | Reading, creating, canceling, resuming, and repricing plans   |
| Charges and Refunds | Write      | Reading charge results and issuing administrator refunds      |
| Products            | Write      | Finding or creating products for imports and amount changes   |
| Invoices            | Read       | Reconciling recurring payments and payment failures           |
| Payment Intents     | Read       | Reconciling one-time payments and expanded invoice payments   |
| Disputes            | Read       | Recording dispute status changes                              |
| Payment Methods     | Read       | Validating imported `pm_...` payment methods                  |
| Sources             | Read       | Validating imported legacy payment sources                    |

Leave every other resource set to **None**. Stripe's Write permission includes
Read access for the same resource.

The test-mode key used by the `stripe-webhooks` Docker Compose service needs one
additional development-only permission:

| Stripe resource | Permission | Used for                                                              |
| --------------- | ---------- | --------------------------------------------------------------------- |
| Debugging Tools | Write      | Authorizing the Stripe CLI event listener (`stripecli_session_write`) |

Without this permission, `stripe listen` fails with HTTP 403 and no local
webhooks are delivered. Leave **Debugging Tools** set to **None** on the
production application key.

`Payment Methods` and `Sources` are needed only while importing recurring
plans. They can be returned to **None** after the migration is finished. The application must be changed to accept a second Stripe key before
these permissions can be isolated onto a separate import-only key.

Create and exercise the restricted key in test mode before matching its
permissions in live mode. Test one-time and monthly checkout, the customer
portal, a recurring amount change, cancellation and resumption, an
administrator refund, webhook processing, and a recurring-plan import. Review the key's Stripe request logs
for permission errors before retiring the old key.

`STRIPE_WEBHOOK_SECRET` is not an API key and has no configurable permissions.
It is the `whsec_...` signing secret for the specific webhook endpoint. Test
mode, live mode, Dashboard-managed endpoints, and Stripe CLI forwarding each
use their own signing secret.

In Stripe:

1. Enable cards and any wallet or bank payment methods you want Checkout to
   offer. Stripe controls which eligible methods appear for each donor.
2. Configure the public business name, support email, Let's Church Inc. address,
   EIN 92-3744006, receipt branding, and this receipt statement:
   `No goods or services were provided in exchange for this contribution.`
3. Enable the customer portal for payment-method updates, invoices, and
   subscription cancellation.
4. Create a webhook endpoint at
   `https://<your-domain>/webhooks/stripe`.
5. Subscribe the endpoint to:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`

Use test-mode keys and events before switching production traffic.

### Local webhook testing

The `stripe-webhooks` Docker Compose service runs Stripe CLI and forwards the
events listed above to the web container at:

```text
http://web:3000/webhooks/stripe
```

This is a Stripe CLI `--forward-to` target, **not a webhook destination to enter
in Stripe Workbench**. The `web` hostname exists only inside Docker Compose, and
Stripe cannot reach it from the internet. Do not create a Dashboard webhook for
local testing.

The Compose service must use `http://web:3000/webhooks/stripe`: `web` is the
Compose service name and `3000` is its container port. A Stripe CLI running
directly on the host would instead use
`http://localhost:4000/webhooks/stripe`. Neither local URL belongs in Stripe
Workbench.

Stripe Workbench is only for a deployed, publicly reachable HTTPS endpoint,
such as:

```text
https://lets.church/webhooks/stripe
```

To start the Compose listener:

1. Give the test restricted key **Debugging Tools: Write**.
2. Put that test-mode `STRIPE_SECRET_KEY` in `.envrc.local`.
3. Run `direnv allow`, then `just start`.
4. Run `just logs stripe-webhooks` and confirm that the listener reports
   `Ready!`. A `more_permissions_required` or HTTP 403 error means the key does
   not have **Debugging Tools: Write**.

`STRIPE_WEBHOOK_SECRET` is optional in development. When it is absent, the
webhook route logs a warning and processes unsigned payloads. Production always
refuses unsigned webhooks.

To exercise signature verification locally, run `just logs stripe-webhooks`,
copy the generated `whsec_...` value into `STRIPE_WEBHOOK_SECRET` in
`.envrc.local`, then run `direnv allow` and `just start` again. The signing
secret remains stable between Stripe CLI listener restarts. A Dashboard webhook
uses a different signing secret.

To send a fixture event without installing Stripe CLI on the host:

```sh
docker compose exec stripe-webhooks sh -c \
  'stripe trigger --api-key "$STRIPE_SECRET_KEY" checkout.session.completed'
```

The fixture verifies forwarding and signature handling. For an end-to-end
donation test, keep the listener running and complete one-time and monthly
checkouts from `/donate` with Stripe test payment details.

## Operations

### Donation emails

When a Stripe payment first reaches `SUCCEEDED` (a one-time checkout or each
paid recurring invoice), the donor gets a **thank-you receipt** ("Receipt for
your $25.00 monthly gift to Let's Church") at their checkout email, sent
through the background `sendEmailWorkflow` after the ledger transaction commits
(`packages/web/src/donations/notifications.ts`): amount, frequency, date, the
Stripe receipt link, the "no goods or services" statement and EIN, and a link
to giving history. Skipped when the donor has no email. It is in addition to
Stripe's own receipt email, and is sent from the webhook and from the
confirmation page's checkout reconciliation, whichever marks the gift
succeeded first. The workflow ID is keyed to the donation
(`donation-thank-you:<id>`) with `REJECT_DUPLICATE`, so each gift is
acknowledged once. The payload is encrypted so donor details stay out of
Temporal history. Admin imports never send email.

The site admin hears about gifts in one **daily digest** instead of an email
per gift. The same ledger transaction that marks a gift succeeded adds it to
`donation_admin_digest`, and the `donation-admin-digest` Temporal schedule runs
`donationAdminDigestWorkflow` every day at 8:00 America/New_York. It emails
`ADMIN_EMAIL` every queued gift (time in Eastern, amount, frequency, donor name
and email, whether it started a recurring plan, and whether it was refunded or
disputed since), then clears those rows in a separate activity so a database
error never resends the digest. Days with no gifts send nothing. The subject
reads "Gifts for Nov 19: 3 gifts, $175.00 (1 new monthly)", where the date is
the day before the run; a gift that succeeds after midnight but before 8:00
lands in that morning's digest. Longer digests list 100 gifts and point to the
dashboard for the rest. When `ADMIN_EMAIL` is unset the queue is still cleared.

Admin subject lines start with "Action needed:" when something needs doing
(a failed charge, a Stripe event that didn't apply, or a year-end run that
failed or stopped early) and otherwise name the donor, amount, and frequency,
for example "Jane Doe's $25.00 monthly gift ends Dec 1".

Recurring plans also send `ADMIN_EMAIL` an immediate notice (only from the
webhook, after the ledger commits) when:

- **A payment fails** (`invoice.payment_failed`, unless the invoice has since
  been paid): "Action needed: Jane Doe's $25.00 monthly charge failed", with
  ", no more retries" when Stripe won't try again. Amount, attempt number,
  Stripe's failure message, and the next retry date. One email per invoice
  (`donation-payment-failed-admin-notice:<invoice id>`), not per retry.
- **A cancellation is scheduled** (`customer.subscription.updated` whose
  `previous_attributes` show `cancel_at_period_end`/`cancel_at` turning on):
  the cancel date plus Stripe's cancellation reason and any donor feedback or
  comment. Keyed to the event
  (`donation-cancel-scheduled-admin-notice:<event id>`), so resuming and
  cancelling again sends another.
- **A plan ends** (`customer.subscription.deleted`, except `incomplete_expired`
  plans from abandoned checkouts): the end date and cancellation reason, for
  example a donor request or retries exhausted. Sent once per plan
  (`donation-subscription-ended-admin-notice:<subscription id>`).

A donor who stops a gift at period end produces two notices: one when they
schedule it and one when the plan ends.

A Stripe event that fails to apply (the webhook answers with an error and
Stripe retries it for up to three days) also sends `ADMIN_EMAIL` one notice per
event (`donation-webhook-failed-admin-notice:<event id>`) with the event type and
the error, since a gift or plan may be missing from the ledger until it applies.
The notice waits for the third failed attempt, since a brief Stripe or network
error clears on Stripe's next retry. A subscription or invoice event that
arrives before Stripe has linked its Checkout Session is expected: it fails so
Stripe retries, but raises no alert or notice until it is still failing 15
minutes after Stripe created the event.

### Year-end giving statements

Every January 8 at 15:00 UTC the `donation-year-end-statements` Temporal
schedule runs `donationYearEndStatementsWorkflow`, which emails donors a summary
of the previous UTC calendar year: total given, one line per gift, the "no
goods or services" statement and EIN, and a link to the printable statement at
`/dashboard/account/donations/<year>`. Years are UTC like the rest of the
donation records: Stripe timestamps are UTC instants and its exports label
dates UTC. The date leaves time for late-December bank payments to settle, so
the workflow refuses to send a year's statements before January 8 of the next
year.

Statements go to one recipient per account, like the statement page:

- Donor records linked to an account that isn't deleted and has a verified
  email get one combined statement, sent to the account's most recently
  verified email (the address the donate form prefills). This also covers
  linked donor records with no email of their own.
- Other donor records get their own statement, sent to the donor record's
  email. Donor records with neither are left out.

It counts the same gifts as the page (`SUCCEEDED`, `REFUNDED`, and
`PARTIALLY_REFUNDED`, net of refunds, including imported gifts; the status
list, refund netting, amount formatting, and EIN are shared through
`@letschurch/util/donations`), except that fully refunded gifts are left out
rather than shown at $0 and totals are kept per currency.

Each statement's result is recorded in `donation_year_end_statement` (donor
record, year, status), one row per donor record it covered, and donor records
with a row are never emailed again for that year. The status is `SENT`, or
`UNDELIVERABLE` when the mail server rejected the address outright (a 5.1.x
bad-mailbox reply); rejected addresses aren't retried by later runs. To try
one again after fixing the address, delete its row and rerun. Bounces that
arrive later as a returned email aren't seen. If a donor record is linked to an
account after its own statement went out, the account's statement on a rerun
covers every donor record on the account again.

The record is written by its own activity after the send, so a database error
while recording is retried without sending the email again. The workflow pages
through recipients 200 at a time, continuing as new after each page, and sends
through one child workflow per recipient
(`donation-year-end-statement:<year>:user:<account id>` or
`…:donor:<donor id>`), ten at a time. Children are abandoned rather than
terminated or cancelled with the parent, so a send that has started always
finishes and is recorded. The email is built and sent inside the child's
activity with an encrypted payload, so names and addresses stay out of
workflow history and logs; SMTP errors are rethrown without the server's reply,
which quotes the recipient. When the run finishes, `ADMIN_EMAIL` gets a
summary: sent, already sent, skipped (email removed or gifts refunded after
listing), address rejected, still running in another run, failed, and the
year's donor records on record by status. If listing recipients keeps failing
(its retries span about two hours), the run stops and the summary says so and
why, since the schedule won't fire again for a year; missing mail or `WEB_URL`
configuration stops the run at once.

To retry failures or send a past year by hand, start
`donationYearEndStatementsWorkflow` on the `background` queue with input
`{ "year": 2026 }`. Only donor records without a statement on record are
emailed.

### Needs attention

The top of `/dashboard/admin/donations` lists open `donation_alert` rows, one
per Stripe object, with a count of repeats and a link to the object in Stripe:

- **Card declined at checkout** (`payment_intent.payment_failed` on a donation
  Checkout Session): the donor is still on Stripe's page and can try again, so
  no gift is stored and no email is sent. Resolves when that checkout is paid.
  A burst of these can be card testing.
- **Recurring payment failed** (`invoice.payment_failed`, as above). Resolves
  when the invoice is paid.
- **Stripe event failed to apply** (as above). Resolves when a retry applies.

Admins can dismiss an alert; a new failure for the same object reopens it.
Alerts hold Stripe ids, the amount, and Stripe's failure message, not donor
details: those stay on the Checkout Session or the donor's record.

Donors can open `/dashboard/account/donations` to see gift history, download
receipts, print annual statements, update billing details, change the amount
of a recurring gift, stop a recurring gift at the end of its billing period, or
keep a scheduled cancellation active.
Someone who donated without an account can request an email sign-in link with
the checkout email. Confirming the address creates an account when needed and
attaches matching guest gifts.

A changed amount replaces the subscription item's price with a new inline price
in the same currency and interval, with `proration_behavior: 'none'`:
nothing is charged at the time of the change, and the next invoice uses the new
amount. The base-gift and fee-coverage split is written to the subscription's
`donationBaseAmountCents` / `donationFeeCoverageCents` metadata, which webhook
reconciliation prefers over the original checkout's split. The Stripe customer
portal is not used for amount changes, because its plan switching only offers
catalog prices and donation prices are one-off. The new price goes on a shared
active product, "Recurring donation to Let's Church" (metadata
`donationRecurringProduct=true`), which the app finds or creates on first use.
Checkout's inline product is created inactive, and Stripe refuses new prices
on inactive products.

Administrators can open `/dashboard/admin/donations` to search donations,
export CSV, issue full refunds, review disputes, manage recurring plans, and run
imports. Staff can schedule a cancellation, resume a plan, cancel immediately,
or open the donor's Stripe billing portal. Stripe actions update the local row
immediately and webhooks remain authoritative.

## Admin imports

Imports are available only at `/dashboard/admin/donations` under the **Imports**
tab. Uploaded files are parsed in memory and are not retained. Every validation
and import run is recorded with counts, filenames, status, and errors, but not
donor data. Validate all files before applying an import.

### Transaction history

The transaction CSV uses one payment per row. Required columns are:

```csv
Reference #,Status,Amount,Email,Payment captured (UTC)
```

Optional columns include `First Name`, `Last Name`, `Fee Covered`, `Fee`,
`Donated`, `Frequency`, `Currency`, `Refund date (UTC)`, and `Dispute Status`.
Succeeded and authorized payments are imported; failed or canceled rows are
counted as skipped. Source reference numbers make the import safe to retry.
Validation accepts up to 20,000 rows. Apply files in batches of no more than
2,000 ready donations so progress remains recoverable if a request stops.

### Recurring plans

A recurring-plan migration uses three CSV files:

1. A plan export with `ID`, `Status`, `Frequency`, `Email`, `Amount`, and
   `Next_bill_date`. Optional fields are `First Name`, `Last Name`,
   `Fee_covered`, and `Currency`.
2. A Stripe copy mapping with `customer_id_old`, `source_id_old`,
   `customer_id_new`, and `source_id_new`.
3. A plan-link file:

   ```csv
   Source Plan ID,Stripe Customer ID,Stripe Source ID
   ```

The source platform or its payment processor must copy the Stripe customers and
payment sources into the Let's Church Stripe account and supply the mapping.
Each active plan needs exactly one source customer and payment source.

Validation checks plan IDs, email addresses, amounts, fee coverage, frequency,
next bill dates, and every cross-file mapping without writing to Stripe or the
database. Monthly, quarterly, and yearly plans are supported.
`Next_bill_date` must be at least 48 hours in the future and use `YYYY-MM-DD` or
an ISO timestamp with a time zone. A date without a time is scheduled for noon
UTC.

Validation accepts up to 5,000 plan rows and 10,000 rows in each supporting
file. Apply no more than 25 active plans at a time. The import record is updated
after each applied plan, and a stopped run is marked failed so it can be safely
retried.

Applying the migration performs a second preflight against Stripe and the local
donor ledger. Staff must confirm that the source plans can no longer charge
donors; live Stripe data requires a separate live-mode confirmation. New
subscriptions do not charge immediately. Their first charge is scheduled for
`Next_bill_date`. Source plan IDs are stored in Stripe metadata and the local
ledger, so a failed or repeated import does not create a second subscription.

## Cutover

1. Deploy the schema migration and application.
2. Complete the Stripe setup above and test each enabled payment method.
3. Validate and import transaction history from the admin page.
4. Arrange the Stripe customer and payment-source copy for any recurring plans.
5. Validate all three recurring-plan files and reconcile every error.
6. Confirm live webhook delivery and make a small live gift.
7. Stop the old plans, confirm cutover and live mode in the admin page, then
   apply the recurring-plan import.
8. Verify the imported plans and next billing dates in Stripe before announcing
   the cutover.
