import {
  createTheme,
  type MantineColorScheme,
  type MantineColorsTuple,
  MantineProvider,
} from '@mantine/core';
import mantineCoreStyles from '@mantine/core/styles.css?url';
import { ModalsProvider } from '@mantine/modals';
import {
  type NotificationData,
  Notifications,
  notifications,
} from '@mantine/notifications';
import mantineNotificationStyles from '@mantine/notifications/styles.css?url';
import Cookies from 'js-cookie';
import type { PropsWithChildren } from 'react';
import {
  getInitialTheme,
  THEME_CHANGE_EVENT,
  THEME_COOKIE_NAME,
} from '@/stores/theme';

export const mantineStyles = [
  { rel: 'stylesheet', href: mantineCoreStyles },
  { rel: 'stylesheet', href: mantineNotificationStyles },
];

const lc: MantineColorsTuple = [
  'oklch(93% 0.034 272.788)',
  'oklch(87% 0.065 274.039)',
  'oklch(78.5% 0.115 274.713)',
  'oklch(67.3% 0.182 276.935)',
  'oklch(58.5% 0.233 277.117)',
  'oklch(51.1% 0.262 276.966)',
  'oklch(45.7% 0.24 277.023)',
  'oklch(39.8% 0.195 277.366)',
  'oklch(35.9% 0.144 278.697)',
  'oklch(25.7% 0.09 281.288)',
];

const theme = createTheme({
  colors: {
    lc,
  },
  primaryColor: 'lc',
});

let ac = new AbortController();

// Custom color scheme manager that uses cookies
const colorSchemeManager = {
  get: (defaultValue: MantineColorScheme) => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = Cookies.get(THEME_COOKIE_NAME);
    return (stored as MantineColorScheme) || defaultValue;
  },
  set: (value: MantineColorScheme) => {
    if (typeof window !== 'undefined') {
      Cookies.set(THEME_COOKIE_NAME, value);
    }
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      Cookies.remove(THEME_COOKIE_NAME);
    }
  },
  subscribe: (onUpdate: (colorScheme: MantineColorScheme) => void) => {
    if (typeof window === 'undefined') return () => {};

    const handleThemeChange = (
      event: CustomEvent<{ theme: MantineColorScheme }>,
    ) => {
      onUpdate(event.detail.theme);
    };

    window.addEventListener(
      THEME_CHANGE_EVENT,
      handleThemeChange as EventListener,
      ac,
    );
  },
  unsubscribe: () => {
    ac.abort();
    ac = new AbortController();
  },
};

export function MantineWrapper({ children }: PropsWithChildren) {
  const defaultColorScheme = getInitialTheme();

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme={defaultColorScheme}
      colorSchemeManager={colorSchemeManager}
    >
      <ModalsProvider>
        <Notifications />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}

export function showSuccess(data: NotificationData) {
  notifications.show({
    color: 'green',
    position: 'top-right',
    ...data,
  });
}

export function showFailure(data: NotificationData) {
  notifications.show({
    color: 'red',
    position: 'top-right',
    ...data,
  });
}
