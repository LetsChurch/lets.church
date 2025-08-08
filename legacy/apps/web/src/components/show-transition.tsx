// Official transition group doesn't support Portal: https://github.com/solidjs/solid-transition-group/issues/8
// This is a Show-esque implementation of the same concept

import {
  createEffect,
  createSignal,
  Show,
  children,
  type JSX,
  type Setter,
} from 'solid-js';

function nextFrame(fn: () => unknown) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

export type Props = {
  when: boolean;
  children: (ref: Setter<HTMLElement | null>) => JSX.Element;
  classEnterBase: string;
  classEnterFrom: string;
  classEnterTo: string;
  classExitBase: string;
  classExitFrom: string;
  classExitTo: string;
};

export default function ShowTransition(props: Props) {
  const [ref, setRef] = createSignal<HTMLElement | null>(null);
  const [renderChildren, setRenderChildren] = createSignal(false);

  const resolved = children(() => renderChildren() && props.children(setRef));

  function doTransition(
    el: HTMLElement,
    entering: boolean,
    fromClasses: Array<string>,
    activeClasses: Array<string>,
    toClasses: Array<string>,
  ) {
    function endTransition(e?: Event) {
      if (!e || e.target === el) {
        el.removeEventListener('transitionend', endTransition);
        el.removeEventListener('animationend', endTransition);
        el.classList.remove(...activeClasses);
        el.classList.remove(...toClasses);
      }
      setRenderChildren(entering);
      if (!entering) {
        setRef(null);
      }
    }

    el.addEventListener('transitionend', endTransition);
    el.addEventListener('animationend', endTransition);

    el.classList.add(...fromClasses);
    el.classList.add(...activeClasses);
    nextFrame(() => {
      el.classList.remove(...fromClasses);
      el.classList.add(...toClasses);
    });
  }

  createEffect(() => {
    if (props.when && !ref()) {
      setRenderChildren(true);
    }
  });

  createEffect(() => {
    const el = ref();
    const when = props.when;
    if (el) {
      doTransition(
        el,
        when,
        ...(when
          ? ([
              props.classEnterFrom.split(' '),
              props.classEnterBase.split(' '),
              props.classEnterTo.split(' '),
            ] as const)
          : ([
              props.classExitFrom.split(' '),
              props.classExitBase.split(' '),
              props.classExitTo.split(' '),
            ] as const)),
      );
    }
  });

  return <Show when={renderChildren()}>{resolved()}</Show>;
}
