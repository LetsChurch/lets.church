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
requests are CAPTCHA-protected and rate-limited by keyed, non-plaintext IP and
normalized-email identifiers. Public failures are generic; operational details
belong in server logs.

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

| Stripe resource     | Permission | Used for                                                       |
| ------------------- | ---------- | -------------------------------------------------------------- |
| Customers           | Write      | Creating Checkout customers and validating imported customers  |
| Checkout Sessions   | Write      | Creating donation checkouts and retrieving completed sessions  |
| Customer portal     | Write      | Opening Stripe's billing portal for donors and administrators  |
| Subscriptions       | Write      | Reading, creating, canceling, and resuming recurring donations |
| Charges and Refunds | Write      | Reading charge results and issuing administrator refunds       |
| Products            | Write      | Finding or creating the product used by recurring-plan imports |
| Invoices            | Read       | Reconciling recurring payments and payment failures            |
| Payment Intents     | Read       | Reconciling one-time payments and expanded invoice payments    |
| Disputes            | Read       | Recording dispute status changes                               |
| Payment Methods     | Read       | Validating imported `pm_...` payment methods                   |
| Sources             | Read       | Validating imported legacy payment sources                     |

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

`Products`, `Payment Methods`, and `Sources` are needed only while importing
recurring plans. They can be returned to **None** after the migration is
finished. The application must be changed to accept a second Stripe key before
these permissions can be isolated onto a separate import-only key.

Create and exercise the restricted key in test mode before matching its
permissions in live mode. Test one-time and monthly checkout, the customer
portal, cancellation and resumption, an administrator refund, webhook
processing, and a recurring-plan import. Review the key's Stripe request logs
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

Donors can open `/dashboard/account/donations` to see gift history, download
receipts, print annual statements, update billing details, stop a recurring
gift at the end of its billing period, or keep a scheduled cancellation active.
Someone who donated without an account can request an email sign-in link with
the checkout email. Confirming the address creates an account when needed and
attaches matching guest gifts.

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
