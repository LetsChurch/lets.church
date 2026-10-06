import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Which Let's Church to talk to. Production by default; point a dev build at
// the local stack with `WXT_LC_URL=http://localhost:4000 pnpm dev`.
const DEFAULT_LC_URL = 'https://lets.church';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => {
    const lcOrigin = new URL(process.env.WXT_LC_URL || DEFAULT_LC_URL).origin;

    return {
      name: "Let's Church Mirror",
      description:
        "Mirror your YouTube videos to Let's Church from YouTube Studio, one at a time or in bulk.",
      permissions: ['storage'],
      host_permissions: [
        // Session cookie + API (the extension rides your lets.church sign-in).
        `${lcOrigin}/*`,
        // Studio pages we augment, and Studio's own video API.
        'https://studio.youtube.com/*',
        // "Download" on your own videos, which redirects to googlevideo.
        'https://www.youtube.com/*',
        'https://*.googlevideo.com/*',
      ],
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'mirror@lets.church',
                strict_min_version: '128.0',
              },
            },
          }
        : {}),
    };
  },
});
