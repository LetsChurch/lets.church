import { Combobox, InputBase, useCombobox } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

type SearchItem = {
  id: string;
  label: string;
  description?: string;
  route: string;
  keywords: string[];
  group: string;
};

const searchItems: SearchItem[] = [
  // Main sections
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Main dashboard overview',
    route: '/dashboard',
    keywords: ['dashboard', 'home', 'overview'],
    group: 'Main',
  },

  // Account pages
  {
    id: 'account',
    label: 'Account',
    description: 'Account settings and profile',
    route: '/dashboard/account',
    keywords: ['account', 'settings', 'profile'],
    group: 'Account',
  },
  {
    id: 'account-profile',
    label: 'Profile',
    description: 'Edit your profile information',
    route: '/dashboard/account/profile',
    keywords: ['profile', 'account', 'personal', 'info'],
    group: 'Account',
  },
  {
    id: 'account-security',
    label: 'Security',
    description: 'Security settings and password',
    route: '/dashboard/account/security',
    keywords: ['security', 'password', 'auth', 'authentication'],
    group: 'Account',
  },

  // Content management
  {
    id: 'channels',
    label: 'Channels',
    description: 'Manage your channels',
    route: '/dashboard/channels',
    keywords: ['channels', 'content', 'videos'],
    group: 'Content',
  },
  {
    id: 'channels-new',
    label: 'New Channel',
    description: 'Create a new channel',
    route: '/dashboard/channels/new',
    keywords: ['new', 'create', 'channel', 'add'],
    group: 'Content',
  },

  // Organizations
  {
    id: 'churches',
    label: 'Churches',
    description: 'Manage churches',
    route: '/dashboard/churches',
    keywords: ['churches', 'congregations'],
    group: 'Organizations',
  },
  {
    id: 'churches-new',
    label: 'New Church',
    description: 'Create a new church',
    route: '/dashboard/churches/new',
    keywords: ['new', 'create', 'church', 'add'],
    group: 'Organizations',
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description: 'Manage organizations',
    route: '/dashboard/organizations',
    keywords: ['organizations', 'groups'],
    group: 'Organizations',
  },

  // Admin functions
  {
    id: 'admin',
    label: 'Admin Dashboard',
    description: 'Administrative functions',
    route: '/dashboard/admin',
    keywords: ['admin', 'administration', 'management'],
    group: 'Admin',
  },
  {
    id: 'admin-channels',
    label: 'Channels',
    description: 'Manage all channels and approvals',
    route: '/dashboard/admin/channels',
    keywords: ['channels', 'approvals', 'review', 'admin', 'manage'],
    group: 'Admin',
  },
  {
    id: 'admin-organization-approvals',
    label: 'Organization Approvals',
    description: 'Review organization approval requests',
    route: '/dashboard/admin/organization-approvals',
    keywords: ['approvals', 'organization', 'review', 'admin'],
    group: 'Admin',
  },
  {
    id: 'admin-organization-tags',
    label: 'Organization Tags',
    description: 'Manage organization tags',
    route: '/dashboard/admin/organization-tags',
    keywords: ['tags', 'organization', 'admin', 'labels'],
    group: 'Admin',
  },
];

type DashboardSearchBarProps = {
  placeholder?: string;
  currentUser?: { role: string } | null;
};

export function DashboardSearchBar({
  placeholder = 'Search pages...',
  currentUser,
}: DashboardSearchBarProps) {
  const navigate = useNavigate();
  const combobox = useCombobox();
  const [value, setValue] = useState('');

  // Filter items based on user permissions first
  const accessibleItems = searchItems.filter((item) => {
    // Admin-only pages
    if (item.id.startsWith('admin')) {
      return currentUser?.role === 'ADMIN';
    }
    // All other pages are accessible to all authenticated users
    return true;
  });

  const filteredItems = accessibleItems.filter((item) => {
    const searchTerm = value.toLowerCase();
    return (
      item.label.toLowerCase().includes(searchTerm) ||
      item.description?.toLowerCase().includes(searchTerm) ||
      item.keywords.some((keyword) =>
        keyword.toLowerCase().includes(searchTerm),
      )
    );
  });

  // Group filtered items by their group property
  const groupedItems = filteredItems.reduce(
    (acc, item) => {
      if (!acc[item.group]) {
        acc[item.group] = [];
      }
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<string, SearchItem[]>,
  );

  const handleItemSelect = (item: SearchItem) => {
    navigate({ to: item.route });
    setValue('');
    combobox.closeDropdown();
  };

  // Create grouped options with headers
  const options = Object.entries(groupedItems).map(([groupName, items]) => (
    <div key={groupName}>
      <Combobox.Header
        style={{
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--mantine-color-dimmed)',
          marginTop: groupName !== Object.keys(groupedItems)[0] ? '0.5rem' : 0,
        }}
      >
        {groupName}
      </Combobox.Header>
      {items.map((item) => (
        <Combobox.Option value={item.id} key={item.id}>
          <div>
            <div style={{ fontWeight: 500 }}>{item.label}</div>
            {item.description && (
              <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                {item.description}
              </div>
            )}
          </div>
        </Combobox.Option>
      ))}
    </div>
  ));

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(optionValue) => {
        const item = searchItems.find((item) => item.id === optionValue);
        if (item) {
          handleItemSelect(item);
        }
      }}
    >
      <Combobox.Target>
        <InputBase
          leftSection={<IconSearch size={16} />}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          rightSectionPointerEvents="none"
          styles={{
            input: {
              minWidth: 350,
              width: '100%',
            },
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {options.length > 0 ? (
            options
          ) : (
            <Combobox.Empty>No pages found</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
