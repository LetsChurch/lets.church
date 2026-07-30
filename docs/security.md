# Security

The principles below are how we keep application-level security from regressing.
Each one is backed by a shared helper that implements it — **follow the
principle, reuse the helper, and keep this document in sync** when you add or
change a control. Don't hand-roll a parallel version of something that already
exists here.

These are defense in depth at the application layer; they complement, not
replace, infrastructure controls (network egress policy, WAF, secret management).

---

## 1. Constrain untrusted input at the boundary

Validate shape, scheme, and size where data enters the system (request schemas),
and **allow-list rather than deny-list**. Reject what you can't positively
classify as safe, as early as possible, so later code can assume a narrow domain.

## 2. Treat any outbound request to a user-influenced destination as SSRF

A URL that a user can influence (directly, via a feed, or via a redirect) must be
assumed hostile. Route such requests through the vetted fetch wrapper that
enforces an http(s) scheme, resolves DNS and blocks internal/loopback/link-local/
metadata ranges, revalidates **every redirect hop**, and **fails closed**. Never
make a bare `fetch` to a user-influenced URL. Tools that do their own networking
(subprocesses, headless browsers) can only be input-validated — rely on egress
network policy for the rest.

## 3. Neutralize untrusted data at the point of output

Encode for the **exact sink**: HTML text and HTML _attribute_ contexts have
different escaping needs, so use an escaper that is safe in both. Allow-list URL
schemes before putting a value in an `href`/`src`. Prefer structural rendering
(React nodes, DOM APIs) over building HTML by string concatenation, and sanitize
any generated HTML before injecting it. Assume every stored field is attacker-
controlled.

## 4. Derive authorization from the authenticated principal; never trust client identifiers

Re-check, on **every read and write**, that the caller may see or act on the
resource — using the resource's own state, not the mere existence of a row or a
client-supplied id. Don't let a client choose which resource a write targets
(derive it from the authenticated context and the already-authorized resource).
Don't infer "this user can see it" from a user-scoped join row they were able to
create. Centralize the access predicate so call sites can't drift.

## 5. Keep secrets out of logs and other sinks

Redact at the logging boundary and never place credentials, tokens, or raw
request input into structured log context. Assume logs are durable and widely
readable.

## 6. Bound everything the client controls

Cap array lengths, numeric sizes, and any value that drives allocation or
iteration — _before_ allocating or looping — so a single request can't exhaust
memory, CPU, or downstream quotas.

## 7. Validate redirects against your own origin

Only allow same-origin internal navigation targets. Resolve the candidate
against a fixed origin and require the result to stay on it (this catches
backslash and protocol-relative tricks); return a path, never an absolute URL.

## 8. Centralize controls; don't reimplement

Every principle above has one canonical implementation. Reuse it. A second,
slightly-different copy is how a fix silently regresses at one call site.

---

## Where the canonical helpers live

| Principle                    | Helper(s)                                                                      | Location                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1 — input constraints        | `z.url({ protocol: /^https?$/ })`, slug regexes, size caps                     | request schemas (`packages/web/src/schemas/**`)                                     |
| 2 — SSRF-safe fetch          | `assertPublicUrl`, `safeFetch`                                                 | `packages/temporal/src/util/import/safe-url.ts`                                     |
| 3 — output encoding          | `escapeHtml`                                                                   | `packages/web/src/util/html-escape.ts`                                              |
| 3 — URL scheme allow-list    | `isSafeUrl`, `safeHttpHref`                                                    | `packages/web/src/util/safe-url.ts`                                                 |
| 4 — read/write authorization | `isChannelRoutable`, `canViewMedia`, `canViewMediaById`, `getMemberChannelIds` | `packages/web/src/util/media-visibility.ts`                                         |
| 5 — log redaction            | `redactLogInput`, `redactSensitive`                                            | `packages/web/src/util/redact-log-input.ts`, `packages/web/src/util/trpc-logger.ts` |
| 7 — open-redirect            | `safeRedirect`                                                                 | `packages/web/src/util/safe-redirect.ts`                                            |

The pure helpers above are covered by unit tests in the matching `*.test.ts`
files; run `pnpm --filter @letschurch/web test` / `--filter @letschurch/temporal`.

---

## Internal service endpoints

`web` exposes one server-to-server endpoint consumed by the sibling **lets.bible**
app: `POST /api/internal/media-for-verse`
(`packages/web/src/routes/api/internal/media-for-verse.ts`), which returns media
that teaches a given Bible verse for lets.bible's study-panel Media tab.
lets.bible calls it in-cluster; it applies every principle above:

