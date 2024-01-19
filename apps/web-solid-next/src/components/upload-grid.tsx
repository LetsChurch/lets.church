import { For } from 'solid-js';
import UploadCard from './upload-card';
import type { UploadCardFieldsFragment } from '~/util/gql/__generated__/fragments';

export type Props = {
  edges: Array<{
    node: UploadCardFieldsFragment;
  }>;
};

export function UploadGrid(props: Props) {
  return (
    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <For each={props.edges}>
        {(edge) => (
          <li>
            <UploadCard href={`/media/${edge.node.id}`} data={edge.node} />
          </li>
        )}
      </For>
    </ul>
  );
}
