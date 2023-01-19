import { onCleanup, onMount } from 'solid-js';
import invariant from 'tiny-invariant';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export type Props = {
  source: string;
  jwt: string;
  fluid?: boolean | undefined;
};

export default function AuthorizedVideo(props: Props) {
  let videoRef: HTMLVideoElement;

  onMount(() => {
    videojs.Vhs.xhr.beforeRequest = function (options) {
      if (props.jwt) {
        options.headers = {
          Authorization: `Bearer ${props.jwt}`,
        };
      } else {
        console.warn('No JWT provided to authorized video player');
      }
    };

    invariant(videoRef, 'Video ref is undefined');

    const player = videojs(videoRef, {
      controls: true,
      preload: 'auto',
      fluid: props.fluid,
      sources: [
        {
          src: props.source,
          type: 'application/x-mpegURL',
        },
      ],
    });

    try {
      player.play();
    } catch (e) {
      // The play method is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.
      console.warn('Could not automatically play video', e);
    }
  });

  onCleanup(() => {
    videojs.Vhs.xhr.beforeRequest = () => {
      // noop
    };
  });

  return <video class="video-js" ref={(el) => void (videoRef = el)} />;
}
