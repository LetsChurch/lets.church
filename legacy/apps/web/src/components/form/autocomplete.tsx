import { For, createSignal, splitProps, untrack } from 'solid-js';
import debounce from 'just-debounce';
import { useFloating } from 'solid-floating-ui';
import FloatingDiv from '../floating-div';
import Input, { type Props as InputProps } from './input';
import { cn } from '~/util';

export type Props = {
  value?: string;
  renderValue?: ((value?: string) => string) | undefined;
  renderMenuValue?: ((value: string) => string) | undefined;
  getOptions: (query: string) => Promise<Array<string>>;
} & Omit<InputProps, 'value' | 'onChange' | 'ref'>;

export default function AutoComplete(props: Props) {
  const [localProps, restProps] = splitProps(props, [
    'value',
    'renderValue',
    'renderMenuValue',
    'getOptions',
    'name',
  ]);

  const [value, setValue] = createSignal(untrack(() => localProps.value));
  const [renderedValue, setRenderedValue] = createSignal(
    untrack(() => localProps.value) ?? '',
  );
  const [options, setOptions] = createSignal<Array<string>>([]);
  const [open, setOpen] = createSignal(false);
  const [menuIdx, setMenuIdx] = createSignal(0);

  const [reference, setReference] = createSignal<HTMLInputElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'bottom-start',
  });

  const onInput = debounce(async (query: string) => {
    const newOptions = await untrack(() => localProps.getOptions)(query);
    setOptions(newOptions);
    setOpen(newOptions.length > 0);
    setMenuIdx(0);
  }, 200);

  function onSelect(value: string) {
    setOpen(false);
    setValue(value);
    setRenderedValue(localProps.renderValue?.(value) ?? value);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMenuIdx((i) => (i + 1) % options().length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuIdx((i) => (i - 1 + options().length) % options().length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = options()[menuIdx()];
      if (op) {
        onSelect(op);
      }
    }
  }

  return (
    <>
      <input type="hidden" name={localProps.name ?? ''} value={value() ?? ''} />
      <Input
        value={renderedValue()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={() => setOpen(options().length > 0)}
        onKeyDown={onKeyDown}
        ref={setReference}
        autocomplete="off"
        {...restProps}
      />
      <FloatingDiv
        ref={setFloating}
        open={open()}
        position={position}
        onClose={() => setOpen(false)}
        class="mt-1 space-y-2 p-2"
      >
        <For each={options()}>
          {(option, i) => (
            <button
              class={cn(
                'block rounded-md p-2',
                i() === menuIdx() && 'bg-gray-100',
              )}
              onClick={[onSelect, option]}
            >
              {localProps.renderMenuValue?.(option) ?? option}
            </button>
          )}
        </For>
      </FloatingDiv>
    </>
  );
}
