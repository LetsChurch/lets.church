import type { JSX } from 'solid-js';

export type Props = JSX.IntrinsicElements['input'];

export default function Input(props: Props) {
  return (
    <input
      {...props}
      class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
    />
  );
}
