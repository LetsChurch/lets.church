import { Autocomplete } from '@base-ui/react/autocomplete';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { controlClasses } from '@/components/ui/input';
import { cn } from '@/util/cn';

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
  };

  const groupNames = Object.keys(groupedItems);

  return (
    <Autocomplete.Root
      items={filteredItems}
      value={value}
      onValueChange={setValue}
      mode="none"
      itemToStringValue={(item: SearchItem) => item.label}
    >
      <div className="relative">
        <span className="text-muted pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <IconSearch size={16} />
        </span>
        <Autocomplete.Input
          placeholder={placeholder}
          className={cn(controlClasses(false), 'pl-9')}
        />
      </div>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="z-50">
          <Autocomplete.Popup className="border-fancy-pants max-h-100 w-[var(--anchor-width)] min-w-[350px] overflow-y-auto rounded-lg bg-white p-1 shadow-lg dark:bg-zinc-900">
            <Autocomplete.Empty className="text-secondary px-3 py-2 text-sm empty:hidden">
              No pages found
            </Autocomplete.Empty>
            <Autocomplete.List>
              {groupNames.map((groupName, index) => (
                <div key={groupName} className={index > 0 ? 'mt-2' : undefined}>
                  <div className="text-secondary px-3 pt-1 pb-1 text-xs font-semibold tracking-wide uppercase">
                    {groupName}
                  </div>
                  {groupedItems[groupName].map((item) => (
                    <Autocomplete.Item
                      key={item.id}
                      value={item}
                      onClick={() => handleItemSelect(item)}
                      className="data-[highlighted]:bg-brand/10 cursor-default rounded px-3 py-1.5"
                    >
                      <div className="text-primary text-sm font-medium">
                        {item.label}
                      </div>
                      {item.description ? (
                        <div className="text-secondary text-xs">
                          {item.description}
                        </div>
                      ) : null}
                    </Autocomplete.Item>
                  ))}
                </div>
              ))}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
