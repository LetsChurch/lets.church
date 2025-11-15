/* eslint-disable react-refresh/only-export-components */

import type { Preview, } from '@storybook/react-vite'
import '@fontsource-variable/inter';
import '@fontsource-variable/roboto-mono';
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
  type NotFoundRouteProps,
} from '@tanstack/react-router'
import { createContext, useContext, type ReactNode } from 'react'
import '../src/app.css'

//#region Dummy story router
function RenderStory() {
  const storyFn = useContext(CurrentStoryContext);

  if (!storyFn) {
    throw new Error("Storybook root not found");
  }

  return storyFn();
}

export const CurrentStoryContext = createContext<(() => ReactNode) | undefined>(undefined);

function NotFoundComponent(_props: NotFoundRouteProps) {
  const state = useRouterState();

  return (
    <div>
      <i>Warning:</i> Simulated route not found for path <code>{state.location.href}</code>
    </div>
  );
}

const storyPath = "/__story__";

const storyRoute = createRoute({
  path: storyPath,
  getParentRoute: () => rootRoute,
  component: RenderStory,
});

const rootRoute = createRootRoute({
  notFoundComponent: NotFoundComponent,
});

rootRoute.addChildren([storyRoute]);

export const storyRouter = createRouter({
  history: createMemoryHistory({ initialEntries: [storyPath] }),
  routeTree: rootRoute,
});

//#endregion

export function storyRouterDecorator(storyFn: () => ReactNode) {
  return (
    <CurrentStoryContext.Provider value={storyFn}>
      <RouterProvider router={storyRouter} />
    </CurrentStoryContext.Provider>
  );
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  decorators: [
    storyRouterDecorator,
    withThemeByDataAttribute({
      themes: {
        light: 'light',
        dark: 'dark',
      },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
    }),
  ],
};

if (typeof document !== 'undefined') {
  document.body.classList.add('bg-page');
}

export default preview;
