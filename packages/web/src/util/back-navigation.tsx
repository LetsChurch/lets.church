import { Link, useMatches } from '@tanstack/react-router';

export type BackNavigationConfig = {
  label: string;
  to: string;
};

type LoaderDataWithBackNavigation = {
  backNavigation?: BackNavigationConfig;
};

export function BackButton() {
  const matches = useMatches();

  const currentMatch = matches[matches.length - 1];
  const loaderData = currentMatch?.loaderData as
    | LoaderDataWithBackNavigation
    | undefined;
  const backNavigation = loaderData?.backNavigation;

  if (!backNavigation) {
    return null;
  }

  return (
    <Link
      to={backNavigation.to}
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
      ← {backNavigation.label}
    </Link>
  );
}
