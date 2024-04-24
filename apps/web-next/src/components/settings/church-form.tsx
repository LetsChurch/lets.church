import { action, redirect, useAction } from '@solidjs/router';
import TrashIcon from '@tabler/icons/outline/trash.svg?component-solid';
import AddIcon from '@tabler/icons/outline/plus.svg?component-solid';
import { gql } from 'graphql-request';
import {
  array,
  email,
  minLength,
  nullable,
  object,
  optional,
  parse,
  picklist,
  string,
  type Input as VInput,
} from 'valibot';
import { For, Show, createSignal, type ParentProps } from 'solid-js';
import {
  Field,
  FieldArray,
  Form,
  createFormStore,
  insert,
  remove,
  valiForm,
  type FormStore,
} from '@modular-forms/solid';
import { Button, LabeledInput } from '../form';
import type {
  UpsertOrganizationMutation,
  UpsertOrganizationMutationVariables,
} from './__generated__/church-form';
import {
  OrganizationAddressType,
  OrganizationLeaderType,
} from '~/__generated__/graphql-types';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';

export const formSchema = object({
  id: optional(string()),
  name: string([minLength(1, 'Please enter a name for your church.')]),
  slug: string([minLength(3, 'Please enter a URL name for your church.')]),
  description: optional(nullable(string())),
  primaryEmail: optional(nullable(string([email()]))),
  primaryPhoneNumber: optional(nullable(string())),
  leaders: optional(
    array(
      object({
        name: optional(nullable(string())),
        type: picklist(['Elder', 'Deacon', 'Other']),
        email: optional(nullable(string([email()]))),
        phoneNumber: optional(nullable(string())),
      }),
    ),
    [],
  ),
  addresses: optional(
    array(
      object({
        type: picklist(['Mailing', 'Meeting', 'Office', 'Other']),
        country: optional(nullable(string()), null),
        locality: optional(nullable(string()), null),
        region: optional(nullable(string()), null),
        postalCode: optional(nullable(string()), null),
        streetAddress: optional(nullable(string()), null),
      }),
    ),
    [],
  ),
});

type FormSchema = VInput<typeof formSchema>;

const upsertChurch = action(async (data: FormSchema) => {
  'use server';
  const validated = parse(formSchema, data);
  const client = await getAuthenticatedClientOrRedirect();
  const res = await client.rawRequest<
    UpsertOrganizationMutation,
    UpsertOrganizationMutationVariables
  >(
    gql`
      mutation UpsertOrganization(
        $id: ShortUuid
        $name: String!
        $slug: String!
        $about: String
        $primaryEmail: String
        $primaryPhoneNumber: String
        $addresses: [AddressInput!]
        $leaders: [OrganizationLeaderInput!]
      ) {
        upsertOrganization(
          type: CHURCH
          organizationId: $id
          name: $name
          slug: $slug
          description: $about
          primaryEmail: $primaryEmail
          primaryPhoneNumber: $primaryPhoneNumber
          addresses: $addresses
          leaders: $leaders
        ) {
          id
        }
      }
    `,
    {
      ...validated,
      id: validated.id ?? null,
      about: data.description ?? null,
      primaryEmail: data.primaryEmail ?? null,
      primaryPhoneNumber: data.primaryPhoneNumber ?? null,
      addresses:
        data.addresses?.map((a) => ({
          ...a,
          // TODO: try enum_ with default value?
          type: OrganizationAddressType[a.type],
          country: a.country ?? null,
          locality: a.locality ?? null,
          postalCode: a.postalCode ?? null,
          region: a.region ?? null,
          streetAddress: a.streetAddress ?? null,
        })) ?? null,
      leaders:
        data.leaders?.map((l) => ({
          ...l,
          type: OrganizationLeaderType[l.type],
          name: l.name ?? null,
          email: l.email ?? null,
          phoneNumber: l.phoneNumber ?? null,
        })) ?? null,
    },
  );

  if (!res.errors) {
    return redirect('/profile/churches');
  }

  return res.errors;
});

function EmptyState(props: ParentProps) {
  return (
    <div class="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
      {props.children}
    </div>
  );
}

