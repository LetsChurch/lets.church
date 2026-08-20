# PostHog AI observability assessment

Date: 2026-08-18

## Decision

OpenTelemetry is **not a prerequisite for PostHog AI Observability as a product**. PostHog consumes its own `$ai_generation`, `$ai_span`, and `$ai_embedding` events. Those events can arrive through PostHog's provider/framework wrappers, manual event capture, or an OpenTelemetry/OTLP pipeline.

This repository now uses the OpenTelemetry path because the requested latest AI SDK is v7: `@ai-sdk/otel` emits AI SDK operation/model/tool/embedding spans, and `@posthog/ai`'s `PostHogSpanProcessor` batches only AI-related spans to PostHog. This does not require an OpenTelemetry Collector or whole-application tracing.

Do not send the Temporal transcript-processing workload to PostHog initially. It already has a purpose-built `llm_call` audit table, and exporting those large offline prompts and outputs would duplicate cost data, consume AI Observability events, and expand the sensitive-data footprint without adding user/session correlation.

## What PostHog actually stores

A model call is a `$ai_generation` event. Related generations and `$ai_span` events are grouped by the required `$ai_trace_id`; optional `$ai_session_id` groups multiple traces into a conversation or workflow. PostHog derives a pseudo-trace from child events, so callers do not have to send a separate `$ai_trace` event. Generations can carry prompt/output content, tools, token counts, cost, latency, model/provider, errors, and custom properties. Because these are PostHog events, they can be analyzed alongside product events and people.

Sources:

