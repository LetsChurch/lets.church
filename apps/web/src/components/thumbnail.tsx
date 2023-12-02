import UnknownIcon from '@tabler/icons/3d-cube-sphere.svg?component-solid';
import VideoIcon from '@tabler/icons/video.svg?component-solid';
import AudioIcon from '@tabler/icons/volume.svg?component-solid';
import { Match, Switch } from 'solid-js';
import type { Optional } from '~/util';

export type Props = {
  lqUrl?: Optional<string>;
  url?: Optional<string>;
  width: number;
  height: number;
  placeholder?: 'video' | 'audio' | undefined;
};

export default function Thumbnail(props: Props) {
  return (
    <Switch
      fallback={
        <div class="flex aspect-video w-full items-center justify-center bg-gray-100 text-gray-300">
          <Switch
            fallback={
              <UnknownIcon width={props.width / 2} height={props.height / 2} />
            }
          >
            <Match when={props.placeholder === 'video'}>
              <VideoIcon width={props.width / 2} height={props.height / 2} />
            </Match>
            <Match when={props.placeholder === 'audio'}>
              <AudioIcon width={props.width / 2} height={props.height / 2} />
            </Match>
          </Switch>
        </div>
      }
    >
      <Match when={props.url} keyed>
        {(url) => (
          <img
            src={url}
            class="w-full bg-cover bg-center bg-no-repeat"
            style={{ background: `url(${props.lqUrl})` ?? '#EEE' }}
          />
        )}
      </Match>
    </Switch>
  );
}
