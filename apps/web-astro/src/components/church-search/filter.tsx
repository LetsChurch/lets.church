import ChevronDownIcon from '@tabler/icons/chevron-down.svg?sprite-solid';
import { useFloating } from 'solid-floating-ui';
import { shift, offset } from '@floating-ui/dom';
import { createSignal, createUniqueId, type ParentProps } from 'solid-js';
import FloatingDiv from '../floating-div';

export default function Filter(props: ParentProps<{ label: string }>) {
  const [showFloat, setShowFloat] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [float, setFloat] = createSignal<HTMLDivElement>();

  const position = useFloating(reference, float, {
    placement: 'bottom-start',
    middleware: [shift(), offset(4)],
  });

  function toggleFloat() {
    setShowFloat((show) => !show);
  }

  function closeFloat() {
    setShowFloat(false);
  }

  const buttonId = createUniqueId();

  return (
    <>
      <button
        id={buttonId}
        type="button"
        class="inline-flex justify-center gap-x-1.5 rounded-md bg-white px-3 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 [&_svg]:-ml-1 [&_svg]:-mr-2 [&_svg]:scale-75 [&_svg]:text-gray-400"
        aria-expanded={showFloat()}
        aria-haspopup="true"
        ref={setReference}
        onClick={toggleFloat}
      >
        {props.label}
        <ChevronDownIcon />
      </button>
      <FloatingDiv
        ref={setFloat}
        position={position}
        open={showFloat()}
        aria-labelledby={buttonId}
        onClose={closeFloat}
        class="rounded-md p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
      >
        {props.children}
      </FloatingDiv>
    </>
  );
}
