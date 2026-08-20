import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiTelemetry, initAiTelemetry } from './ai-telemetry';

const registry = globalThis as typeof globalThis & {
  __letschurchAiTelemetry?: unknown;
};

beforeEach(() => {
  delete registry.__letschurchAiTelemetry;
  delete process.env.POSTHOG_PROJECT_TOKEN;
  delete process.env.POSTHOG_AI_CAPTURE_CONTENT;
});

afterEach(() => {
  delete registry.__letschurchAiTelemetry;
  delete process.env.POSTHOG_PROJECT_TOKEN;
  delete process.env.POSTHOG_AI_CAPTURE_CONTENT;
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
