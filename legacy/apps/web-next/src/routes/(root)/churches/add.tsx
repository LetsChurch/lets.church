import { Show } from 'solid-js';
import HeadphonesIcon from '@tabler/icons/outline/headphones.svg?component-solid';
import ListSearchIcon from '@tabler/icons/outline/list-search.svg?component-solid';
import MapPinIcon from '@tabler/icons/outline/map-pin.svg?component-solid';
import { useUser } from '~/util/user-context';
import { useLoginLocation } from '~/util';

export default function AddChurchRoute() {
  const user = useUser();
  const loginLocation = useLoginLocation();

  return (
    <>
      <div class="py-24 sm:py-32">
        <div class="mx-auto max-w-7xl px-6 lg:px-8">
          <div class="mx-auto max-w-2xl lg:text-center">
            <h2 class="text-base font-semibold leading-7 text-indigo-600">
              Add your church
            </h2>
            <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Free Technology for Churches
            </p>
            <p class="mt-6 text-lg leading-8 text-gray-600">
              Join Let's Church and get sermon hosting and other resources 100%
              free&nbsp;of&nbsp;charge.
            </p>
          </div>
          <div class="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl class="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              <div class="flex flex-col">
                <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900 [&_svg]:text-indigo-600">
                  <HeadphonesIcon />
                  Free Sermon Hosting
                </dt>
                <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p class="flex-auto">
                    Unlimited audio and video hosting with unlimited bandwidth
                    and no ads.
                  </p>
                </dd>
              </div>
              <div class="flex flex-col">
                <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900 [&_svg]:text-indigo-600">
                  <ListSearchIcon />
                  Fully Searchable Transcripts
                </dt>
                <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p class="flex-auto">
                    Empower your congregation to find anything in your sermons
                    with fully-searchable transcripts.
                  </p>
                </dd>
              </div>
              <div class="flex flex-col">
                <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900 [&_svg]:text-indigo-600">
                  <MapPinIcon />
                  Visibility
                </dt>
                <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p class="flex-auto">
                    List your church and help people find and reach out to you.
                  </p>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-center gap-x-6">
        <Show
          when={user()}
          fallback={
            <a
              href={loginLocation}
              class="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Sign In
            </a>
          }
        >
          <a
            href={loginLocation}
            class="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Go to Profile
          </a>
        </Show>
      </div>
    </>
  );
}
