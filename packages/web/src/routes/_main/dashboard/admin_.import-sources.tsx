import {
  IconEdit,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { LcMenu, MenuItemButton, OverflowMenu } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  Badge,
  Button,
  Checkbox,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/_main/dashboard/admin_/import-sources')({
  component: ImportSourcesPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        trpc.dashboard.importSources.listAll.queryOptions(),
      ),
      queryClient.ensureQueryData(
        trpc.dashboard.admin.getAllChannels.queryOptions(),
      ),
    ]);
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

type FormData = {
  channelId: string;
  url: string;
  enabled: boolean;
  cronSchedule: string;
  timezone: string;
  earliestImportDate: Date | null;
  deduplicationEnabled: boolean;
  deduplicationFields: ('title' | 'publishedAt' | 'url')[];
  importHistoryText: string;
};

function ImportSourcesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [opened, { open, close }] = useDisclosure(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    channelId: '',
    url: '',
    enabled: true,
    cronSchedule: '0 1 * * *',
    timezone: 'America/New_York',
    earliestImportDate: null,
    deduplicationEnabled: false,
    deduplicationFields: [],
    importHistoryText: '',
  });

  const { data: importSources } = useSuspenseQuery(
    trpc.dashboard.importSources.listAll.queryOptions(),
  );

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getAllChannels.queryOptions(),
  );
  const channels = data.channels;

  const deleteMutation = useMutation(
    trpc.dashboard.importSources.delete.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Import source deleted successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.importSources.listAll.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to delete import source',
          color: 'red',
        });
      },
    }),
  );

  const pauseMutation = useMutation(
    trpc.dashboard.importSources.pause.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Import source paused',
          color: 'blue',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.importSources.listAll.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to pause import source',
          color: 'red',
        });
      },
    }),
  );

  const resumeMutation = useMutation(
    trpc.dashboard.importSources.resume.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Import source resumed',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.importSources.listAll.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to resume import source',
          color: 'red',
        });
      },
    }),
  );

  const triggerManualMutation = useMutation(
    trpc.dashboard.importSources.triggerManual.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Manual import triggered',
          color: 'blue',
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to trigger manual import',
          color: 'red',
        });
      },
    }),
  );

  const createMutation = useMutation(
    trpc.dashboard.importSources.create.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Import source created successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.importSources.listAll.queryKey(),
        });
        close();
        resetForm();
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to create import source',
          color: 'red',
        });
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.dashboard.importSources.update.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Import source updated successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.importSources.listAll.queryKey(),
        });
        close();
        resetForm();
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to update import source',
          color: 'red',
        });
      },
    }),
  );

  const resetForm = () => {
    setFormData({
      channelId: '',
      url: '',
      enabled: true,
      cronSchedule: '0 1 * * *',
      timezone: 'America/New_York',
      earliestImportDate: null,
      deduplicationEnabled: false,
      deduplicationFields: [],
      importHistoryText: '',
    });
    setEditingId(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    open();
  };

  const handleOpenEdit = (source: (typeof importSources)[0]) => {
    setEditingId(source.id);
    setFormData({
      channelId: source.channelId,
      url: source.url,
      enabled: source.enabled,
      cronSchedule: source.cronSchedule,
      timezone: source.timezone,
      earliestImportDate: source.earliestImportDate
        ? new Date(source.earliestImportDate)
        : null,
      deduplicationEnabled: source.deduplicationEnabled,
      deduplicationFields:
        (source.deduplicationFields as ('title' | 'publishedAt' | 'url')[]) ||
        [],
      importHistoryText: '',
    });
    open();
  };

  const handleSubmit = () => {
    // Parse import history if provided
    let importHistory:
      | Array<{
          publishedAt: string;
          source?: string;
          title: string;
          description?: string;
          url: string;
        }>
      | undefined;
    if (!editingId && formData.importHistoryText) {
      try {
        importHistory = JSON.parse(formData.importHistoryText);
        if (!Array.isArray(importHistory)) {
          notifications.show({
            title: 'Error',
            message: 'Import history must be a JSON array',
            color: 'red',
          });
          return;
        }
      } catch (_error) {
        notifications.show({
          title: 'Error',
          message: 'Invalid JSON format',
          color: 'red',
        });
        return;
      }
    }

    const submitData = {
      channelId: formData.channelId,
      url: formData.url,
      enabled: formData.enabled,
      cronSchedule: formData.cronSchedule,
      timezone: formData.timezone,
      earliestImportDate: formData.earliestImportDate || undefined,
      deduplicationEnabled: formData.deduplicationEnabled,
      deduplicationFields: formData.deduplicationFields,
      importHistory,
    };

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: submitData,
      });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getStatusBadge = (status: string, enabled: boolean) => {
    if (!enabled) {
      return <Badge color="gray">Paused</Badge>;
    }

    switch (status) {
      case 'RUNNING':
        return <Badge color="green">Running</Badge>;
      case 'FAILED':
        return <Badge color="red">Failed</Badge>;
      case 'PAUSED':
        return <Badge color="gray">Paused</Badge>;
      case 'NOT_STARTED':
        return <Badge color="yellow">Not Started</Badge>;
      default:
        return <Badge color="gray">{status}</Badge>;
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Title order={2}>Import Sources</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleOpenCreate}
          >
            Create Import Source
          </Button>
        </div>

        <Text c="dimmed">
          Manage automated import sources for channels. Import sources
          periodically scrape and import media from external URLs.
        </Text>

        {importSources.length === 0 ? (
          <Text c="dimmed" ta="center" className="py-8">
            No import sources configured yet.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Channel</Table.Th>
                <Table.Th>URL</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Last Import</Table.Th>
                <Table.Th>Runs</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {importSources.map((source) => (
                <Table.Tr key={source.id}>
                  <Table.Td>
                    <Text fw={500}>{source.channel.name}</Text>
                    <Text size="sm" c="dimmed">
                      {source.channel.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      style={{
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.url}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {getStatusBadge(source.workflowStatus, source.enabled)}
                  </Table.Td>
                  <Table.Td>
                    {source.lastImportedAt
                      ? formatDate(source.lastImportedAt)
                      : 'Never'}
                  </Table.Td>
                  <Table.Td>{source._count.importRuns}</Table.Td>
                  <Table.Td>
                    <OverflowMenu
                      label={`Actions for ${source.channel.name} import source`}
                    >
                      <MenuItemButton
                        icon={<IconUpload size={16} />}
                        onClick={() =>
                          triggerManualMutation.mutate({ id: source.id })
                        }
                      >
                        Trigger Manual Import
                      </MenuItemButton>
                      {source.enabled ? (
                        <MenuItemButton
                          icon={<IconPlayerPause size={16} />}
                          onClick={() =>
                            pauseMutation.mutate({ id: source.id })
                          }
                        >
                          Pause
                        </MenuItemButton>
                      ) : (
                        <MenuItemButton
                          icon={<IconPlayerPlay size={16} />}
                          onClick={() =>
                            resumeMutation.mutate({ id: source.id })
                          }
                        >
                          Resume
                        </MenuItemButton>
                      )}
                      <MenuItemButton
                        icon={<IconEdit size={16} />}
                        onClick={() => handleOpenEdit(source)}
                      >
                        Edit
                      </MenuItemButton>
                      <LcMenu.Separator />
                      <MenuItemButton
                        className="text-red-600 dark:text-red-400"
                        icon={<IconTrash size={16} />}
                        onClick={() => {
                          if (
                            confirm(
                              `Are you sure you want to delete this import source for ${source.channel.name}?`,
                            )
                          ) {
                            deleteMutation.mutate({ id: source.id });
                          }
                        }}
                      >
                        Delete
                      </MenuItemButton>
                    </OverflowMenu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>

      <LcModal.Root
        open={opened}
        onOpenChange={(o) => {
          if (!o) {
            close();
            resetForm();
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="lg">
            <ModalHeader
              title={editingId ? 'Edit Import Source' : 'Create Import Source'}
            />
            <div className="flex flex-col gap-4">
              <Select
                label="Channel"
                placeholder="Select a channel"
                data={channels.map((channel: { id: string; name: string }) => ({
                  value: channel.id,
                  label: channel.name,
                }))}
                value={formData.channelId}
                onChange={(value) =>
                  setFormData({ ...formData, channelId: value || '' })
                }
                required
                disabled={!!editingId}
              />

              <TextInput
                label="URL"
                placeholder="https://example.com/feed.rss"
                value={formData.url}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.currentTarget.value })
                }
                required
              />

              <Checkbox
                label="Enabled"
                checked={formData.enabled}
                onChange={(checked) =>
                  setFormData({ ...formData, enabled: checked })
                }
              />

              <TextInput
                label="Cron Schedule"
                placeholder="0 1 * * *"
                description="Default: Daily at 1am ET"
                value={formData.cronSchedule}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cronSchedule: e.currentTarget.value,
                  })
                }
              />

              <Select
                label="Timezone"
                data={[
                  { value: 'America/New_York', label: 'Eastern Time (ET)' },
                  { value: 'America/Chicago', label: 'Central Time (CT)' },
                  { value: 'America/Denver', label: 'Mountain Time (MT)' },
                  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
                  { value: 'UTC', label: 'UTC' },
                ]}
                value={formData.timezone}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    timezone: value || 'America/New_York',
                  })
                }
              />

              <TextInput
                type="date"
                label="Earliest Import Date"
                placeholder="Optional: Only import media published after this date"
                value={
                  formData.earliestImportDate
                    ? formData.earliestImportDate.toISOString().slice(0, 10)
                    : ''
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    earliestImportDate: e.currentTarget.value
                      ? new Date(e.currentTarget.value)
                      : null,
                  })
                }
              />

              {!editingId ? (
                <Textarea
                  label="Import History (Optional)"
                  placeholder='[{"publishedAt": "2021-02-27", "title": "...", "url": "..."}]'
                  description="Paste a JSON array of historical media items to import immediately. The earliest date will be automatically set."
                  value={formData.importHistoryText}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      importHistoryText: e.currentTarget.value,
                    })
                  }
                  minRows={3}
                  maxRows={8}
                />
              ) : null}

              <Checkbox
                label="Enable Deduplication"
                checked={formData.deduplicationEnabled}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    deduplicationEnabled: checked,
                  })
                }
              />

              {formData.deduplicationEnabled ? (
                <div className="flex flex-col gap-2.5">
                  <Text size="sm" fw={500}>
                    Deduplication Fields
                  </Text>
                  <Text size="xs" c="dimmed">
                    Fields to check for duplicate media
                  </Text>
                  <div className="flex flex-wrap items-center justify-start gap-4">
                    <Checkbox
                      label="Title"
                      checked={formData.deduplicationFields.includes('title')}
                      onChange={(checked) => {
                        const fields = checked
                          ? [...formData.deduplicationFields, 'title' as const]
                          : formData.deduplicationFields.filter(
                              (f) => f !== 'title',
                            );
                        setFormData({
                          ...formData,
                          deduplicationFields: fields,
                        });
                      }}
                    />
                    <Checkbox
                      label="Published Date"
                      checked={formData.deduplicationFields.includes(
                        'publishedAt',
                      )}
                      onChange={(checked) => {
                        const fields = checked
                          ? [
                              ...formData.deduplicationFields,
                              'publishedAt' as const,
                            ]
                          : formData.deduplicationFields.filter(
                              (f) => f !== 'publishedAt',
                            );
                        setFormData({
                          ...formData,
                          deduplicationFields: fields,
                        });
                      }}
                    />
                    <Checkbox
                      label="URL"
                      checked={formData.deduplicationFields.includes('url')}
                      onChange={(checked) => {
                        const fields = checked
                          ? [...formData.deduplicationFields, 'url' as const]
                          : formData.deduplicationFields.filter(
                              (f) => f !== 'url',
                            );
                        setFormData({
                          ...formData,
                          deduplicationFields: fields,
                        });
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <Button
                  variant="subtle"
                  onClick={() => {
                    close();
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  loading={createMutation.isPending || updateMutation.isPending}
                  disabled={!formData.channelId || !formData.url}
                >
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
