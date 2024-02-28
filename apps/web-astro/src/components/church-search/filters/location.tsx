import LocationIcon from '@tabler/icons/map-2.svg?sprite-solid';
import MountainIcon from '@tabler/icons/mountain.svg?sprite-solid';
import BuildingIcon from '@tabler/icons/building-skyscraper.svg?sprite-solid';
import RoadIcon from '@tabler/icons/road.svg?sprite-solid';
import MailIcon from '@tabler/icons/mail.svg?sprite-solid';
import MapPinIcon from '@tabler/icons/map-pin.svg?sprite-solid';
import GeoLocateIcon from '@tabler/icons/current-location.svg?sprite-solid';
import ClearIcon from '@tabler/icons/x.svg?sprite-solid';
import { createSignal, Show, For, Switch, Match, onMount } from 'solid-js';
import { throttle } from '@solid-primitives/scheduled';
import { createAutofocus } from '@solid-primitives/autofocus';
import { pushQueryParams, query } from '../../../util/history';
import Filter from './base';

export const murica = [-97.9222112121185, 39.3812661305678] as [number, number];

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

export const parsedCenter = (): [number, number] =>
  (query().get('center')?.split(',').map(parseFloat).slice(0, 2) as [
    number,
    number,
  ]) ?? murica;

export const parsedRange = () => query().get('range') ?? '100 mi';

const setCenter = (center: [number, number] | null) =>
  pushQueryParams({ center: center?.join(',') ?? null });

const setRange = (range: string) => pushQueryParams({ range });

export default function LocationFilter() {
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
    setCenter([coordinates.longitude, coordinates.latitude]);
    setGeocodeRes({
      name: suggestion.location,
    });
    setSearchRes([]);
    closeFloat();
  }

  async function onGeoLocate(pos: GeolocationPosition) {
    setCenter([pos.coords.longitude, pos.coords.latitude]);
    const res = await reverseGeocode([
      pos.coords.longitude,
      pos.coords.latitude,
    ]);
    setGeocodeRes({ name: res.features[0].place_name });
  }

  onMount(async () => {
    const center = parsedCenter();
    if (center) {
      const res = await reverseGeocode(center);
      setGeocodeRes({ name: res.features[0].place_name });
    }
  });

  function reset() {
    setCenter(null);
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
            <div class="absolute inset-y-0 left-0 flex items-center">
              <select
                name="range"
                aria-label="Range"
                class="h-full rounded-md border-0 bg-transparent py-0 pl-3 pr-7 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                onChange={(e) => setRange(e.target.value)}
                value={parsedRange()}
              >
                <option>5 mi</option>
                <option>10 mi</option>
                <option>25 mi</option>
                <option>50 mi</option>
                <option>100 mi</option>
                <option>200 mi</option>
                <option>500 mi</option>
                <option>1000 mi</option>
              </select>
            </div>
            <input
              type="text"
              name="location"
              class="block w-full rounded-md border-0 py-1.5 pl-24 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
                      <Switch fallback={<LocationIcon />}>
                        <Match when={res.type === 'place'}>
                          <MapPinIcon />
                        </Match>
                        <Match
                          when={res.type === 'country' || res.type === 'region'}
                        >
                          <MountainIcon />
                        </Match>
                        <Match
                          when={
                            res.type === 'city' ||
                            res.type === 'locality' ||
                            res.type === 'neighborhood'
                          }
                        >
                          <BuildingIcon />
                        </Match>
                        <Match
                          when={
                            res.type === 'block' ||
                            res.type === 'street' ||
                            res.type === 'address'
                          }
                        >
                          <RoadIcon />
                        </Match>
                        <Match when={res.type === 'postcode'}>
                          <MailIcon />
                        </Match>
                      </Switch>
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
