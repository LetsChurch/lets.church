import './style.css';
import type { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { onMessage } from '@/lib/messages';
import { getStudioVideos } from '@/lib/studio-api';

import { Overlay } from './Overlay';
import { BulkActionButton, EditPageButton } from './StudioButtons';

// Where we plug into Studio (verified October 2026). Studio is an SPA, so the
// inline buttons auto-mount whenever these appear and unmount when they go.
const EDIT_PAGE_HEADER_BUTTONS = 'ytcp-video-details-section div.buttons';
const BULK_ACTIONS_TOOLBAR = 'ytcp-bulk-actions div.toolbar';

function mountUi(
  ctx: ContentScriptContext,
  {
    name,
    anchor,
    append,
    render,
  }: {
    name: string;
    anchor: string;
    append: 'first' | 'last';
    render: (root: HTMLElement) => ReactNode;
  },
) {
  return createShadowRootUi(ctx, {
    name,
    position: 'inline',
    anchor,
    append,
    onMount: (container) => {
      // Styles live on `.lc-root`: WXT resets the shadow host itself.
      const app = document.createElement('div');
      app.className = 'lc-root';
      container.append(app);
      const root = ReactDOM.createRoot(app);
      root.render(render(app));
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });
}

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // The queue page asks an open Studio tab for fresh download links, since
    // Studio's tokens expire while a long bulk queue works through.
    onMessage((message) =>
      message.type === 'studio:getVideos'
        ? getStudioVideos(message.videoIds)
        : undefined,
    );

    const overlay = await mountUi(ctx, {
      name: 'lc-mirror-overlay',
      anchor: 'body',
      append: 'last',
      render: (root) => <Overlay portalContainer={root} />,
    });
    overlay.mount();

    const editButton = await mountUi(ctx, {
      name: 'lc-mirror-edit',
      anchor: EDIT_PAGE_HEADER_BUTTONS,
      append: 'first',
      render: () => <EditPageButton />,
    });
    editButton.autoMount();

    const bulkButton = await mountUi(ctx, {
      name: 'lc-mirror-bulk',
      anchor: BULK_ACTIONS_TOOLBAR,
      append: 'last',
      render: () => <BulkActionButton />,
    });
    bulkButton.autoMount();
  },
});