function AddressForm(props: {
  store: FormStore<FormSchema, undefined>;
  index: number;
}) {
  return (
    <div class="relative mt-2 grid grid-cols-1 gap-x-6 gap-y-8 rounded-lg border border-dashed border-gray-900/25 p-4 sm:grid-cols-6">
      <button
        class="absolute right-4 top-4"
        title="Delete address"
        onClick={() => remove(props.store, 'addresses', { at: props.index })}
      >
        <TrashIcon class="text-gray-500" />
        <span class="sr-only">Delete address</span>
      </button>

      <Field of={props.store} name={`addresses.${props.index}.type`}>
        {(field, props) => (
          <LabeledInput
            type="select"
            {...props}
            name={field.name}
            value={field.value}
            label="Address Type"
            error={field.error}
            class="sm:col-span-2"
          >
            <option value="Mailing">Mailing</option>
            <option value="Meeting">Meeting</option>
            <option value="Office">Office</option>
            <option value="Other">Other</option>
          </LabeledInput>
        )}
      </Field>

      <Field of={props.store} name={`addresses.${props.index}.country`}>
        {(field, props) => (
          <LabeledInput
            type="select"
            {...props}
            name={field.name}
            value={field.value}
            label="Country"
            placeholder="Country"
            error={field.error}
            class="sm:col-span-2"
          >
            <option>United States</option>
            <option>Canada</option>
            <option>Mexico</option>
          </LabeledInput>
        )}
      </Field>

      <Field of={props.store} name={`addresses.${props.index}.streetAddress`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            value={field.value}
            label="Street Address"
            placeholder="123 Main St."
            error={field.error}
            class="col-span-full"
          />
        )}
      </Field>

      <Field of={props.store} name={`addresses.${props.index}.locality`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            value={field.value}
            label="City / Locality"
            placeholder="City / Locality"
            error={field.error}
            class="sm:col-span-2 sm:col-start-1"
          />
        )}
      </Field>

      <Field of={props.store} name={`addresses.${props.index}.region`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            value={field.value}
            label="State / Province / Region"
            placeholder="State / Province / Region"
            error={field.error}
            class="sm:col-span-2"
          />
        )}
      </Field>

      <Field of={props.store} name={`addresses.${props.index}.postalCode`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            value={field.value}
            label="ZIP / Postal code"
            placeholder="Zip / Postal code"
            error={field.error}
            class="sm:col-span-2"
          />
        )}
      </Field>
    </div>
  );
}

function LeadershipForm(props: {
  store: FormStore<FormSchema, undefined>;
  index: number;
}) {
  return (
    <div class="relative mt-2 grid grid-cols-1 gap-x-6 gap-y-8 rounded-lg border border-dashed border-gray-900/25 p-4 sm:grid-cols-6">
      <button
        class="absolute right-4 top-4"
        title="Delete address"
        onClick={() => remove(props.store, 'leaders', { at: props.index })}
      >
        <TrashIcon class="text-gray-500" />
        <span class="sr-only">Delete address</span>
      </button>

      <Field of={props.store} name={`leaders.${props.index}.name`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            value={field.value}
            label="Name"
            placeholder="John"
            error={field.error}
            class="mt-2 sm:col-span-4"
          />
        )}
      </Field>

      <Field of={props.store} name={`leaders.${props.index}.type`}>
        {(field, props) => (
          <LabeledInput
            type="select"
            {...props}
            name={field.name}
            value={field.value}
            label="Position"
            error={field.error}
            class="sm:col-span-4"
          >
            <option value="Elder">Elder</option>
            <option value="Deacon">Deacon</option>
          </LabeledInput>
        )}
      </Field>

      <Field of={props.store} name={`leaders.${props.index}.email`}>
        {(field, props) => (
          <LabeledInput
            type="email"
            {...props}
            name={field.name}
            value={field.value}
            label="Email"
            placeholder="john@church.com"
            error={field.error}
            class="mt-2 sm:col-span-4"
          />
        )}
      </Field>

      <Field of={props.store} name={`leaders.${props.index}.phoneNumber`}>
        {(field, props) => (
          <LabeledInput
            type="tel"
            {...props}
            name={field.name}
            value={field.value}
            label="Phone Number"
            placeholder="+1 (555) 555-5555"
            error={field.error}
            class="mt-2 sm:col-span-4"
          />
        )}
      </Field>
    </div>
  );
}

