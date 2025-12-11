import { Box, Button, Grid, Group, Stack, Text } from '@mantine/core';
import { AddressAutocomplete } from './address-autocomplete';

type AddressFieldsProps = {
  // biome-ignore lint/suspicious/noExplicitAny: Form API is complex and component needs to accept any form instance
  form: any;
};

export function AddressFields({ form }: AddressFieldsProps) {
  return (
    <form.AppField name="addresses" mode="array">
      {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
      {(addressesField: any) => (
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={500} size="sm">
              Addresses
            </Text>
            <Button
              type="button"
              size="xs"
              variant="light"
              onClick={() =>
                addressesField.pushValue({
                  type: 'MEETING',
                  name: null,
                  streetAddress: null,
                  locality: null,
                  region: null,
                  postalCode: null,
                  country: null,
                  postOfficeBoxNumber: null,
                })
              }
            >
              Add Address
            </Button>
          </Group>
          {addressesField.state.value.length === 0 ? (
            <Text size="sm" c="dimmed">
              No addresses added yet
            </Text>
          ) : (
            <Stack gap="md">
              {/* biome-ignore lint/suspicious/noExplicitAny: Address type is determined by form data */}
              {addressesField.state.value.map((address: any, index: number) => (
                <Box
                  key={`address-${address.type}-${index}`}
                  p="md"
                  style={{
                    border: '1px solid var(--mantine-color-gray-3)',
                    borderRadius: 'var(--mantine-radius-md)',
                  }}
                >
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={500} size="sm">
                        Address {index + 1}
                      </Text>
                      <Button
                        type="button"
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => addressesField.removeValue(index)}
                      >
                        Remove
                      </Button>
                    </Group>

                    <Grid gutter="xs">
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].type`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.SelectField
                              label="Address Type"
                              data={[
                                {
                                  value: 'MAILING',
                                  label: 'Mailing',
                                },
                                {
                                  value: 'MEETING',
                                  label: 'Meeting',
                                },
                                {
                                  value: 'OFFICE',
                                  label: 'Office',
                                },
                                { value: 'OTHER', label: 'Other' },
                              ]}
                              required
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].name`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Name"
                              placeholder="e.g., Main Office"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <form.AppField
                          name={`addresses[${index}].streetAddress`}
                        >
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <AddressAutocomplete
                              label="Street Address"
                              placeholder="Start typing an address..."
                              value={field.state.value || ''}
                              onChange={(value) => field.handleChange(value)}
                              onAddressSelect={(address) => {
                                // Update all address fields
                                form.setFieldValue(
                                  `addresses[${index}].streetAddress`,
                                  address.streetAddress,
                                );
                                form.setFieldValue(
                                  `addresses[${index}].locality`,
                                  address.locality,
                                );
                                form.setFieldValue(
                                  `addresses[${index}].region`,
                                  address.region,
                                );
                                form.setFieldValue(
                                  `addresses[${index}].postalCode`,
                                  address.postalCode,
                                );
                                form.setFieldValue(
                                  `addresses[${index}].country`,
                                  address.country,
                                );
                              }}
                              error={field.state.meta.errors?.[0]}
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].locality`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="City"
                              placeholder="City"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].region`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="State/Region"
                              placeholder="State or Region"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].postalCode`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Postal Code"
                              placeholder="12345"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <form.AppField name={`addresses[${index}].country`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Country"
                              placeholder="United States"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <form.AppField
                          name={`addresses[${index}].postOfficeBoxNumber`}
                        >
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="P.O. Box Number"
                              placeholder="P.O. Box 123"
                            />
                          )}
                        </form.AppField>
                      </Grid.Col>
                    </Grid>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </form.AppField>
  );
}
