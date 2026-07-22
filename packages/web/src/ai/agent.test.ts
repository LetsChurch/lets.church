import { describe, expect, it, vi } from 'vitest';

vi.mock('./tools/aggregate-media', () => ({ aggregateMediaTool: {} }));
vi.mock('./tools/grep-transcript', () => ({ grepTranscriptTool: {} }));
vi.mock('./tools/recall-windows', () => ({ recallWindowsTool: {} }));
vi.mock('./tools/resolve-channel', () => ({ resolveChannelTool: {} }));
vi.mock('./tools/search-media', () => ({ searchMediaTool: {} }));

import {
  ASSISTANT_NAME,
  CHAT_INSTRUCTIONS,
  DETECTIVE_INSTRUCTIONS,
  INSTRUCTIONS,
} from './agent';

describe('assistant identity', () => {
  it('names every chat prompt Wendell', () => {
    expect(ASSISTANT_NAME).toBe('Wendell');

    for (const prompt of [
      INSTRUCTIONS,
      CHAT_INSTRUCTIONS,
      DETECTIVE_INSTRUCTIONS,
    ]) {
      expect(prompt).toContain('Your name is Wendell');
      expect(prompt).toContain('Never identify yourself as ChatGPT');
      expect(prompt).toContain(
        'the only exception to the tool-use, library-grounding, and citation requirements',
      );
    }
  });
});