export default function ChurchForm(props: { initialValues?: FormSchema }) {
  const store = createFormStore({
    validate: valiForm(formSchema),
    ...(props.initialValues ? { initialValues: props.initialValues } : {}),
  });
  const ccAction = useAction(upsertChurch);
  const [errors, setErrors] =
    createSignal<Awaited<ReturnType<typeof ccAction>>>();

  async function handleSubmit(data: FormSchema, e: SubmitEvent) {
    e.preventDefault();
    const errors = await ccAction(data);

    if (errors) {
      setErrors(errors);
    } else {
      setErrors(undefined);
    }
  }

  return (
    <>
      <For each={errors()}>
        {(error) => <p class="text-red-500">{error.message}</p>}
      </For>
      <Form of={store} onSubmit={handleSubmit}>
        <Field of={store} name="id">
          {(field, props) => (
            <Show when={field.value} keyed>
              {(value) => (
                <input
                  type="hidden"
                  {...props}
                  name={field.name}
                  value={value}
                />
              )}
            </Show>
          )}
        </Field>
        <div class="space-y-12">
          <div class="border-b border-gray-900/10 pb-12">
            <h2 class="text-base font-semibold leading-7 text-gray-900">
              Profile
            </h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">
              This information will be displayed publicly.
            </p>

            <div class="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <Field of={store} name="name">
                {(field, props) => (
                  <LabeledInput
                    {...props}
                    name={field.name}
                    value={field.value}
                    label="Name"
                    error={field.error}
                    class="sm:col-span-4"
                  />
                )}
              </Field>

              <Field of={store} name="slug">
                {(field, props) => (
                  <LabeledInput
                    {...props}
                    name={field.name}
                    value={field.value}
                    label="URL"
                    prefix="lets.church/churches/"
                    placeholder="my-church"
                    error={field.error}
                    class="sm:col-span-4"
                  />
                )}
              </Field>

              <Field of={store} name="description">
                {(field, props) => (
                  <LabeledInput
                    type="textarea"
                    value={field.value}
                    {...props}
                    name={field.name}
                    label="About"
                    placeholder="Write a few sentences about your church."
                    error={field.error}
                    class="col-span-full"
                  />
                )}
              </Field>
            </div>
          </div>

          <div class="pb-12">
            <h2 class="text-base font-semibold leading-7 text-gray-900">
              Contact
            </h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">
              Contact and meeting information for your church.
            </p>

            <Field of={store} name="primaryEmail">
              {(field, props) => (
                <LabeledInput
                  {...props}
                  name={field.name}
                  value={field.value}
                  label="Primary Email"
                  placeholder="pastor@church.com"
                  error={field.error}
                  class="mt-6 sm:col-span-4"
                />
              )}
            </Field>

            <Field of={store} name="primaryPhoneNumber">
              {(field, props) => (
                <LabeledInput
                  type="tel"
                  {...props}
                  name={field.name}
                  value={field.value}
                  label="Primary Phone Number"
                  placeholder="+1 (555) 555-5555"
                  error={field.error}
                  class="mt-6 sm:col-span-4"
                />
              )}
            </Field>

            <label class="mt-6 block text-sm font-medium leading-6 text-gray-900">
              Addresses
            </label>

            <FieldArray of={store} name="addresses">
              {(fieldArray) => (
                <For
                  each={fieldArray.items}
                  fallback={<EmptyState>No addresses added yet.</EmptyState>}
                >
                  {(_, index) => <AddressForm store={store} index={index()} />}
                </For>
              )}
            </FieldArray>

            <Button
              variant="secondary"
              class="mt-4"
              onClick={() =>
                insert(store, 'addresses', {
                  value: {
                    type: 'Meeting',
                    country: '',
                    locality: '',
                    region: '',
                    // postOfficeBoxNumber: '',
                    postalCode: '',
                    streetAddress: '',
                  },
                })
              }
            >
              <AddIcon class="-ml-2 mr-2 text-gray-400" />
              Add address
            </Button>

            <label class="mt-6 block text-sm font-medium leading-6 text-gray-900">
              Leadership
            </label>

            <FieldArray of={store} name="leaders">
              {(fieldArray) => (
                <For
                  each={fieldArray.items}
                  fallback={<EmptyState>No leadership added yet.</EmptyState>}
                >
                  {(_, index) => (
                    <LeadershipForm store={store} index={index()} />
                  )}
                </For>
              )}
            </FieldArray>

            <Button
              variant="secondary"
              class="mt-4"
              onClick={() =>
                insert(store, 'leaders', {
                  value: {
                    name: '',
                    type: 'Elder',
                    phoneNumber: '',
                    email: '',
                  },
                })
              }
            >
              <AddIcon class="-ml-2 mr-2 text-gray-400" />
              Add leader
            </Button>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-end gap-x-6">
          <button
            type="submit"
            class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Save
          </button>
        </div>
      </Form>
    </>
  );
}
