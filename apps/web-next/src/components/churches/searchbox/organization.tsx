import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { gql } from 'graphql-request';
import { Optional, cn } from '../../../util';
import ListHeading from './list-heading';
import ResultRow from './result-row';
import { getMenuColorClass, optionId } from './util';
import {
  MinistriesQueryQuery,
  MinistriesQueryQueryVariables,
  OrganizationByIdQuery,
  OrganizationByIdQueryVariables,
} from './__generated__/organization';
import { getAuthenticatedClient } from '~/util/gql/server';

export const organizationSlug = 'organization';

async function fetchOrganizationSuggestions(query: string) {
  'use server';
  const client = await getAuthenticatedClient();

  const data = await client.request<
    MinistriesQueryQuery,
    MinistriesQueryQueryVariables
  >(
    gql`
      query MinistriesQuery($query: String!) {
        search(focus: ORGANIZATIONS, query: $query, orgType: MINISTRY) {
          edges {
            organization: node {
              ... on OrganizationSearchHit {
                id
                name
              }
            }
          }
        }
      }
    `,
    { query },
  );

  // TODO: better type safety
  return data.search.edges as unknown as Array<{
    organization: Extract<
      MinistriesQueryQuery['search']['edges'][number],
      { __typename?: 'OrganizationSearchHit' }
    >;
  }>;
}

// type SuggestedOrg = Extract<
//   Awaited<
//     ReturnType<typeof fetchOrganizationSuggestions>
//   >[number]['organization'],
//   { __typename?: 'OrganizationSearchHit' }
// >;

type SuggestedOrg = Extract<
  MinistriesQueryQuery['search']['edges'][number]['organization'],
  { __typename?: 'OrganizationSearchHit' }
>;

async function fetchOrganization(id: string) {
  'use server';
  const client = await getAuthenticatedClient();

  const data = await client.request<
    OrganizationByIdQuery,
    OrganizationByIdQueryVariables
  >(
    gql`
      query OrganizationById($id: ShortUuid!) {
        organizationById(id: $id) {
          name
        }
      }
    `,
    { id },
  );

  return data.organizationById;
}

export const useParsedOrganization = () => {
  const [searchParams] = useSearchParams();

  const parsed = createMemo(() => ({
    organization: searchParams[organizationSlug],
  }));

  return parsed;
};

export function organizationState(clearInput: () => unknown) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [organizationLabel, setOrganizationLabel] = createSignal<string | null>(
    null,
  );
  const [organizationSuggestions, setOrganizationSuggestions] =
    createSignal<null | Array<SuggestedOrg>>(null);

  onMount(async () => {
    const orgId = searchParams[organizationSlug];

    if (orgId) {
      const res = await fetchOrganization(orgId);
      setOrganizationLabel(res.name);
    }
  });

  async function loadOrganizationSuggestions(q: string) {
    if (organizationLabel()) {
      return;
    }

    const data = await fetchOrganizationSuggestions(q);

    setOrganizationSuggestions(data.map((d) => d.organization));
  }

  function clearOrganizationSuggestions() {
    setOrganizationSuggestions(null);
  }

  async function addOrganizationFromSuggestion(organization: SuggestedOrg) {
    setSearchParams({
      organization: organization.id,
    });
    clearOrganizationSuggestions();
    setOrganizationLabel(organization.name);

    clearInput();
  }

  const organizationChiclet = createMemo(() => {
    const orgLab = organizationLabel();

    const orgChiclet = orgLab
      ? [{ color: 'INDIGO' as const, slug: organizationSlug, label: orgLab }]
      : [];

    return orgChiclet;
  });

  return {
    organizationLabel,
    setOrganizationLabel,
    organizationChiclet,
    organizationSuggestions,
    fetchOrganizationSuggestions: loadOrganizationSuggestions,
    clearOrganizationSuggestions,
    addOrganizationFromSuggestion,
  };
}

export function OrganizationMenu(props: {
  organizationSuggestions: null | Array<SuggestedOrg>;
  addOrganizationFromSuggestion: (suggestion: SuggestedOrg) => unknown;
  optionPrefix: string;
  activeOptionId?: Optional<string>;
}) {
  return (
    <Show when={(props.organizationSuggestions?.length ?? 0) > 0}>
      <li>
        <ListHeading>Associated Organizations</ListHeading>
        <ul class="text-sm text-gray-700">
          <For each={props.organizationSuggestions ?? []}>
            {(suggestion, i) => (
              <ResultRow
                id={optionId(props.optionPrefix, organizationSlug, i())}
                activeId={props.activeOptionId}
                onClick={() => props.addOrganizationFromSuggestion(suggestion)}
              >
                <div
                  class={cn(
                    'ml-2 size-2 rounded-full',
                    getMenuColorClass('INDIGO'),
                  )}
                  role="presentation"
                />
                <span class="flex-auto truncate pl-2">{suggestion.name}</span>
              </ResultRow>
            )}
          </For>
        </ul>
      </li>
    </Show>
  );
}
