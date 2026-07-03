import { Button, Text } from '@/components/ui';
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
          </div>
          {addressesField.state.value.length === 0 ? (
            <Text size="sm" c="dimmed">
              No addresses added yet
            </Text>
          ) : (
            <div className="flex flex-col gap-4">
              {/* biome-ignore lint/suspicious/noExplicitAny: Address type is determined by form data */}
              {addressesField.state.value.map((address: any, index: number) => (
                <div
                  key={`address-${address.type}-${index}`}
                  className="rounded-lg border border-gray-300 p-4 dark:border-zinc-700"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
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
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
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
                      </div>
                      <div>
                        <form.AppField name={`addresses[${index}].name`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Name"
                              placeholder="e.g., Main Office"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <div className="sm:col-span-2">
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
                      </div>
                      <div>
                        <form.AppField name={`addresses[${index}].locality`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="City"
                              placeholder="City"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <div>
                        <form.AppField name={`addresses[${index}].region`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="State/Region"
                              placeholder="State or Region"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <div>
                        <form.AppField name={`addresses[${index}].postalCode`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Postal Code"
                              placeholder="12345"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <div>
                        <form.AppField name={`addresses[${index}].country`}>
                          {/* biome-ignore lint/suspicious/noExplicitAny: Field type is determined by form library */}
                          {(field: any) => (
                            <field.TextInputField
                              label="Country"
                              placeholder="United States"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <div className="sm:col-span-2">
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
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </form.AppField>
  );
}
