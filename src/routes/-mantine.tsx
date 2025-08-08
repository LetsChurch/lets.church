import '@mantine/core/styles.css';
import {
  createTheme,
  type MantineColorsTuple,
  MantineProvider,
} from '@mantine/core';
import type { PropsWithChildren } from 'react';

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

export function MantineWrapper({ children }: PropsWithChildren) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>;
}
