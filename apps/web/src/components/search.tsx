import { createEffect, createUniqueId, untrack } from 'solid-js';
import { useLocation, useMatch, useNavigate, useParams } from 'solid-start';
import debounce from 'just-debounce';
import SearchIcon from '@tabler/icons/search.svg?component-solid';

export default function Search() {
  const params = useParams<{ slug?: string }>();
  const loc = useLocation();
  const isChannelPage = useMatch(() => `/channel/${params.slug}`);
  const navigate = useNavigate();

  function onSearch(e: SubmitEvent | InputEvent) {
    if (e instanceof SubmitEvent) {
      e.preventDefault();
    }

    const newParams: { q: string; channels?: string } = {
      q:
        e.target instanceof HTMLFormElement
          ? (e.target.elements[0] as HTMLInputElement).value
          : (e.target as HTMLInputElement).value,
    };

    if (isChannelPage()) {
      newParams.channels = params.slug ?? '';
    }

    navigate(`/search?${new URLSearchParams(newParams).toString()}`, {
      replace: true,
    });
  }

  // Persist search in history every 2.5 seconds
  const navWithPersist = debounce((pathname: string, search: string) => {
    console.log('persist');
    navigate(`${pathname}${search}`, { replace: false });
  }, 2500);

  createEffect(() => {
    navWithPersist(loc.pathname, loc.search);
  });

  function defaultSearch() {
    const params = new URLSearchParams(untrack(() => loc.search));
    return params.get('q') ?? '';
  }

  const searchId = createUniqueId();

  return (
    <div class="w-full max-w-lg lg:max-w-xs">
      <label for={searchId} class="sr-only">
        Search
      </label>
      <div class="relative">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <SearchIcon class="h-5 w-5 text-gray-400" />
        </div>
        <form method="get" action="/search" onSubmit={onSearch}>
          <input
            id={searchId}
            name="q"
            class="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 leading-5 placeholder-gray-500 focus:border-indigo-500 focus:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            placeholder={`Search${isChannelPage() ? ' Channel' : ''}`}
            type="search"
            value={defaultSearch()}
            onInput={debounce((e) => onSearch(e), 100)}
          />
        </form>
      </div>
    </div>
  );
}