- [Generations and event properties](https://posthog.com/docs/ai-observability/generations)
- [Trace hierarchy and pseudo-traces](https://posthog.com/docs/ai-observability/traces)
- [AI Observability overview](https://posthog.com/docs/ai-observability)

## Ingestion options

| Path                                                        | Requires OpenTelemetry? | Fit here                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@posthog/ai/vercel` `withTracing(model, posthog, options)` | No                      | Legacy option for AI SDK v5/v6. The wrapper rejects v7 models, so it is not used after this repository's AI SDK v7 upgrade.                                                        |
| AI SDK v7 `@ai-sdk/otel` plus `@posthog/ai/otel`            | Yes                     | Implemented for the user-facing `packages/web` and `packages/lets.bible` AI calls. Captures operation, model, multi-step tool, and embedding spans without a collector.            |
| `@posthog/ai/openai` wrapper                                | No                      | Could instrument direct OpenAI/OpenRouter SDK calls, but is not recommended initially for the offline Temporal workload.                                                           |
| `posthog-node.capture()` or the capture API                 | No                      | Works with any SDK. More manual and easy to make inconsistent, but useful when existing wrappers do not fit.                                                                       |
| Generic OTEL instrumentation or an OTEL Collector           | Yes                     | Best when OTEL is already the system-wide tracing contract or when another language/framework emits `gen_ai.*` spans. A collector is optional; PostHog accepts OTLP/HTTP directly. |

Primary sources:

- [Published `@posthog/ai` 8.8.0 package metadata and exports](https://registry.npmjs.org/@posthog%2fai/latest)
- [`withTracing` implementation at the 8.8.0 release commit](https://github.com/PostHog/posthog-js/blob/c9086de42e1c7f102b6cca318c875bdf030d630f/packages/ai/src/vercel/middleware.ts#L471-L512)
- [`@posthog/ai` 8.7.0 release change: AI SDK v7 uses OTEL; legacy `withTracing` rejects v7](https://github.com/PostHog/posthog-js/commit/4d379bb327ed76cca9c9c9734f72f585c15fb057)
- [Documented Vercel AI SDK integration](https://posthog.com/docs/ai-observability/installation/vercel-ai)
- [OpenAI wrapper integration](https://posthog.com/docs/ai-observability/installation/openai)
- [Manual `$ai_generation` capture](https://posthog.com/docs/ai-observability/installation/manual-capture)
- [Generic OpenTelemetry integration](https://posthog.com/docs/ai-observability/installation/opentelemetry)

### Current documentation discrepancy

PostHog's Vercel installation page currently documents the OTEL path for AI SDK v5/v6 and says AI SDK v7 is unsupported because v7 removed the old built-in instrumentation. The released `@posthog/ai` 8.8.0 source is newer and more precise: its legacy `withTracing` wrapper supports v5/v6, while v7 should use `@ai-sdk/otel` with `@posthog/ai/otel`. Treat the published package source as the current API contract, but prove either path with one real trace before broad rollout.

## What “adding OTEL” would mean

It does not require deploying a general-purpose collector or instrumenting the whole application.

For the implemented AI SDK v7 path, each Node process initializes `@opentelemetry/sdk-node` with `PostHogSpanProcessor`, then registers `@ai-sdk/otel` globally through AI SDK's `registerTelemetry`. Per-call `telemetry` and `runtimeContext` options provide function names, privacy controls, and request correlation. The PostHog processor batches ended spans to `{host}/i/v0/ai/otel` and exports only spans whose name or attribute keys begin with `gen_ai.`, `llm.`, `ai.`, or `traceloop.`. It silently drops unrelated spans.

No collector is necessary: `PostHogSpanProcessor` contains an OTLP/HTTP exporter. The shared helper exposes `forceFlush()` and shuts the SDK down on normal process drain so the batch processor does not retain final spans in memory.

Sources:

- [PostHog OTEL setup and semantic-convention mapping](https://posthog.com/docs/ai-observability/installation/opentelemetry)
- [`PostHogSpanProcessor` filtering, endpoint, batching, and flush contract](https://github.com/PostHog/posthog-js/blob/c9086de42e1c7f102b6cca318c875bdf030d630f/packages/ai/src/otel/processor.ts)
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

## Repository fit

### Implemented state

- `packages/web` keeps its browser `posthog-js` initialization and now enables `tracing_headers` for same-origin requests, propagating `X-POSTHOG-SESSION-ID` and `X-POSTHOG-DISTINCT-ID`.
- `packages/util/src/server/ai-telemetry.ts` owns one process-wide `NodeSDK`, `PostHogSpanProcessor`, and AI SDK `OpenTelemetry` integration. A missing `POSTHOG_PROJECT_TOKEN` disables export without affecting requests.
- `packages/web` and `packages/lets.bible` use AI SDK `^7.0.66`, `@ai-sdk/openai ^4.0.42`, and current v7 APIs. Every user-facing `streamText`, structured `generateText`, `embed`, and `embedMany` call supplies telemetry options.
- Requests attach the browser distinct/session headers when available. Web search uses its bounded `resourceId` as the anonymous fallback and its `threadId` as the AI session. lets.bible creates one AI session ID per answer request.
- Content capture is off by default. `POSTHOG_AI_CAPTURE_CONTENT=true` is the explicit opt-in for prompts, tool/embedding values, and outputs.
- `packages/temporal` remains on its purpose-built `llm_call` audit path and is not exported to PostHog.
- Production runs Node 24.4.1, which satisfies `@posthog/ai` 8.8.0's Node requirement (`^20.20.0 || >=22.22.0`).

### Existing browser PostHog is not enough

The browser client and its project token can place frontend and backend events in the same PostHog project, but `posthog-js` cannot observe server-side LLM calls by itself. The server still needs one of the ingestion paths above. Correlation also has to be propagated explicitly:

- `posthog_distinct_id` / `posthogDistinctId` associates a generation with a PostHog person.
- `$ai_trace_id` groups model calls and tool spans for one request.
- `$ai_session_id` groups multiple traces into a conversation/workflow.
- `$session_id` links a backend generation to a frontend session replay.

PostHog injects `X-POSTHOG-SESSION-ID` and `X-POSTHOG-DISTINCT-ID` into configured frontend requests through `tracing_headers`; the implemented backend maps those values into generation span attributes.

Source: [Linking backend LLM events to session replay](https://posthog.com/docs/ai-observability/link-session-replay)

## Implemented rollout

### Configuration

Set `POSTHOG_PROJECT_TOKEN` on the `web` and `letsbible` processes. It is a PostHog project token (`phc_…`), not a personal API key. `POSTHOG_HOST` defaults to `https://us.i.posthog.com`; use the project's regional ingestion host when different. The repository deliberately does not send server OTLP traffic through `https://z.lets.church` because that proxy's AI OTLP route is not defined here.

`POSTHOG_AI_CAPTURE_CONTENT` defaults to `false`. In that mode, model/provider, token usage, latency, finish/error state, function/feature names, trace topology, and correlation metadata remain available while prompts, tool values, embedding values, and model outputs are excluded.

### Correlation

`packages/web` configures PostHog's same-origin tracing headers. The API maps the propagated distinct ID to `posthog.distinct_id`, the browser session to `$session_id`, and the bounded application thread to `$ai_session_id`. OpenTelemetry supplies `$ai_trace_id`, `$ai_span_id`, and parent IDs from actual span context, so unrelated requests never share a module-level trace ID.

### Lifecycle

The telemetry provider is initialized once when each server-side AI model module loads. The PostHog processor batches only AI spans. `flushAiTelemetry()` is available for request-scoped runtimes, and the long-lived Node process shuts down the SDK during normal process drain.

### Deliberate exclusions

Temporal transcript annotation and other offline `packages/temporal` calls continue to use `llm_call` only. This avoids duplicate accounting and sending retained transcript prompts/outputs into a second system. A general OTEL Collector, non-AI auto-instrumentation, and a second tracing backend remain deferred until they solve a concrete routing or service-tracing need.

## Cost and volume

AI Observability is billed per AI event, not per user request. One agent request can produce multiple generation and span events, especially for multi-step tool loops, so estimate volume from emitted events rather than HTTP requests. As of 2026-08-18, the first 100,000 AI Observability events per month are free; usage above that is tiered.

Source: [PostHog pricing](https://posthog.com/pricing)

## Proof checklist

A one-route proof is successful only if all of the following are observed in PostHog:

1. One request creates the expected trace, without unrelated requests sharing its trace ID.
2. Every model step appears once; no duplicate generation arrives from two instrumentation paths.
3. Model, provider, input/output token counts, latency, stop reason, streaming status, and cost are populated.
4. Tool calls are visible at the expected fidelity for the chosen wrapper or OTEL path.
5. Error and aborted-stream paths produce an errored generation and do not block the response.
6. Identified and anonymous requests associate with the intended PostHog person.
7. `$session_id` links to the correct session replay when enabled.
8. Privacy mode omits prompt and output content while preserving operational metadata.
9. Process shutdown or request completion flushes queued events.
10. The existing `llm_call` records remain unchanged and authoritative.
