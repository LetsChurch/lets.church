import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ChurchesView } from '@/components/churches-view';
import Header from '@/components/header';
import {
  DEFAULT_NEARBY_RANGE,
  DEFAULT_RANGE,
  MURICA,
} from '@/constants/churches';

// Search params schema for TanStack Router
const churchesSearchSchema = z.object({
  center: z.string().optional(),
  range: z.string().optional(),
  organization: z.string().optional(),
  tag: z.string().optional(),
});

export const Route = createFileRoute('/_main/churches')({
  validateSearch: (search) => churchesSearchSchema.parse(search),
  component: RouteComponent,
});

// Hook to parse location from search params
function useParsedLocation() {
  const search = Route.useSearch();

  return {
    range:
      search.range ?? (search.center ? DEFAULT_NEARBY_RANGE : DEFAULT_RANGE),
    center:
      (search.center
        ?.split(',')
        .map((v) => parseFloat(v))
        .slice(0, 2) as [number, number] | undefined) ?? MURICA,
  };
}

// Hook to parse organization from search params
function useParsedOrganization() {
  const search = Route.useSearch();

  return {
    organizationSlug: search.organization ?? null,
  };
}

// Hook to parse tags from search params
function useParsedTags() {
  const search = Route.useSearch();

  return {
    tags: search.tag?.split(',').filter(Boolean) ?? [],
  };
}

// Combined hook that returns all parsed filters
export function useParsedFilters() {
  const location = useParsedLocation();
  const organization = useParsedOrganization();
  const tags = useParsedTags();

  return {
    ...location,
    ...organization,
    ...tags,
  };
}

export type ParsedFilters = ReturnType<typeof useParsedFilters>;

function RouteComponent() {
  const filters = useParsedFilters();
  const navigate = useNavigate({ from: '/churches' });

  const handleNavigate = (params: {
    center?: string;
    organization?: string;
    tag?: string;
  }) => {
    navigate({
      to: '/churches',
      search: params,
      replace: true,
    });
  };

  return (
    <>
      <Header mode="fab" />
      <ChurchesView filters={filters} onNavigate={handleNavigate} />
    </>
  );
}
