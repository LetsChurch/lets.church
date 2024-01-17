import { component$, useId, useSignal, useTask$ } from "@builder.io/qwik";
import {
  computePosition,
  offset,
  flip,
  shift,
  autoUpdate,
} from "@floating-ui/dom";
import Avatar from "./avatar";

export default component$(() => {
  const menuButtonId = useId();
  const menuOpen = useSignal(false);
  const buttonRef = useSignal<HTMLElement>();
  const menuRef = useSignal<HTMLElement>();

  useTask$(async ({ track, cleanup }) => {
    track(() => menuOpen.value && menuRef.value);

    async function update() {
      if (menuOpen.value && buttonRef.value && menuRef.value) {
        const { x, y } = await computePosition(buttonRef.value, menuRef.value, {
          placement: "bottom-end",
          middleware: [offset(6), flip(), shift({ padding: 5 })],
        });
        menuRef.value.style.left = `${x}px`;
        menuRef.value.style.top = `${y}px`;
      }
    }

    if (menuOpen.value && buttonRef.value && menuRef.value) {
      const clean = autoUpdate(buttonRef.value, menuRef.value, update);
      cleanup(() => clean());
    }
  });

  return (
    <>
      <button
        type="button"
        class="flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        id={menuButtonId}
        aria-expanded={menuOpen.value}
        aria-haspopup="true"
        ref={buttonRef}
        onClick$={() => void (menuOpen.value = !menuOpen.value)}
      >
        <span class="sr-only">Open user menu</span>
        <Avatar src="" size="sm" />
      </button>
      {menuOpen.value ? (
        <div
          ref={menuRef}
          class="absolute z-50 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none "
          document:onClick$={(e) => {
            if (
              e.target instanceof Node &&
              !menuRef.value?.contains(e.target) &&
              !e.defaultPrevented
            ) {
              menuOpen.value = false;
            }
          }}
        >
          menu
        </div>
      ) : null}
    </>
  );
});
