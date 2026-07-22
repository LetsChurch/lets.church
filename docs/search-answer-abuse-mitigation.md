# Abuse mitigation for the AI answer endpoints

Status: **token-bucket rate limiting implemented** for `/api/search-answer` and
`/api/dig-deeper`; proof-of-work and a global spend cap remain future layers.

## Threat

The AI answer endpoints are **unauthenticated** and **expensive per call**:
each request runs a query embedding, one or more Elasticsearch + DB tool calls,
and a streamed LLM generation (up to 12 tool turns). That makes it a
**cost / resource DoS** lever — a script can hammer it to burn OpenRouter spend
and saturate the agent worker — independent of prompt injection.

Goal: throttle abusive volume **without a third-party CAPTCHA**. We prefer
client **proof-of-work (PoW)** over Cloudflare Turnstile.

## Why PoW instead of Turnstile

|                      | Turnstile                                | Proof-of-work                |
| -------------------- | ---------------------------------------- | ---------------------------- |
| Dependency           | Third-party (Cloudflare)                 | Self-contained               |
| Privacy              | Sends signals to a third party           | No third party               |
| UX                   | Usually invisible, sometimes a challenge | Invisible (runs in a worker) |
| API/headless clients | Awkward                                  | Works (just compute)         |
| What it measures     | Bot-vs-human likelihood                  | Compute cost paid            |

PoW makes each request _cost the caller something_, which directly targets the
volumetric/cost threat. It does **not** tell bots from humans — a bot willing to
pay the compute still passes — so it's a rate/cost control, not a bot filter.

## Scheme (hashcash-style)

1. **Challenge issuance** — `GET /api/search-challenge` returns a challenge the
   server can later verify statelessly:
   `{ nonce, difficulty, exp, scope }` plus an HMAC signature over those fields
   (server secret). `scope` optionally binds it to the resource id / IP and to
   this endpoint so a solution can't be reused elsewhere. Short `exp` (e.g. 2
   min).
2. **Client solve** — in a Web Worker (so the UI never blocks), find `solution`
   such that `sha256(nonce + ":" + solution)` has `difficulty` leading zero
   bits. Cost is `~2^difficulty` hashes; verification is one hash.
3. **Submit** — include `{ challenge, signature, solution }` with the
   `search-answer` POST (header or body).
4. **Verify** (cheap) — recompute HMAC, check `exp`, check the leading-zero
   condition, and enforce **single-use** (nonce seen-set with TTL = `exp`, in
   Redis/Upstash or in-memory for a single instance) to stop replay.
5. **Adaptive difficulty** — keep difficulty low for the first request and
   **escalate** as a caller's recent rate climbs (per IP + per `resourceId`/user
   counters). Normal use pays ~nothing; bursts get exponentially more expensive.

## Layering (PoW is one layer, not the whole answer)

- **Token-bucket rate limit** per IP and per `resourceId` (implemented). Both
  endpoints spend from the same Valkey-backed credit buckets; deep-search and
  chat requests cost twice as much as an ordinary overview. A bounded
  process-local bucket takes over when Valkey is unavailable.
- **Global token budget / spend cap** per day — hard ceiling on OpenRouter cost
  regardless of who's calling.
- **PoW** as an adaptive second layer, mainly for anonymous / high-rate callers.
- **`maxSteps` cap** (already 8) bounds per-request fan-out.
- **Auth requirement** for heavy/automated use, longer term.
- Keep Turnstile available as an emergency fallback for egregious abuse.

## Trade-offs / limits of PoW

- **Weak asymmetry**: cheap to verify, but a determined attacker with many
  cores / GPUs / a botnet still solves challenges. PoW _raises the cost_, it
  doesn't stop a funded adversary.
- **Penalizes low-power devices**: mobile/battery users pay the same CPU; high
  difficulty hurts UX and accessibility. Keep baseline difficulty low.
- **No identity / fairness on its own** → must be paired with per-caller
  counters to be fair.
- **Replay/sharing** must be closed (single-use nonce + binding + short TTL).
- **Not a human test**: a paying bot passes. Combine with the layers above if
  bot-vs-human ever matters.
- **Energy cost**: PoW burns real electricity by design.

## Integration points

- Implemented guards at the top of both POST handlers, before retrieval/model
  dependencies load. Rejections return `429` plus `Retry-After`, and clients do
  not retry deliberate throttles.
- Shared counters live in Valkey, with bounded in-memory fallback buckets for a
  single instance during cache outages.
- Future: add `GET /api/search-challenge` for PoW challenge issuance and verify
  its single-use solution alongside the existing rate limit.
- Client solver in a Web Worker, invoked by `components/answer-panel.tsx` before
  the `fetch` (future PoW layer).
