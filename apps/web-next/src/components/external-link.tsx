import ExternalLinkIcon from '@tabler/icons/outline/external-link.svg?component-solid';
import type { ParentProps } from 'solid-js';

export default function ExternalLink(props: ParentProps<{ href: string }>) {
  return (
    <a
      target="_blank"
      rel="noreferrer noopener"
      class="text-indigo-500"
      {...props}
    >
      {props.children}
      <sup>
        <ExternalLinkIcon class="inline-block h-3 w-3" />
      </sup>
    </a>
  );
}
