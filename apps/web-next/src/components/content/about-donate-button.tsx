import P from './p';

export default function AboutDonateButton() {
  return (
    <P class="flex justify-center">
      <a
        href="https://givebutter.com/LetsChurch"
        class="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white no-underline shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        target="_blank"
      >
        Donate to Let's Church
      </a>
    </P>
  );
}
