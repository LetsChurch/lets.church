import { Button, Group, Radio, Stack, Text } from '@mantine/core';
import { useAppMantineForm } from '@/components/mantine';

type ChannelFormData = {
  name: string;
  slug: string;
  description: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
};

type ChannelFormProps = {
  mode: 'create' | 'edit';
  defaultValues: ChannelFormData;
  onSubmit: (data: ChannelFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
};

export function ChannelForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onCancel,
}: ChannelFormProps) {
  const form = useAppMantineForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      method="post"
    >
      <Stack gap="md">
        <form.AppField name="name">
          {(field) => (
            <field.TextInputField
              label="Channel Name (required)"
              placeholder="Enter channel name"
              required
            />
          )}
        </form.AppField>

        <form.AppField name="slug">
          {(field) => (
            <Stack gap="xs">
              <field.TextInputField
                label="Channel Slug (required)"
                placeholder="channel-slug"
                required
              />
              <Text size="xs" c="dimmed">
                This creates your channel's web address. You can use letters,
                numbers, dashes (-), and underscores (_). For example:
                "first-baptist" or "pastor_john"
              </Text>
            </Stack>
          )}
        </form.AppField>

        <form.AppField name="description">
          {(field) => (
            <field.TextareaField
              label="Description"
              placeholder={
                mode === 'create'
                  ? 'Describe your channel'
                  : 'Describe your channel'
              }
              minRows={4}
              maxRows={8}
              autosize
            />
          )}
        </form.AppField>

        <Stack gap="md">
          <Text fw={500} size="sm">
            Visibility
          </Text>
          <form.AppField name="visibility">
            {(field) => (
              <field.RadioGroupField>
                <Stack gap="sm">
                  <Radio
                    value="PUBLIC"
                    label={
                      <div>
                        <Text fw={500}>Public</Text>
                        <Text size="xs" c="dimmed">
                          Anyone can discover and view your channel
                        </Text>
                      </div>
                    }
                  />
                  <Radio
                    value="PRIVATE"
                    label={
                      <div>
                        <Text fw={500}>Private</Text>
                        <Text size="xs" c="dimmed">
                          Only channel members can view content
                        </Text>
                      </div>
                    }
                  />
                  <Radio
                    value="UNLISTED"
                    label={
                      <div>
                        <Text fw={500}>Unlisted</Text>
                        <Text size="xs" c="dimmed">
                          Not discoverable, but accessible with a link
                        </Text>
                      </div>
                    }
                  />
                </Stack>
              </field.RadioGroupField>
            )}
          </form.AppField>
        </Stack>

        <Group justify="flex-end" mt="md">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {mode === 'edit' && (
            <form.Subscribe selector={(state) => state.isDirty}>
              {(isDirty) => (
                <Button
                  variant="outline"
                  disabled={!isDirty}
                  onClick={() => form.reset()}
                >
                  Reset
                </Button>
              )}
            </form.Subscribe>
          )}
          {mode === 'edit' ? (
            <form.Subscribe
              selector={(state) => ({
                isDirty: state.isDirty,
                isValid: state.isValid,
              })}
            >
              {({ isDirty, isValid }) => (
                <Button
                  type="submit"
                  disabled={!isDirty || !isValid}
                  loading={isSubmitting}
                >
                  {submitLabel}
                </Button>
              )}
            </form.Subscribe>
          ) : (
            <form.Subscribe selector={(state) => state.isValid}>
              {(isValid) => (
                <Button
                  type="submit"
                  loading={isSubmitting}
                  disabled={!isValid}
                >
                  {submitLabel}
                </Button>
              )}
            </form.Subscribe>
          )}
        </Group>
      </Stack>
    </form>
  );
}
