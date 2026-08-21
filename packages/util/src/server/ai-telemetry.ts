import { OpenTelemetry } from '@ai-sdk/otel';
import type { Attributes } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PostHogSpanProcessor } from '@posthog/ai/otel';
import { registerTelemetry } from 'ai';

const REGISTRY_KEY = '__letschurchAiTelemetry' as const;

type AiTelemetryRuntimeContext = {
  aiFeature: string;
  aiSessionId?: string;
  posthogDistinctId?: string;
  posthogSessionId?: string;
} & Record<string, unknown>;

type AiTelemetryState = {
  captureContent: boolean;
  enabled: boolean;
  processor?: PostHogSpanProcessor;
  sdk?: NodeSDK;
  shutdown?: Promise<void>;
};

type AiTelemetryRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: AiTelemetryState;
};

export type AiTelemetryContext = {
  /** Stable application user or anonymous browser id. */
  distinctId?: string;
  /** Groups the AI calls made for one request or conversation turn. */
  aiSessionId?: string;
  /** Browser PostHog session id, used to link a trace to session replay. */
  posthogSessionId?: string;
  /** Low-cardinality product feature name. Defaults to the function id. */
  feature?: string;
};

export type AiTelemetryCallOptions = {
  runtimeContext: AiTelemetryRuntimeContext;
  telemetry: {
    functionId: string;
    isEnabled: boolean;
    includeRuntimeContext: {
      aiFeature: true;
      aiSessionId: true;
      posthogDistinctId: true;
      posthogSessionId: true;
    };
    recordInputs: boolean;
    recordOutputs: boolean;
  };
};

const registry = globalThis as AiTelemetryRegistry;

function runtimeAttributes(runtimeContext: unknown): Attributes | undefined {
  const context = runtimeContext as AiTelemetryRuntimeContext | undefined;
  if (!context) return undefined;

  // PostHog treats any ai.* key as legacy Vercel telemetry and then requires
  // ai.operationId to classify model calls. Keep custom attributes namespaced.
  const attributes: Attributes = {
    'letschurch.ai.feature': context.aiFeature,
  };
  if (context.posthogDistinctId) {
    attributes['posthog.distinct_id'] = context.posthogDistinctId;
  }
  if (context.posthogSessionId) {
    attributes['$session_id'] = context.posthogSessionId;
  }
  if (context.aiSessionId) {
    attributes['$ai_session_id'] = context.aiSessionId;
  }
  return attributes;
}

/**
 * Registers AI SDK 7's OpenTelemetry integration once per Node process.
 *
 * Missing `POSTHOG_PROJECT_TOKEN` intentionally makes this a no-op. Prompt,
 * tool, and response content are excluded unless
 * `POSTHOG_AI_CAPTURE_CONTENT=true` is explicitly configured. Embedding values
 * are never exported.
 */
export function initAiTelemetry({
  serviceName,
}: {
  serviceName: string;
}): void {
  if (registry[REGISTRY_KEY]) return;

  const projectToken = process.env.POSTHOG_PROJECT_TOKEN?.trim();
  const captureContent = process.env.POSTHOG_AI_CAPTURE_CONTENT === 'true';
  if (!projectToken) {
    registry[REGISTRY_KEY] = { captureContent, enabled: false };
    return;
  }

  try {
    const host = process.env.POSTHOG_HOST?.trim() || undefined;
    const processor = new PostHogSpanProcessor({ projectToken, host });
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ 'service.name': serviceName }),
      spanProcessors: [processor],
    });
    sdk.start();

    registerTelemetry(
      new OpenTelemetry({
        enrichSpan: ({ runtimeContext }) => runtimeAttributes(runtimeContext),
      }),
    );

    registry[REGISTRY_KEY] = {
      captureContent,
      enabled: true,
      processor,
      sdk,
    };
    process.once('beforeExit', () => {
      void shutdownAiTelemetry();
    });
  } catch (error) {
    registry[REGISTRY_KEY] = { captureContent, enabled: false };
    console.warn(
      'AI telemetry initialization failed; continuing without telemetry:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Per-call AI SDK options with privacy-safe defaults and optional correlation. */
export function aiTelemetry(
  functionId: string,
  context: AiTelemetryContext = {},
): AiTelemetryCallOptions {
  const state = registry[REGISTRY_KEY];
  const captureContent = state?.captureContent ?? false;
  return {
    telemetry: {
      functionId,
      isEnabled: state?.enabled ?? false,
      includeRuntimeContext: {
        aiFeature: true,
        aiSessionId: true,
        posthogDistinctId: true,
        posthogSessionId: true,
      },
      recordInputs: captureContent,
      recordOutputs: captureContent,
    },
    runtimeContext: {
      aiFeature: context.feature ?? functionId,
      aiSessionId: context.aiSessionId,
      posthogDistinctId: context.distinctId,
      posthogSessionId: context.posthogSessionId,
    },
  };
}

/** Flushes queued spans without shutting down the process-wide tracer. */
export async function flushAiTelemetry(): Promise<void> {
  await registry[REGISTRY_KEY]?.processor?.forceFlush();
}

/** Flushes and unregisters the process-wide telemetry provider. */
export function shutdownAiTelemetry(): Promise<void> {
  const state = registry[REGISTRY_KEY];
  if (!state?.sdk) return Promise.resolve();
  if (!state.shutdown) {
    state.shutdown = state.sdk.shutdown();
  }
  return state.shutdown;
}
