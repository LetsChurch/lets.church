import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { ChurchesView } from '@/components/churches-view';
import {
  parseChurchesLocation,
  parseChurchesOrganization,
  parseChurchesTags,
} from '@/util/churches-search';

// Search params schema for TanStack Router
const churchesSearchSchema = z.object({
  center: z.string().optional(),
  range: z.string().optional(),
  organization: z.string().optional(),
  tag: z.string().optional(),
  hidden: z.string().optional(),
});

export const Route = createFileRoute('/embed/churches')({
  validateSearch: (search) => churchesSearchSchema.parse(search),
  component: RouteComponent,
});

function useParsedLocation() {
  return parseChurchesLocation(Route.useSearch());
}

function useParsedOrganization() {
  return parseChurchesOrganization(Route.useSearch());
}

function useParsedTags() {
  return parseChurchesTags(Route.useSearch());
}

// Combined hook that returns all parsed filters
function useParsedFilters() {
  const location = useParsedLocation();
  const organization = useParsedOrganization();
  const tags = useParsedTags();

  return {
    ...location,
    ...organization,
    ...tags,
  };
}

function RouteComponent() {
  const search = Route.useSearch();
  const filters = useParsedFilters();
  const navigate = useNavigate({ from: '/embed/churches' });

  const hideOrganization = search.hidden === 'organization';

  const handleNavigate = (params: {
    center?: string;
    organization?: string;
    tag?: string;
  }) => {
    navigate({
      to: '/embed/churches',
      search: { ...params, hidden: search.hidden },
      replace: true,
    });
  };

  return (
    <ChurchesView
      filters={filters}
      onNavigate={handleNavigate}
      openLinksInNewTab
      isEmbed
      hideOrganization={hideOrganization}
    />
  );
}
