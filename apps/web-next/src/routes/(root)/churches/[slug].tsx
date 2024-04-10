import {
  type RouteDefinition,
  cache,
  useParams,
  createAsync,
} from '@solidjs/router';
import WorldIcon from '@tabler/icons/outline/world.svg?component-solid';
import MailIcon from '@tabler/icons/outline/mail.svg?component-solid';
import PhoneIcon from '@tabler/icons/outline/phone.svg?component-solid';
import { gql } from 'graphql-request';
import invariant from 'tiny-invariant';
import { For, Show } from 'solid-js';
import {
  OrganizationBySlugQuery,
  OrganizationBySlugQueryVariables,
} from './__generated__/[slug]';
import { getAuthenticatedClient } from '~/util/gql/server';
import { Avatar } from '~/components/avatar';
import Chiclet from '~/components/churches/searchbox/chiclet';

const loadChurch = cache(async (slug: string) => {
  'use server';
  invariant(slug, 'Missing slug');

  const client = await getAuthenticatedClient();

  const { church } = await client.request<
    OrganizationBySlugQuery,
    OrganizationBySlugQueryVariables
  >(
    gql`
      query OrganizationBySlug($slug: String!) {
        church: organizationBySlug(slug: $slug) {
          name
          type
          description
          avatarUrl
          coverUrl
          tags {
            edges {
              node {
                tag {
                  category
                  color
                  label
                  description
                  slug
                }
              }
            }
          }
          primaryPhoneNumber
          primaryPhoneUri
          primaryEmail
          websiteUrl
          addresses {
            edges {
              node {
                type
                name
                streetAddress
                locality
                region
                postalCode
                postOfficeBoxNumber
                country
              }
            }
          }
          officialChannelsConnection {
            edges {
              node {
                ...ChannelProps
              }
            }
          }
          endorsedChannelsConnection {
            edges {
              node {
                ...ChannelProps
              }
            }
          }
        }
      }

      fragment ChannelProps on OrganizationChannelAssociation {
        channel {
          slug
          name
          avatarUrl
        }
      }
    `,
    {
      slug,
    },
  );

  return church;
}, 'loadChannel');

export const route = {
  load: ({ params }) => {
    const { slug } = params;
    invariant(slug, 'Missing channel slug');
    void loadChurch(slug);
  },
} satisfies RouteDefinition;

