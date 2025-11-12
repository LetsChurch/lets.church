import {
  ActionIcon,
  Autocomplete,
  Badge,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconBuilding, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
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
    organization: org,
  }));

  const { data: selectedOrganizations = [] } = useQuery({
    ...trpc.dashboard.organizations.getOrganizationsByIds.queryOptions({
      organizationIds: value,
    }),
    enabled: value.length > 0,
  });

  const handleAutocompleteSelect = (selectedLabel: string) => {
    const selectedOrg = autocompleteData.find(
      (option) => option.label === selectedLabel,
    );

    if (selectedOrg) {
      onChange([...value, selectedOrg.value]);
    }

    setTimeout(() => {
      setSearchValue('');
    }, 0);
  };

  const handleRemoveOrganization = (orgId: string) => {
    onChange(value.filter((id) => id !== orgId));
  };

  const displayLabel =
    selectedOrganizations.length > 0
      ? `${label} (${selectedOrganizations.length})`
      : label;

  return (
    <Stack gap="xs">
      <Autocomplete
        label={displayLabel}
        placeholder={placeholder}
        description={description}
        error={error}
        data={autocompleteData.map((option) => option.label)}
        value={searchValue}
        onChange={setSearchValue}
        onOptionSubmit={handleAutocompleteSelect}
        leftSection={<IconBuilding size={16} />}
        clearable
        limit={10}
        comboboxProps={{
          transitionProps: { transition: 'pop', duration: 200 },
        }}
      />

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
    </Stack>
  );
}
