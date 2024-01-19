import Badge4kIcon from '@tabler/icons/badge-4k.svg?component-solid';
import BadgeHdIcon from '@tabler/icons/badge-hd.svg?component-solid';
import VolumeIcon from '@tabler/icons/volume.svg?component-solid';
import DeviceTvOldIcon from '@tabler/icons/device-tv-old.svg?component-solid';
import BadgeCcIcon from '@tabler/icons/badge-cc.svg?component-solid';
import ArticleIcon from '@tabler/icons/article.svg?component-solid';
import { For, Match, splitProps, Switch } from 'solid-js';
import FloatingDiv, { type Props as FloatingDivProps } from './floating-div';
import type { MediaDownloadKind } from '~/__generated__/graphql-types';

export type Props = {
  data: Array<{ kind: MediaDownloadKind; label: string; url: string }>;
} & FloatingDivProps;

export default function FloatingDownloadMenu(props: Props) {
  const [localProps, otherProps] = splitProps(props, ['data']);

  return (
    <FloatingDiv {...otherProps} role="menu">
      <For each={localProps.data}>
        {(link) => (
          <a
            href={link.url ?? ''}
            class="flex flex-row items-center gap-3 px-4 py-2 text-sm text-gray-700"
            role="menuitem"
            tabindex="-1"
            download
          >
            <Switch fallback={<DeviceTvOldIcon />}>
              <Match when={link.kind === 'VIDEO_4K'}>
                <Badge4kIcon />
              </Match>
              <Match
                when={link.kind === 'VIDEO_1080P' || link.kind === 'VIDEO_720P'}
              >
                <BadgeHdIcon />
              </Match>
              <Match when={link.kind === 'AUDIO'}>
                <VolumeIcon />
              </Match>
              <Match when={link.kind === 'TRANSCRIPT_VTT'}>
                <BadgeCcIcon />
              </Match>
              <Match when={link.kind === 'TRANSCRIPT_TXT'}>
                <ArticleIcon />
              </Match>
            </Switch>
            {link.label}
          </a>
        )}
      </For>
    </FloatingDiv>
  );
}
