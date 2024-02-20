import LocationIcon from '@tabler/icons/map-2.svg?sprite-solid';
import GeoLocateIcon from '@tabler/icons/current-location.svg?sprite-solid';
import ClearIcon from '@tabler/icons/x.svg?sprite-solid';
import { createSignal, Show, For } from 'solid-js';
import { throttle } from '@solid-primitives/scheduled';
import { createAutofocus } from '@solid-primitives/autofocus';
import Filter from './base';

const mbAccessToken = import.meta.env.PUBLIC_MAPBOX_SEARCHBOX_TOKEN;
const sessionToken = window.crypto.randomUUID();

async function reverseGeocode([long, lat]: [number, number]): Promise<{
  features: Array<{ place_name: string }>;
}> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${long},${lat}.json?access_token=${mbAccessToken}`,
  );
  const json = await res.json();
  return json;
}

async function suggest(input: string): Promise<{
  suggestions: Array<{
    name: string;
    feature_type: string;
    address: string;
    full_address: string;
    place_formatted: string;
    mapbox_id: string;
  }>;
}> {
  const res = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(input)}&language=en&types=country,region,prefecture,postcode,district,place,city,locality,neighborhood,block,street,address&session_token=${sessionToken}&access_token=${mbAccessToken}`,
  );

  return res.json();
}

async function retrieve(id: string): Promise<{
  features: Array<{
    properties: { coordinates: { longitude: number; latitude: number } };
  }>;
}> {
  const res = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${id}?session_token=${sessionToken}&access_token=${mbAccessToken}`,
  );

  return res.json();
}

export default function LocationFilter(props: {
  setCenter: (coords: [number, number] | null) => unknown;
}) {
  const [inputEl, setInputEl] = createSignal<HTMLInputElement | null>(null);
  createAutofocus(inputEl);
  const [geocodeRes, setGeocodeRes] = createSignal<{ name: string } | null>(
    null,
  );
  type SearchRes = Array<{
    name: string;
    location: string;
    type: string;
    mapboxId: string;
  }>;
  const [searchRes, setSearchRes] = createSignal<SearchRes>([]);

  const handleInput = throttle(async (input: string) => {
    if (!input) {
      setSearchRes([]);
      return;
    }

    const res = await suggest(input);

    setSearchRes(
      res.suggestions.map((r) => ({
        name: r.name,
        location: r.place_formatted,
        type: r.feature_type,
        mapboxId: r.mapbox_id,
      })),
    );
  }, 200);

  async function onClickSuggestion([suggestion, closeFloat]: [
    SearchRes[number],
    () => unknown,
  ]) {
    const res = await retrieve(suggestion.mapboxId);
    const coordinates = res.features[0].properties.coordinates;
    props.setCenter([coordinates.longitude, coordinates.latitude]);
    setGeocodeRes({
      name: suggestion.location,
    });
    setSearchRes([]);
    closeFloat();
  }

  async function onGeoLocate(pos: GeolocationPosition) {
    props.setCenter([pos.coords.longitude, pos.coords.latitude]);
    const res = await reverseGeocode([
      pos.coords.longitude,
      pos.coords.latitude,
    ]);
    setGeocodeRes({ name: res.features[0].place_name });
  }

  function reset() {
    props.setCenter(null);
    setGeocodeRes(null);
    setSearchRes([]);
    const ie = inputEl();
    if (ie) {
      ie.value = '';
      ie.focus();
    }
  }

  const label = () => geocodeRes()?.name ?? 'Location';

  return (
    <Filter label={label()} Icon={LocationIcon}>
      {(closeFloat) => (
        <div
          class="max-w-64"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              reset();
              closeFloat();
            }
          }}
        >
          <div class="relative rounded-md shadow-sm">
            <input
              type="text"
              name="account-number"
              id="account-number"
              class="block w-full rounded-md border-0 py-1.5 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder={label()}
              onInput={(e) => handleInput(e.target.value)}
              ref={setInputEl}
              autofocus
            />
            <Show
              when={geocodeRes()}
              fallback={
                <button
                  class="absolute inset-y-0 right-0 -mr-2 flex items-center pr-3 [&_svg]:scale-75 [&_svg]:text-gray-400"
                  onClick={() =>
                    navigator.geolocation.getCurrentPosition(onGeoLocate)
                  }
                >
                  <GeoLocateIcon />
                </button>
              }
            >
              <button
                class="absolute inset-y-0 right-0 -mr-2 flex items-center pr-3 [&_svg]:scale-75 [&_svg]:text-gray-400"
                onClick={() => {
                  reset();
                  closeFloat();
                }}
              >
                <ClearIcon />
              </button>
            </Show>
          </div>
          <Show when={searchRes()?.length > 0}>
            <ul class="mt-2">
              <For each={searchRes()}>
                {(res) => (
                  <li
                    role="button"
                    onClick={[onClickSuggestion, [res, closeFloat]]}
                  >
                    <div class="flex gap-2 [&_svg]:shrink-0">
                      <LocationIcon />
                      <dl class="min-w-0">
                        <dt class="block overflow-hidden text-ellipsis whitespace-nowrap font-bold">
                          {res.name}
                        </dt>
                        <dd class="block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-950">
                          {res.location}
                        </dd>
                      </dl>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      )}
    </Filter>
  );
}
