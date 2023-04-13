import { For } from 'solid-js';
import UploadCard from './upload-card';

export type Props = {
  edges: Array<{
    node: {
      id: string;
      title?: string | null;
      channel: { name: string; avatarUrl?: string | null };
      thumbnailUrl?: string | null;
      thumbnailBlurhash?: string | null;
    };
  }>;
};

export function UploadGrid(props: Props) {
  return (
    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <For each={props.edges}>
        {(edge) => (
          <li>
            <UploadCard
              title={edge.node.title}
              channel={edge.node.channel.name}
              href={`/media/${edge.node.id}`}
              thumbnailUrl={edge.node.thumbnailUrl}
              blurhash={edge.node.thumbnailBlurhash}
              avatarUrl={edge.node.channel.avatarUrl ?? ''}
            />
          </li>
        )}
      </For>
    </ul>
  );
}
