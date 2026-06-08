import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveChannelNames } from '@/trpc/search/channels';

export const resolveChannelTool = createTool({
  id: 'resolveChannel',
  description:
    'Resolve a free-text channel / ministry / church name to the known channels in the library. Use to check whether a named source exists and to get its canonical name before searching within it.',
  inputSchema: z.object({
    name: z
      .string()
      .describe('The channel / ministry / church name to look up.'),
  }),
  outputSchema: z.object({
    channels: z.array(z.object({ name: z.string(), slug: z.string() })),
  }),
  execute: async ({ name }) => {
    const channels = await resolveChannelNames([name]);
    return {
      channels: channels.map((c) => ({ name: c.name, slug: c.slug })),
    };
  },
});
