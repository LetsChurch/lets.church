import { Link } from '@tanstack/react-router';
import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
} from 'react';

export interface BackNavigationConfig {
  label: string;
  to: string; // The path to navigate back to
}

const BackNavigationContext = createContext<{
  config: BackNavigationConfig | null;
  setConfig: (config: BackNavigationConfig | null) => void;
}>({
  config: null,
  setConfig: () => {},
});

interface BackNavigationProviderProps {
  children: ReactNode;
}

export function BackNavigationProvider({
  children,
}: BackNavigationProviderProps) {
  const [config, setConfig] = React.useState<BackNavigationConfig | null>(null);

  return (
    <BackNavigationContext.Provider value={{ config, setConfig }}>
      {children}
    </BackNavigationContext.Provider>
  );
}

export function useBackNavigation() {
  return useContext(BackNavigationContext);
}

export function useSetBackNavigation(label: string, to: string) {
  const { setConfig } = useBackNavigation();

  useEffect(() => {
    setConfig({ label, to });
    return () => setConfig(null);
  }, [label, to, setConfig]);
}

export function BackButton() {
  const { config } = useBackNavigation();

  if (!config) {
    return null;
  }

  return (
    <Link
      to={config.to}
      style={{
        textDecoration: 'none',
        color: 'var(--mantine-color-gray-6)',
        fontSize: '14px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      ← {config.label}
    </Link>
  );
}
