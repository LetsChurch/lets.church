import Badge4k from '@tabler/icons/badge-4k.svg?component-solid';
import BadgeHd from '@tabler/icons/badge-hd.svg?component-solid';
import VolumeIcon from '@tabler/icons/volume.svg?component-solid';
import DeviceTvOld from '@tabler/icons/device-tv-old.svg?component-solid';
import { For, Match, splitProps, Switch } from 'solid-js';
import { A } from 'solid-start';
import FloatingDiv, { Props as FloatingDivProps } from './floating-div';
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
          <A
            href={link.url ?? ''}
            class="block flex flex-row items-center gap-3 px-4 py-2 text-sm text-gray-700"
            role="menuitem"
            tabindex="-1"
            download
          >
            <Switch fallback={<DeviceTvOld />}>
              <Match when={link.kind === 'VIDEO_4K'}>
                <Badge4k />
              </Match>
              <Match
                when={link.kind === 'VIDEO_1080P' || link.kind === 'VIDEO_720P'}
              >
                <BadgeHd />
              </Match>
              <Match when={link.kind === 'AUDIO'}>
                <VolumeIcon />
              </Match>
            </Switch>
            {link.label}
          </A>
        )}
      </For>
    </FloatingDiv>
  );
}
