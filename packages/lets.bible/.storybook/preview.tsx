import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type NotFoundRouteProps,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { createContext, type ReactNode, useContext } from 'react';
import '../src/app.css';

// ---------------------------------------------------------------------------
// Stories use the TanStack Router (Link / useNavigate), so each story renders
// inside a memory router at a dummy route. Mirrors the web package's setup.
// The story is also wrapped in a themed `bg-paper` surface so the design tokens
// (which flip with the data-theme toolbar toggle) are visible.
// ---------------------------------------------------------------------------

const CurrentStoryContext = createContext<(() => ReactNode) | undefined>(
  undefined,
);

function RenderStory() {
  const storyFn = useContext(CurrentStoryContext);
  if (!storyFn) {
    throw new Error('Storybook root not found');
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper p-10 font-sans text-ink">
      {storyFn()}
    </div>
  );
}

function NotFoundComponent(_props: NotFoundRouteProps) {
  const state = useRouterState();
  return (
    <div>
      <i>Warning:</i> Simulated route not found for path{' '}
      <code>{state.location.href}</code>
    </div>
  );
}

const storyPath = '/__story__';
const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent });
const storyRoute = createRoute({
  path: storyPath,
  getParentRoute: () => rootRoute,
  component: RenderStory,
});
rootRoute.addChildren([storyRoute]);

const storyRouter = createRouter({
  history: createMemoryHistory({ initialEntries: [storyPath] }),
  routeTree: rootRoute,
});

function storyRouterDecorator(storyFn: () => ReactNode) {
  return (
    <CurrentStoryContext.Provider value={storyFn}>
      {/* biome-ignore lint/suspicious/noExplicitAny: story memory router instance */}
      <RouterProvider router={storyRouter as any} />
    </CurrentStoryContext.Provider>
  );
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    storyRouterDecorator,
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
};

export default preview;
