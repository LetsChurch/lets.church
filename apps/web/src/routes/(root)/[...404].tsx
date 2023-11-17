import { A } from 'solid-start';

export default function NotFound() {
  return (
    <div class="min-h-full bg-white px-4 py-16 sm:px-6 sm:py-24 md:grid md:place-items-center lg:px-8">
      <Title>Not Found | Let's Church</Title>
      <HttpStatusCode code={404} />
      <div class="mx-auto max-w-max">
        <main class="sm:flex">
          <p class="text-4xl font-bold tracking-tight text-indigo-600 sm:text-5xl">
            404
          </p>
          <div class="sm:ml-6">
            <div class="sm:border-l sm:border-gray-200 sm:pl-6">
              <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                Page not found
              </h1>
              <p class="mt-1 text-base text-gray-500">
                Please check the URL in the address bar and try again.
              </p>
            </div>
            <div class="mt-10 flex space-x-3 sm:border-l sm:border-transparent sm:pl-6">
              <A
                href="#"
                class="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Go back home
              </A>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
