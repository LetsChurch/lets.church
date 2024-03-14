import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { array, object, parse, string, type Input } from 'valibot';
import { pushQueryParams, query } from '../../../util/history';
import { cn } from '../../../util';
import ListHeading from './list-heading';
import ResultRow from './result-row';
import { getMenuColorClass } from './util';

const fetchOrgSchema = object({ name: string() });

async function fetchOrg(id: string) {
  const res = await fetch(`/organizations?${new URLSearchParams({ id })}`, {
    headers: { accept: 'application/json' },
  });

  return parse(fetchOrgSchema, await res.json());
}

export const parsedOrganization = createMemo(() => {
  const q = query();

  return {
    organization: q.get('organization'),
  };
});

const suggestedOrgSchema = object({
  organization: object({ id: string(), name: string() }),
});

const orgSuggestSchema = array(suggestedOrgSchema);

export function organizationState(clearInput: () => unknown) {
  const [organizationLabel, setOrganizationLabel] = createSignal<string | null>(
    null,
  );
  const [organizationSuggestions, setOrganizationSuggestions] =
    createSignal<null | Input<typeof orgSuggestSchema>>(null);

  onMount(async () => {
    const q = query();
    const orgId = q.get('organization');

    if (orgId) {
      const res = await fetchOrg(orgId);
      setOrganizationLabel(res.name);
    }
  });

  async function fetchOrganizationSuggestions(q: string) {
    if (organizationLabel()) {
      return;
    }

    const res = await fetch(`/organizations?${new URLSearchParams({ q })}`, {
      headers: { accept: 'application/json' },
    });

    const data = await res.json();

    setOrganizationSuggestions(parse(orgSuggestSchema, data));
  }

  function clearOrganizationSuggestions() {
    setOrganizationSuggestions(null);
  }

  async function addOrganizationFromSuggestion({
    organization,
  }: Input<typeof suggestedOrgSchema>) {
    pushQueryParams({
      organization: organization.id,
    });
    clearOrganizationSuggestions();
    setOrganizationLabel(organization.name);

    clearInput();
  }

  const organizationChiclet = createMemo(() => {
    const orgLab = organizationLabel();

    const orgChiclet = orgLab
      ? [{ color: 'INDIGO' as const, slug: 'organization', label: orgLab }]
      : [];

    return orgChiclet;
  });

  return {
    organizationLabel,
    setOrganizationLabel,
    organizationChiclet,
    organizationSuggestions,
    fetchOrganizationSuggestions,
    clearOrganizationSuggestions,
    addOrganizationFromSuggestion,
  };
}

export function OrganizationMenu(props: {
  organizationSuggestions: null | Input<typeof orgSuggestSchema>;
  addOrganizationFromSuggestion: (
    suggestion: Input<typeof suggestedOrgSchema>,
  ) => unknown;
}) {
  return (
    <Show when={(props.organizationSuggestions?.length ?? 0) > 0}>
      <li>
        <ListHeading>Associated Organizations</ListHeading>
        <ul class="text-sm text-gray-700">
          <For each={props.organizationSuggestions ?? []}>
            {(suggestion) => (
              <ResultRow
                onClick={[props.addOrganizationFromSuggestion, suggestion]}
              >
                <div
                  class={cn(
                    'ml-2 size-2 rounded-full',
                    getMenuColorClass('INDIGO'),
                  )}
                  role="presentation"
                />
                <span class="flex-auto truncate pl-2">
                  {suggestion.organization.name}
                </span>
              </ResultRow>
            )}
          </For>
        </ul>
      </li>
    </Show>
  );
}