- **Auth: none, intentionally.** The response is only ever PUBLIC, already-
  approved media — the same rows anyone can reach through the public `/search`
  UI — so there is no secret to protect and no per-principal authorization to
  make. The endpoint is deliberately open rather than gated by a shared token
  that would guard nothing. (An earlier revision used an `INTERNAL_API_TOKEN`
  bearer; it was dropped because the payload carries no confidential data and
  the token only added an operational failure mode — a missing/stale secret
  silently emptied the Media tab.) If a future internal endpoint returns
  non-public data, do **not** copy this "open" posture — add real auth (a signed
  short-lived JWT) at that point.
- **Authorization (principle 4):** results reuse the canonical media
  access-control filter (`accessControlFilter` in `@letschurch/opensearch`
  `media-search.ts`) — PUBLIC visibility + approved channel + finished
  transcode/transcribe — and `hydrateUploads` re-checks channel visibility from
  Postgres. Nothing derives visibility from a client-supplied id; the only client
  inputs are a validated OSIS book + integer chapter/verse.
- **Input + bounds (principles 1, 6):** the book is allow-listed by shape (OSIS
  token, no dots), chapter/verse are positive ints, and `limit` is capped
  (default 6, max 12). The verse token is assembled server-side, so it can't
  inject into the OpenSearch `terms` filter.

lets.bible's caller (`bible.relatedMedia`) fails closed — a non-2xx, network
error, or unparseable payload degrades to an empty result, never a thrown error.

---

## Authentication links and password recovery

Email sign-in and password-reset links use separate, purpose-scoped token types.
Only a SHA-256 token hash is stored. Tokens expire after 20 minutes, are
consumed atomically, and can be used once. Issuing a password-reset token
invalidates earlier resets for that email. Email sign-in links remain valid
until one is completed, then the successful link consumes its siblings. This
prevents an unsolicited request from invalidating a link already in the
recipient's inbox.

The sign-in landing page requires a POST action before consuming the token so
email link scanners do not use it accidentally. Email sign-in can create a
passwordless account and verifies the address in the same transaction. Normal
registration still requires a password. Passwordless users can set one from
account security, and the password-reset flow works for both account types.
Completing a password reset revokes every existing session.

Authentication tokens, passwords, CAPTCHA responses, and import CSV contents
are redacted by the tRPC logging boundary. Redirects stored with sign-in tokens
pass through `safeRedirect` both before storage and before use.

---

## Donations

Payment details go straight to Stripe Checkout and never pass through the
application. The application stores donor identity, amounts, Stripe object IDs,
status, and receipt links.

- Checkout input is schema-validated and amount-bounded. hCaptcha protects the
  public endpoint.
- A signed-in donor can attach a checkout only to an email address already
  verified on that account.
- Guest gifts are attached to an account only after the matching email address
  is verified.
- Stripe webhook signatures are verified against the raw request body. Event IDs
  are stored before processing so retries do not create duplicate ledger rows.
- Stripe webhooks, not browser redirects, set payment and subscription state.
- Donation history, portal sessions, refunds, subscription cancellation, search,
  and exports enforce server-side account or administrator authorization.
- Donation imports are administrator-only, request-size bounded, and do not
  store uploaded CSV contents. Import runs retain counts, filenames, and errors.
- Checkout status responses contain no donor details and expose only the amount,
  frequency, and payment status needed by the confirmation page.

Keep Stripe secret keys and webhook signing secrets out of client bundles and
logs. Do not log donor names, email addresses, checkout payloads, or webhook
bodies.

---

## Known limitations

Documented so contributors don't assume coverage that isn't there:

- **Search authorization (Elasticsearch):** aggregate counts can be computed from
  the index before the database authorization filter is applied, which can act as
  an existence oracle for non-public content. Needs index-query / reindex work.
- **DNS rebinding** for outbound fetches (principle 2) can't be fully closed at
  the application layer — depends on egress network policy.

---

## Contributor checklist

When adding or changing an endpoint or a render path, ask:

- [ ] Untrusted input validated and constrained at the boundary (scheme, size,
      shape), allow-list style? (principle 1)
- [ ] Outbound request to a user-influenced URL? → vetted fetch wrapper.
      (principle 2)
- [ ] User data reaching HTML/attributes/links? → escape for the sink + allow-list
      URL schemes; avoid unsanitized `dangerouslySetInnerHTML`. (principle 3)
- [ ] Returning or mutating a resource by id (or via a user-scoped row)? →
      re-derive authorization from the resource; don't trust client ids.
      (principle 4)
- [ ] Logging? → no secrets or raw input in context. (principle 5)
- [ ] Unbounded array/number from the client? → cap it. (principle 6)
- [ ] User-supplied redirect target? → origin-validate it. (principle 7)
- [ ] A control like the above already exists? → reuse it, don't fork it.
      (principle 8)
