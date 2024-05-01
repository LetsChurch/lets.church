import { useSearchParams } from '@solidjs/router';
import { clientOnly } from '@solidjs/start';

const Client = clientOnly(async () => {
  return import('~/components/churches/churches');
});

export default function ChurchesRoute() {
  const [searchParams] = useSearchParams();

  const hidden = searchParams['hidden']?.split(',') ?? [];

  return (
    <Client
      embed
      hidden={hidden}
      fallback={
        <div class="mx-auto mt-16 max-w-2xl text-center">
          <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Loading
          </h1>
          <p class="mt-6 text-lg leading-8 text-gray-600">
            "It is the glory of God to conceal a matter and the glory of kings
            to search it out."
            <br />- Proverbs 25:2 (BSB)
          </p>
        </div>
      }
    />
  );
}
