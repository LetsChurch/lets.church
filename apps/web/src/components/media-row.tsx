import humanFormat from 'human-format';
import pluralize from 'pluralize';
import { ParentProps, Show } from 'solid-js';
import { isServer } from 'solid-js/web';
import { A } from 'solid-start';
import { gql } from 'graphql-request';
import { Avatar } from './avatar';
import Thumbnail, { type Props as ThumbnailProps } from './thumbnail';
import type { MediaRowPropsFragment } from './__generated__/media-row';
import { formatDateFull } from '~/util/date';

export const MediaRowFragment = isServer
  ? gql`
      fragment MediaRowProps on UploadRecord {
        title
        publishedAt
        totalViews
        thumbnailBlurhash
        thumbnailUrl
        variants
        channel {
          id
          slug
          name
          avatarUrl
          defaultThumbnailUrl
        }
      }
    `
  : null;

export type Props = ParentProps<
  Omit<ThumbnailProps, 'width' | 'height' | 'url' | 'blurhash'> & {
    href: string;
    uploadProps: MediaRowPropsFragment;
    marked?: boolean;
    class?: string | undefined;
  }
>;

export function MediaRow(props: Props) {
  return (
    <div
      class={`relative grid grid-cols-1 gap-5 md:grid-cols-[352px_auto] md:grid-rows-1 md:flex-row ${
        props.class ?? ''
      }`}
    >
      <Thumbnail
        url={
          props.uploadProps.thumbnailUrl ??
          props.uploadProps.channel.defaultThumbnailUrl
        }
        blurhash={props.uploadProps.thumbnailBlurhash}
        width={352}
        height={198}
        placeholder={props.placeholder}
      />
      <div class="space-y-2">
        <h3 class="text-2xl font-semibold">
          <A href={props.href} class="before:absolute before:inset-0">
            {props.uploadProps.title}
          </A>
        </h3>
        <p class="text-xs text-gray-500">
          {' '}
          {humanFormat(props.uploadProps.totalViews ?? 0)}{' '}
          {pluralize('view', props.uploadProps.totalViews ?? 0)} &middot;{' '}
          <Show when={props.uploadProps.publishedAt} keyed>
            {(publishedAt) => (
              <time datetime={publishedAt} class="text-gray-600">
                {formatDateFull(new Date(publishedAt))}
              </time>
            )}
          </Show>
        </p>
        <A
          href={`/channel/${props.uploadProps.channel.slug}`}
          class="relative z-10 inline-flex items-center space-x-2"
        >
          <Avatar
            size="sm"
            src={props.uploadProps.channel.avatarUrl}
            alt={props.uploadProps.channel.name}
          />
          <span class="text-sm text-gray-500">
            {props.uploadProps.channel.name}
          </span>
        </A>
        {props.children}
      </div>
    </div>
  );
}
