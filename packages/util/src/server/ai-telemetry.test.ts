import { createServer } from 'node:http';

import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiTelemetry,
  flushAiTelemetry,
  initAiTelemetry,
  shutdownAiTelemetry,
} from './ai-telemetry';

const registry = globalThis as typeof globalThis & {
  __letschurchAiTelemetry?: unknown;
};

type OtlpAttribute = {
  key: string;
  value: {
    intValue?: number;
    stringValue?: string;
  };
};

type OtlpPayload = {
  resourceSpans: Array<{
    scopeSpans: Array<{
      spans: Array<{
        attributes: OtlpAttribute[];
        name: string;
      }>;
    }>;
  }>;
};

beforeEach(() => {
  delete registry.__letschurchAiTelemetry;
  delete process.env.POSTHOG_PROJECT_TOKEN;
  delete process.env.POSTHOG_AI_CAPTURE_CONTENT;
  delete process.env.POSTHOG_HOST;
});

afterEach(() => {
  delete registry.__letschurchAiTelemetry;
  delete process.env.POSTHOG_PROJECT_TOKEN;
  delete process.env.POSTHOG_AI_CAPTURE_CONTENT;
  delete process.env.POSTHOG_HOST;
});

describe('AI telemetry options', () => {
  it('disables export and content recording without a project token', () => {
    initAiTelemetry({ serviceName: 'test' });

    expect(aiTelemetry('test.call')).toEqual({
      telemetry: {
        functionId: 'test.call',
        isEnabled: false,
        includeRuntimeContext: {
          aiFeature: true,
          aiSessionId: true,
          posthogDistinctId: true,
          posthogSessionId: true,
        },
        recordInputs: false,
        recordOutputs: false,
      },
      runtimeContext: {
        aiFeature: 'test.call',
        aiSessionId: undefined,
        posthogDistinctId: undefined,
        posthogSessionId: undefined,
      },
    });
  });

  it('maps request correlation without recording content by default', () => {
    initAiTelemetry({ serviceName: 'test' });

    expect(
      aiTelemetry('test.call', {
        distinctId: 'person-1',
        aiSessionId: 'turn-1',
        posthogSessionId: 'browser-session-1',
        feature: 'answer',
      }),
    ).toMatchObject({
      telemetry: {
        recordInputs: false,
        recordOutputs: false,
      },
      runtimeContext: {
        aiFeature: 'answer',
        aiSessionId: 'turn-1',
        posthogDistinctId: 'person-1',
        posthogSessionId: 'browser-session-1',
      },
    });
  });
});

describe('PostHog OTLP integration', () => {
  it('exports classifier-safe standard GenAI spans', async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requests.push(Buffer.concat(chunks).toString('utf8'));
        response.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test OTLP server did not bind a TCP port');
    }

    process.env.POSTHOG_PROJECT_TOKEN = 'phc_test';
    process.env.POSTHOG_HOST = `http://127.0.0.1:${address.port}`;

    try {
      initAiTelemetry({ serviceName: 'telemetry-test' });
      await generateText({
        model: new MockLanguageModelV4({
          provider: 'openai.responses',
          modelId: 'gpt-test',
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'private response' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 5,
                noCache: 5,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 3, text: 3, reasoning: undefined },
            },
            warnings: [],
          }),
        }),
        prompt: 'private prompt',
        ...aiTelemetry('test.generation', { feature: 'answer' }),
      });
      await flushAiTelemetry();
    } finally {
      await shutdownAiTelemetry();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    expect(requests).toHaveLength(1);
    const serializedPayload = requests[0];
    // The local endpoint receives OTLP/HTTP JSON from PostHogTraceExporter.
    const payload = JSON.parse(serializedPayload) as OtlpPayload;
    const spans = payload.resourceSpans.flatMap((resource) =>
      resource.scopeSpans.flatMap((scope) => scope.spans),
    );
    const chatSpan = spans.find((span) => span.name.startsWith('chat '));
    expect(chatSpan).toBeDefined();
    if (!chatSpan) throw new Error('No chat span was exported');

    const attributes = Object.fromEntries(
      chatSpan.attributes.map(({ key, value }) => [
        key,
        value.stringValue ?? value.intValue,
      ]),
    );
    expect(attributes['gen_ai.operation.name']).toBe('chat');
    expect(attributes['gen_ai.usage.input_tokens']).toBe(5);
    expect(attributes['letschurch.ai.feature']).toBe('answer');
    expect(
      Object.keys(attributes).filter((key) => key.startsWith('ai.')),
    ).toEqual([]);
    expect(serializedPayload).not.toContain('private prompt');
    expect(serializedPayload).not.toContain('private response');
  });
});
