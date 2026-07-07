import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { ChurchesView } from '@/components/churches-view';
import Header from '@/components/header';
import {
  parseChurchesLocation,
  parseChurchesOrganization,
  parseChurchesTags,
} from '@/util/churches-search';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/util/image-sizes';

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
  head: () => {
    const title = "Find Churches - Let's Church";
    const description =
      "Discover churches near you on Let's Church. Browse by location, denomination, and tags to find a church community that fits your needs.";
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : 'https://lets.church/churches';

    return {
      meta: [
        // Basic meta tags
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        // OpenGraph tags
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: 'https://lets.church/og-image.png',
        },
        {
          property: 'og:image:width',
          content: OG_IMAGE_WIDTH.toString(),
        },
        {
          property: 'og:image:height',
          content: OG_IMAGE_HEIGHT.toString(),
        },
        {
          property: 'og:site_name',
          content: "Let's Church",
        },
        // Twitter Card tags
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:domain',
          content: 'lets.church',
        },
        {
          property: 'twitter:url',
          content: url,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          name: 'twitter:image',
          content: 'https://lets.church/og-image.png',
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: 'https://lets.church/churches',
        },
      ],
    };
  },
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
