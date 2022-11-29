import { For, Match, Show, Switch } from 'solid-js';

type BaseField = { label: string; name: string; required?: boolean };

type TextField = BaseField & {
  type: 'text';
};

type FileField = BaseField & { type: 'file' };

type SelectField = BaseField & {
  type: 'select';
  options: Array<{ label: string; value: string }>;
};

type RadioField = BaseField & {
  type: 'radio';
  options: Array<{ label: string; help?: string; value: string }>;
};

type Field = TextField | FileField | SelectField | RadioField;

const sections: Array<{
  title: string;
  help?: string;
  fields: Array<Field>;
}> = [
  {
    title: 'Metadata',
    help: 'asdf',
    fields: [
      {
        label: 'Channel',
        name: 'channel',
        type: 'select',
        options: [{ label: "Let's Church", value: 'letschurch' }],
      },
      { label: 'Title', name: 'title', type: 'text' },
      { label: 'License', name: 'license', type: 'select', options: [] },
    ],
  },
  {
    title: 'Upload',
    help: 'asdf',
    fields: [
      { label: 'Media', name: 'media', type: 'file' },
      { label: 'Thumbnail', name: 'thumbnail', type: 'file' },
    ],
  },
  {
    title: 'Settings',
    help: 'asdf',
    fields: [
      {
        type: 'radio',
        label: 'Visiblity',
        name: 'visiblity',
        options: [
          { label: 'Public', help: 'Visible to everyone', value: 'public' },
          {
            label: 'Private',
            help: 'Visible only to members of <channel>',
            value: 'private',
          },
          {
            label: 'Unlisted',
            help: 'Visible everyone with a link',
            value: 'unlisted',
          },
        ],
      },
    ],
  },
];

export default function UploadRoute() {
  return (
    <form>
      <For each={sections}>
        {(section, sectionI) => (
          <>
            <section class="md:grid md:grid-cols-3 md:gap-6">
              <div class="md:col-span-1">
                <h3 class="text-lg font-medium leading-6 text-gray-900">
                  {section.title}
                </h3>
                <Show when={section.help}>
                  <p class="mt-1 text-sm text-gray-600">{section.help}</p>
                </Show>
              </div>
              <div class="md:col-span-2">
                <For each={section.fields}>
                  {(field, fieldI) => (
                    <div class:mt-5={fieldI() > 0}>
                      <Show when={field.type !== 'radio'}>
                        <label
                          class="block text-sm font-medium text-gray-700"
                          for={field.name}
                        >
                          {field.label}
                        </label>
                      </Show>
                      <Switch
                        fallback={
                          <input
                            id={field.name}
                            name={field.name}
                            type={field.type}
                            class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          />
                        }
                      >
                        <Match when={field.type === 'select'}>
                          <select
                            id={field.name}
                            name={field.name}
                            class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          >
                            <For each={(field as SelectField).options}>
                              {(op) => (
                                <option value={op.value}>{op.label}</option>
                              )}
                            </For>
                          </select>
                        </Match>
                        <Match when={field.type === 'radio'}>
                          <fieldset>
                            <legend class="contents text-base font-medium text-gray-900">
                              {field.label}
                            </legend>
                            <div class="mt-4 space-y-4">
                              <For each={(field as RadioField).options}>
                                {(op) => (
                                  <div
                                    class={`flex ${
                                      op.help ? 'items-start' : 'items-center'
                                    }`}
                                  >
                                    <div class="flex h-5 items-center">
                                      <input
                                        id={`${field.name}_${op.value}`}
                                        name={field.name}
                                        value={op.value}
                                        type="radio"
                                        class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </div>
                                    <div class="ml-3 text-sm">
                                      <label
                                        for={`${field.name}_${op.value}`}
                                        class="font-medium text-gray-700"
                                      >
                                        {op.label}
                                      </label>
                                      <Show when={op.help}>
                                        <p class="text-gray-500">{op.help}</p>
                                      </Show>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                          </fieldset>
                        </Match>
                      </Switch>
                    </div>
                  )}
                </For>
              </div>
            </section>
            <Show when={sectionI() < sections.length - 1}>
              <hr class="my-10 border-t border-gray-200" />
            </Show>
          </>
        )}
      </For>
    </form>
  );
}
