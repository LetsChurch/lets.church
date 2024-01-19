import { For, Match, Show, Switch, createUniqueId } from 'solid-js';
import Dropzone, { DroppedRes } from '../dropzone';
import { Button, Input, Radios, Select, Textarea } from '../form';
import AutoComplete from '../form/autocomplete';
import { Optional } from '~/util';

type BaseField<N extends string, V = string> = {
  label: string;
  name: N;
  required?: boolean;
  defaultValue?: Optional<V>;
  disabled?: boolean;
};

type AutoCompleteField<N extends string = string> = BaseField<N> & {
  type: 'autocomplete';
  renderValue?: (value?: string) => string;
  renderMenuValue?: (value: string) => string;
  getOptions: (query: string) => Promise<Array<string>>;
};

type TextField<N extends string = string> = BaseField<N> & {
  type: 'text' | 'email' | 'password';
  rows?: number;
};

type DateField<N extends string = string> = BaseField<N> & {
  type: 'date';
};

type FileField<N extends string = string> = BaseField<N> & {
  type: 'file';
  caption?: string;
  accept?: string;
  onDrop: (file: File, mime: string) => DroppedRes;
};

type SelectField<N extends string = string> = BaseField<N> & {
  type: 'select';
  options: Array<{ label: string; value: string; disabled?: boolean }>;
};

type RadioField<N extends string = string> = BaseField<N> & {
  type: 'radio';
  options: Array<{ label: string; help?: string; value: string }>;
};

type Field<N extends string> =
  | TextField<N>
  | AutoCompleteField<N>
  | DateField<N>
  | FileField<N>
  | SelectField<N>
  | RadioField<N>;

type Section<N extends string> = {
  title: string;
  help?: string;
  fields: Array<Field<N>>;
};

export type Props<N extends string> = {
  sections: Array<Section<N>>;
  defaultValues?: Partial<{ [K in N]: string }>;
  submitting?: boolean;
};

export function UpsertForm<N extends string>(props: Props<N>) {
  return (
    <>
      <For each={props.sections}>
        {(section, si) => (
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
                  {(field, fieldI) => {
                    const id = createUniqueId();
                    return (
                      <div class:mt-5={fieldI() > 0}>
                        <Show when={field.type !== 'radio'}>
                          <label
                            class="block text-sm font-medium text-gray-700"
                            for={id}
                          >
                            {field.label}
                          </label>
                        </Show>
                        <Switch
                          fallback={
                            <Input
                              id={id}
                              name={field.name}
                              value={props.defaultValues?.[field.name] ?? ''}
                              type={field.type}
                              disabled={field.disabled ?? false}
                              class="mt-1"
                            />
                          }
                        >
                          <Match
                            when={
                              field.type === 'text' &&
                              typeof field.rows === 'number' &&
                              field
                            }
                            keyed
                          >
                            {(textAreaField) => (
                              <Textarea
                                id={id}
                                name={field.name}
                                value={props.defaultValues?.[field.name] ?? ''}
                                rows={textAreaField.rows ?? ''}
                                disabled={field.disabled ?? false}
                                class="mt-1"
                              />
                            )}
                          </Match>
                          <Match when={field.type === 'autocomplete' && field}>
                            {(autoCompleteField) => (
                              <AutoComplete
                                id={id}
                                name={field.name}
                                value={props.defaultValues?.[field.name] ?? ''}
                                renderValue={autoCompleteField().renderValue}
                                renderMenuValue={
                                  autoCompleteField().renderMenuValue
                                }
                                getOptions={autoCompleteField().getOptions}
                              />
                            )}
                          </Match>
                          <Match when={field.type === 'select' && field}>
                            <Select
                              id={id}
                              name={field.name}
                              value={props.defaultValues?.[field.name]}
                              options={(field as SelectField).options}
                              disabled={field.disabled ?? false}
                              class="mt-1"
                            />
                          </Match>
                          <Match when={field.type === 'radio' && field} keyed>
                            {(radioField) => (
                              <Radios
                                label={field.label}
                                id={id}
                                name={field.name}
                                options={radioField.options}
                                value={props.defaultValues?.[field.name]}
                                disabled={field.disabled ?? false}
                              />
                            )}
                          </Match>
                          <Match when={field.type === 'file' && field} keyed>
                            {(fileField) => (
                              <Dropzone
                                progressLabel={`${field.label} upload progress`}
                                caption={fileField.caption}
                                accept={fileField.accept}
                                onDrop={(field as FileField).onDrop}
                                disabled={field.disabled ?? false}
                              />
                            )}
                          </Match>
                        </Switch>
                      </div>
                    );
                  }}
                </For>
              </div>
            </section>
            <Show when={si() < props.sections.length - 1}>
              <hr class="my-10 border-t border-gray-200" />
            </Show>
          </>
        )}
      </For>
      <div class="pt-5">
        <div class="flex justify-end">
          <Button type="submit" disabled={props.submitting ?? false}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}
