import FacebookIcon from '@tabler/icons/outline/brand-facebook.svg?component-solid';
import XIcon from '@tabler/icons/outline/brand-x.svg?component-solid';
import CopyIcon from '@tabler/icons/outline/copy.svg?component-solid';
import { splitProps } from 'solid-js';
import type { SetRequired } from 'type-fest';
import copy from 'copy-text-to-clipboard';
import FloatingDiv, { type Props as FloatingDivProps } from './floating-div';

export type Props = {
  data: SetRequired<ShareData, 'url' | 'title'>;
} & FloatingDivProps;

const windowConfig = Object.entries({
  width: 550,
  height: 400,
  location: 'no',
  toolbar: 'no',
  status: 'no',
  directories: 'no',
  menubar: 'no',
  scrollbars: 'yes',
  resizable: 'no',
  centerscreen: 'yes',
  chrome: 'yes',
})
  .map(([k, v]) => `${k}=${v}`)
  .join(',');

export default function FloatingShareMenu(props: Props) {
  const [localProps, otherProps] = splitProps(props, ['data']);

  function openWindow(url: string) {
    otherProps.onClose();

    window.open(url, '', windowConfig);
  }

  return (
    <FloatingDiv
      {...otherProps}
      class="-mt-2 flex gap-2 px-3 py-2 text-gray-500 [&>button:hover]:text-gray-700"
      role="menu"
    >
      <button
        onClick={() =>
          openWindow(
            `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams(
              Object.entries({
                u: localProps.data.url,
                quote: localProps.data.title,
              }),
            )}`,
          )
        }
      >
        <FacebookIcon />
      </button>
      <button
        onClick={() =>
          openWindow(
            `https://twitter.com/share?${new URLSearchParams(
              Object.entries({
                url: localProps.data.url,
                text: localProps.data.title,
              }),
            )}`,
          )
        }
      >
        <XIcon />
      </button>
      <button
        onClick={() => {
          copy(`${localProps.data.title} ${localProps.data.url}`);
          otherProps.onClose();
        }}
      >
        <CopyIcon />
      </button>
    </FloatingDiv>
  );
}
