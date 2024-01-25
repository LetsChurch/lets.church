import { type JSX, For, createSignal, Show } from 'solid-js';
import PencilIcon from '@tabler/icons/pencil.svg?component-solid';
import { autofocus } from '@solid-primitives/autofocus';

export type DatalistField = {
  label: string;
  property: string;
  editable: boolean;
  type?: JSX.IntrinsicElements['input']['type'];
};

type RowProps = {
  field: DatalistField;
  value: string;
  editing: string | null;
  setEditing: (editing: string | null) => void;
};

function Row(props: RowProps) {
  return (
    <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
      <dt class="flex h-full items-center text-sm font-medium text-gray-500">
        {props.field.label}
      </dt>
      <dd class="mt-1 flex text-sm text-gray-900 sm:col-span-2 sm:mt-0">
        <div class="flex flex-grow items-center">
          <Show
            when={props.field.property === props.editing}
            fallback={
              <>
                <span class="flex h-[36px] items-center">{props.value}</span>
                <Show when={props.field.editable}>
                  <input
                    type="hidden"
                    name={props.field.property}
                    value={props.value}
                  />
                </Show>
              </>
            }
          >
            <input
              type={props.field.type ?? 'text'}
              name={props.field.property}
              class="block h-full w-[90%] rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              autofocus
              ref={(el) => autofocus(el)}
            />
          </Show>
        </div>
        <Show when={props.field.editable}>
          <div class="ml-4 flex-shrink-0">
            <Show
              when={props.field.property === props.editing}
              fallback={
                <button
                  type="button"
                  class="flex h-full items-center rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => props.setEditing(props.field.property)}
                >
                  <PencilIcon />
                </button>
              }
            >
              <button
                type="submit"
                class="flex h-full items-center rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Save
              </button>
            </Show>
          </div>
        </Show>
      </dd>
    </div>
  );
}

export type Props = {
  fields: Array<DatalistField>;
  data: Record<string, string | null>;
};

export default function EditableDatalist(props: Props) {
  const [editing, setEditing] = createSignal<string | null>(null);

  return (
    <dl class="divide-y divide-gray-200">
      <For each={props.fields}>
        {(field) => (
          <Row
            field={field}
            editing={editing()}
            setEditing={setEditing}
            value={props.data[field.property] ?? ''}
          />
        )}
      </For>
    </dl>
  );
}
