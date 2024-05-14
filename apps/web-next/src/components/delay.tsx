import {
  type ParentProps,
  Show,
  createSignal,
  type ComponentProps,
  onMount,
  onCleanup,
} from 'solid-js';

export function Delay(
  props: ParentProps<
    Pick<ComponentProps<typeof Show>, 'fallback'> & { ms?: number }
  >,
) {
  const [show, setShow] = createSignal(false);
  let timer: ReturnType<typeof setTimeout>;

  onMount(() => {
    timer = setTimeout(() => setShow(true), props.ms ?? 1000);
  });

  onCleanup(() => clearTimeout(timer));

  return (
    <Show when={show()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
}
