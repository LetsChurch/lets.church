/* eslint-disable react-refresh/only-export-components */

import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '@fontsource-variable/inter';
import type { Preview } from '@storybook/react-vite';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
  type NotFoundRouteProps,
} from '@tanstack/react-router';
import { createContext, useContext, type ReactNode } from 'react';

import '../src/app.css';

type ConsoleErrorCapture = {
  calls: unknown[][];
  original: typeof console.error;
  replacement: typeof console.error;
};

let consoleErrorCapture: ConsoleErrorCapture | undefined;

function formatConsoleValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function captureConsoleErrors() {
  const calls: unknown[][] = [];
  const original = console.error;
  const replacement: typeof console.error = (...args) => {
    calls.push(args);
    original(...args);
  };

  consoleErrorCapture = { calls, original, replacement };
  console.error = replacement;

  return () => {
    if (console.error === replacement) {
      console.error = original;
    }
    if (consoleErrorCapture?.replacement === replacement) {
      consoleErrorCapture = undefined;
    }
  };
}

function failOnConsoleErrors() {
  const calls = consoleErrorCapture?.calls ?? [];
  if (calls.length === 0) {
    return;
  }

  const messages = calls.map((args) => args.map(formatConsoleValue).join(' '));
  throw new Error(`Unexpected console.error:\n${messages.join('\n')}`);
}

//#region Dummy story router
function RenderStory() {
  const storyFn = useContext(CurrentStoryContext);

  if (!storyFn) {
    throw new Error('Storybook root not found');
  }

  return storyFn();
}

export const CurrentStoryContext = createContext<(() => ReactNode) | undefined>(
  undefined,
);

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
  beforeEach: captureConsoleErrors,
  afterEach: failOnConsoleErrors,
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
      test: 'todo',
    },
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