export default function ChurchRoute() {
  const params = useParams();
  const data = createAsync(() => {
    const { slug } = params;
    invariant(slug);
    return loadChurch(slug);
  });

  return (
    <article>
      <div>
        <div>
          <img
            class="h-32 w-full object-cover lg:h-48"
            style={{ 'object-position': 'center 70%' }}
            src="https://images.unsplash.com/photo-1508985307703-52d13b2b06b3?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt=""
          />
        </div>
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div class="-mt-12 sm:-mt-16 sm:flex sm:items-end sm:space-x-5">
            <div class="flex">
              <Avatar
                class="ring-4 ring-white sm:h-32 sm:w-32"
                src={data()?.avatarUrl}
                name={data()?.name}
                size="2xl"
              />
            </div>
            <div class="mt-6 sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:justify-end sm:space-x-6 sm:pb-1">
              <div class="mt-6 min-w-0 flex-1 sm:hidden 2xl:block">
                <h1 class="truncate text-2xl font-bold text-gray-900">
                  {data()?.name}
                </h1>
              </div>
              <div class="mt-6 flex flex-col justify-stretch space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
                <Show when={data()?.websiteUrl} keyed>
                  {(websiteUrl) => (
                    <a
                      href={websiteUrl}
                      class="inline-flex justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 [&_svg]:relative [&_svg]:h-5 [&_svg]:scale-[80%] [&_svg]:overflow-visible [&_svg]:text-gray-400"
                      target="_blank"
                    >
                      <WorldIcon />
                      Website
                    </a>
                  )}
                </Show>
                <Show when={data()?.primaryEmail} keyed>
                  {(email) => (
                    <a
                      href={`mailto:${email}`}
                      class="inline-flex justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 [&_svg]:relative [&_svg]:h-5 [&_svg]:scale-[80%] [&_svg]:overflow-visible [&_svg]:text-gray-400"
                    >
                      <MailIcon />
                      Email
                    </a>
                  )}
                </Show>
                <Show when={data()?.primaryPhoneUri} keyed>
                  {(phoneUri) => (
                    <a
                      href={phoneUri}
                      class="inline-flex justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 [&_svg]:relative [&_svg]:h-5 [&_svg]:scale-[80%] [&_svg]:overflow-visible [&_svg]:text-gray-400"
                    >
                      <PhoneIcon />
                      Call
                    </a>
                  )}
                </Show>
              </div>
            </div>
          </div>
          <div class="mt-6 hidden min-w-0 flex-1 sm:block 2xl:hidden">
            <h1 class="truncate text-2xl font-bold text-gray-900">
              {data()?.name}
            </h1>
          </div>
        </div>
      </div>

      <div class="mx-auto mt-6 flex max-w-5xl flex-wrap gap-2 px-4 sm:px-6 lg:px-8">
        <For each={data()?.tags.edges}>
          {({ node }) => (
            <a href={`/churches?tag=${node.tag.slug}`}>
              <Chiclet color={node.tag.color}>{node.tag.label}</Chiclet>
            </a>
          )}
        </For>
      </div>
      <div class="mx-auto mt-6 max-w-5xl px-4 sm:px-6 lg:px-8">
        <dl class="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
          <Show when={data()?.primaryPhoneNumber} keyed>
            {(phoneNumber) => (
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Phone</dt>
                <dd class="mt-1 text-sm text-gray-900">{phoneNumber}</dd>
              </div>
            )}
          </Show>
          <Show when={data()?.primaryEmail} keyed>
            {(email) => (
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Email</dt>
                <dd class="mt-1 text-sm text-gray-900">{email}</dd>
              </div>
            )}
          </Show>
          <Show when={data()?.description} keyed>
            {(description) => (
              <div class="sm:col-span-2">
                <dt class="text-sm font-medium text-gray-500">About</dt>
                <dd class="mt-1 max-w-prose space-y-5 text-sm text-gray-900">
                  <For each={description.split('\n\n')}>
                    {(p) => <p>{p}</p>}
                  </For>
                </dd>
              </div>
            )}
          </Show>
        </dl>
      </div>
      <Show when={(data()?.officialChannelsConnection.edges.length ?? 0) > 0}>
        <div class="mx-auto mt-8 max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 class="text-sm font-medium text-gray-500">Official Channels</h2>
          <div class="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <For each={data()?.officialChannelsConnection.edges}>
              {({ node }) => (
                <div class="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400">
                  <div class="flex-shrink-0">
                    <Avatar
                      src={node.channel.avatarUrl}
                      size="md"
                      name={node.channel.name}
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <a
                      href={`/channel/${node.channel.slug}`}
                      class="focus:outline-none"
                    >
                      <span class="absolute inset-0" aria-hidden="true" />
                      <p class="text-sm font-medium text-gray-900">
                        {node.channel.name}
                      </p>
                    </a>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={(data()?.endorsedChannelsConnection.edges.length ?? 0) > 0}>
        <div class="mx-auto mt-8 max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 class="text-sm font-medium text-gray-500">Official Channels</h2>
          <div class="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <For each={data()?.officialChannelsConnection.edges}>
              {({ node }) => (
                <div class="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400">
                  <div class="flex-shrink-0">
                    <Avatar
                      src={node.channel.avatarUrl}
                      size="md"
                      name={node.channel.name}
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <a
                      href={`/channel/${node.channel.slug}`}
                      class="focus:outline-none"
                    >
                      <span class="absolute inset-0" aria-hidden="true" />
                      <p class="text-sm font-medium text-gray-900">
                        {node.channel.name}
                      </p>
                    </a>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </article>
  );
}
