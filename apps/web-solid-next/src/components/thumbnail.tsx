import UnknownIcon from '@tabler/icons/3d-cube-sphere.svg?component-solid';
import VideoIcon from '@tabler/icons/video.svg?component-solid';
import AudioIcon from '@tabler/icons/volume.svg?component-solid';
import { Match, Switch } from 'solid-js';
import { formatSeconds, type Optional } from '~/util';

export type Props = {
  lqUrl?: Optional<string>;
  url?: Optional<string>;
  width: number;
  height: number;
  placeholder?: 'video' | 'audio' | undefined;
  lengthSeconds?: Optional<number>;
};

export default function Thumbnail(props: Props) {
  return (
    <div class="relative">
      <Switch
        fallback={
          <div class="flex aspect-video w-full items-center justify-center bg-gray-100 text-gray-300">
            <Switch
              fallback={
                <UnknownIcon
                  width={props.width / 2}
                  height={props.height / 2}
                />
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
              class="aspect-video w-full bg-gray-200 bg-contain bg-center bg-no-repeat object-contain"
              style={{ background: `url(${props.lqUrl})` ?? '#EEE' }}
            />
          )}
        </Match>
      </Switch>
      {props.lengthSeconds ? (
        <span class="absolute bottom-2 right-2 inline-flex items-center rounded-md bg-gray-900 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatSeconds(props.lengthSeconds)}
        </span>
      ) : null}
    </div>
  );
}
