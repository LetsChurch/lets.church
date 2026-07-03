import { Autocomplete } from '@base-ui/react/autocomplete';
import { IconBuilding, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { ActionIcon, Badge, Table, Text } from '@/components/ui';
import { controlClasses, InputWrapper } from '@/components/ui/input';
import { useTRPC } from '@/trpc/react';

type OrganizationAutocompleteProps = {
  label?: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
  excludeChurchTypes?: boolean;
  error?: string;
  description?: string;
  associatedOrganizationsWithStatus?: Array<{
    organizationId: string;
    upstreamApproved: boolean;
  }>;
};

export function OrganizationAutocomplete({
  label = 'Associated Organizations',
  placeholder = 'Search organizations to add...',
  value = [],
  onChange,
  excludeChurchTypes = false,
  error,
  description,
  associatedOrganizationsWithStatus = [],
}: OrganizationAutocompleteProps) {
  const trpc = useTRPC();
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue] = useDebounce(searchValue, 200);

  const { data: searchData = [] } = useQuery({
    ...trpc.dashboard.organizations.searchOrganizations.queryOptions({
      query: debouncedSearchValue,
      excludeChurchTypes,
      limit: 10,
    }),
    enabled: debouncedSearchValue.length >= 2,
  });

  // Filter out already selected organizations from search results
  const availableOrganizations = searchData.filter(
    (org) => !value.includes(org.id),
  );

  const autocompleteData = availableOrganizations.map((org) => ({
    value: org.id,
    label: org.name,
  }));

  const { data: selectedOrganizations = [] } = useQuery({
    ...trpc.dashboard.organizations.getOrganizationsByIds.queryOptions({
      organizationIds: value,
    }),
    enabled: value.length > 0,
  });

  const handleSelect = (orgId: string) => {
    if (!value.includes(orgId)) {
      onChange([...value, orgId]);
    }
    setTimeout(() => setSearchValue(''), 0);
  };

  const handleRemoveOrganization = (orgId: string) => {
    onChange(value.filter((id) => id !== orgId));
  };

  const displayLabel =
    selectedOrganizations.length > 0
      ? `${label} (${selectedOrganizations.length})`
      : label;

  return (
    <div className="flex flex-col gap-2.5">
      <InputWrapper
        label={displayLabel}
        description={description}
        error={error}
      >
        <Autocomplete.Root
          items={autocompleteData}
          value={searchValue}
          onValueChange={setSearchValue}
          mode="none"
          itemToStringValue={(item: { value: string; label: string }) =>
            item.label
          }
        >
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              <IconBuilding size={16} />
            </span>
            <Autocomplete.Input
              placeholder={placeholder}
              className={cnInput(Boolean(error))}
            />
          </div>
          <Autocomplete.Portal>
            <Autocomplete.Positioner sideOffset={4} className="z-50">
              <Autocomplete.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border-fancy-pants bg-white p-1 shadow-lg dark:bg-zinc-900">
                <Autocomplete.Empty className="px-3 py-2 text-secondary text-sm empty:hidden">
                  {debouncedSearchValue.length >= 2
                    ? 'No organizations found'
                    : 'Type to search…'}
                </Autocomplete.Empty>
                <Autocomplete.List>
                  {(item: { value: string; label: string }) => (
                    <Autocomplete.Item
                      key={item.value}
                      value={item}
                      onClick={() => handleSelect(item.value)}
                      className="cursor-default rounded px-3 py-1.5 text-primary text-sm data-[highlighted]:bg-brand/10"
                    >
                      {item.label}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      </InputWrapper>

      {selectedOrganizations.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Organization</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selectedOrganizations.map((org) => {
              const associationStatus = associatedOrganizationsWithStatus.find(
                (assoc) => assoc.organizationId === org.id,
              );
              const isApproved = associationStatus?.upstreamApproved ?? false;

              return (
                <Table.Tr key={org.id}>
                  <Table.Td>
                    <Text fw={500}>{org.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="blue" variant="light" size="sm">
                      {org.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={isApproved ? 'green' : 'yellow'}
                      variant="light"
                      size="sm"
                    >
                      {isApproved ? 'Approved' : 'Pending'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="light"
                      size="sm"
                      onClick={() => handleRemoveOrganization(org.id)}
                      aria-label={`Remove ${org.name}`}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}

function cnInput(error: boolean) {
  return `${controlClasses(error)} pl-9`;
}
