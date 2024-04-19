// TODO: redirect
import { For, ParentProps, createSignal } from 'solid-js';
import {
  object,
  array,
  string,
  email,
  picklist,
  optional,
  type Input as VInput,
  parse,
  minLength,
} from 'valibot';
import TrashIcon from '@tabler/icons/outline/trash.svg?component-solid';
import AddIcon from '@tabler/icons/outline/plus.svg?component-solid';
import {
  Field,
  FieldArray,
  Form,
  type FormStore,
  createFormStore,
  valiForm,
  insert,
  remove,
} from '@modular-forms/solid';
import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  action,
  redirect,
  useAction,
  createAsync,
} from '@solidjs/router';
import {
  UpsertOrganizationMutation,
  UpsertOrganizationMutationVariables,
} from './__generated__/new';
import { Button, LabeledInput } from '~/components/form';
import { PageHeading } from '~/components/page-heading';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import {
  OrganizationAddressType,
  OrganizationLeaderType,
} from '~/__generated__/graphql-types';

const routeData = async () => {
  'use server';
  await getAuthenticatedClientOrRedirect();
};

export const route = {
  load: () => {
    void routeData();
  },
} satisfies RouteDefinition;

const formSchema = object({
  name: string([minLength(1, 'Please enter a name for your church.')]),
  slug: string(),
  about: optional(string()),
  primaryEmail: optional(string([email()])),
  primaryPhoneNumber: optional(string()),
  leadership: optional(
    array(
      object({
        name: string(),
        type: picklist(['Elder', 'Deacon']),
        email: string([email()]),
        phoneNumber: string(),
      }),
    ),
    [],
  ),
  addresses: optional(
    array(
      object({
        type: picklist(['Mailing', 'Meeting', 'Office', 'Other']),
        country: string(),
        locality: string(),
        region: string(),
        postalCode: string(),
        streetAddress: string(),
      }),
    ),
    [],
  ),
});

type FormSchema = VInput<typeof formSchema>;

const createChurch = action(async (data: FormSchema) => {
  'use server';
  const validated = parse(formSchema, data);
  const client = await getAuthenticatedClientOrRedirect();
  const res = await client.rawRequest<
    UpsertOrganizationMutation,
    UpsertOrganizationMutationVariables
  >(
    gql`
      mutation UpsertOrganization(
        $name: String!
        $slug: String!
        $about: String
        $primaryEmail: String
        $primaryPhoneNumber: String
        $addresses: [AddressInput!]
        $leadership: [OrganizationLeaderInput!]
      ) {
        upsertOrganization(
          type: CHURCH
          name: $name
          slug: $slug
          description: $about
          primaryEmail: $primaryEmail
          primaryPhoneNumber: $primaryPhoneNumber
          addresses: $addresses
          leaders: $leadership
        ) {
          id
        }
      }
    `,
    {
      ...validated,
      about: data.about ?? null,
      primaryEmail: data.primaryEmail ?? null,
      primaryPhoneNumber: data.primaryPhoneNumber ?? null,
      addresses:
        data.addresses?.map((a) => ({
          ...a,
          type: OrganizationAddressType[a.type],
        })) ?? null,
      leadership:
        data.leadership?.map((l) => ({
          ...l,
          type: OrganizationLeaderType[l.type],
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
  createAsync(() => routeData());

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
        onClick={() => remove(props.store, 'leadership', { at: props.index })}
      >
        <TrashIcon class="text-gray-500" />
        <span class="sr-only">Delete address</span>
      </button>

      <Field of={props.store} name={`leadership.${props.index}.name`}>
        {(field, props) => (
          <LabeledInput
            {...props}
            name={field.name}
            label="Name"
            placeholder="John"
            error={field.error}
            class="mt-2 sm:col-span-4"
          />
        )}
      </Field>

      <Field of={props.store} name={`leadership.${props.index}.type`}>
        {(field, props) => (
          <LabeledInput
            type="select"
            {...props}
            name={field.name}
            label="Position"
            error={field.error}
            class="sm:col-span-4"
          >
            <option value="Elder">Elder</option>
            <option value="Deacon">Deacon</option>
          </LabeledInput>
        )}
      </Field>

      <Field of={props.store} name={`leadership.${props.index}.email`}>
        {(field, props) => (
          <LabeledInput
            type="email"
            {...props}
            name={field.name}
            label="Email"
            placeholder="john@church.com"
            error={field.error}
            class="mt-2 sm:col-span-4"
          />
        )}
      </Field>

      <Field of={props.store} name={`leadership.${props.index}.phoneNumber`}>
        {(field, props) => (
          <LabeledInput
            type="tel"
            {...props}
            name={field.name}
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

export default function ProfileNewChurchesRoute() {
  const store = createFormStore({ validate: valiForm(formSchema) });
  const ccAction = useAction(createChurch);
  const [errors, setErrors] =
    createSignal<Awaited<ReturnType<typeof ccAction>>>();
  // const navigate = useNavigate();

  async function handleSubmit(data: FormSchema, e: SubmitEvent) {
    e.preventDefault();
    // const errors = await createChurch(data);
    const errors = await ccAction(data);

    if (errors) {
      setErrors(errors);
    } else {
      setErrors(undefined);
    }

    // if (!errors) {
    //   navigate('/profile/churches');
    // } else {
    //   setErrors(errors);
    // }
  }

  return (
    <>
      <PageHeading title="Add New Church" backButton />
      <For each={errors()}>
        {(error) => <p class="text-red-500">{error.message}</p>}
      </For>
      <Form of={store} onSubmit={handleSubmit}>
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
                    label="URL"
                    prefix="lets.church/churches/"
                    placeholder="my-church"
                    error={field.error}
                    class="sm:col-span-4"
                  />
                )}
              </Field>

              <Field of={store} name="about">
                {(field, props) => (
                  <LabeledInput
                    type="textarea"
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

            <FieldArray of={store} name="leadership">
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
                insert(store, 'leadership', {
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
