import mapboxgl from 'mapbox-gl';
import {
  createSignal,
  onMount,
  For,
  Show,
  batch,
  createEffect,
} from 'solid-js';
import 'mapbox-gl/dist/mapbox-gl.css';
import invariant from 'tiny-invariant';
import type { ResultOf } from '../../util/graphql';
import type { churchesQuery } from '../../queries/churches';
import { easeOutExpo } from '../../util';
import LocationFilter, {
  murica,
  parsedCenter,
  parsedRange,
} from './filters/location';
import DenominationFilter, {
  parsedDenominations,
} from './filters/denomination';

mapboxgl.accessToken = import.meta.env.PUBLIC_MAPBOX_MAP_TOKEN;

export default function ChurchSearch() {
  const [map, setMap] = createSignal<mapboxgl.Map | null>(null);
  const [source, setSource] = createSignal<mapboxgl.AnySourceImpl | null>(null);
  let mapNode: HTMLDivElement;
  const [loading, setLoading] = createSignal(true);
  const [results, setResults] = createSignal<
    ResultOf<typeof churchesQuery>['search']['edges']
  >([]);

  createEffect(() => {
    const m = map();
    const s = source();
    const center = parsedCenter();

    if (m && s) {
      fetchData(center ? center : murica, parsedRange(), parsedDenominations());
    }
  });

  function updateData(data: GeoJSON.FeatureCollection<GeoJSON.Geometry>) {
    const s = source();
    invariant(s, 'Source not yet set up');

    if (s?.type === 'geojson') {
      s.setData(data);
    }
  }

  async function fetchData(
    c: [number, number] = murica,
    r: string = '100 mi',
    d: Array<string>,
  ) {
    const res = await fetch('/churches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ center: c ?? murica, range: r, denomination: d }),
    });

    const data = (await res.json()) as ResultOf<typeof churchesQuery>;

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: data.search.edges
        .map((e) => e.node)
        .filter(
          (
            n,
          ): n is Extract<
            ResultOf<typeof churchesQuery>['search']['edges'][number]['node'],
            { __typename: 'OrganizationSearchHit' }
          > => n.__typename === 'OrganizationSearchHit',
        )
        .map((node) => ({
          type: 'Feature' as const,
          properties: { id: node.id, title: node.name },
          geometry: {
            type: 'Point' as const,
            coordinates: [
              node.organization.addresses.edges[0].node.longitude ?? 0,
              node.organization.addresses.edges[0].node.latitude ?? 0,
            ],
          },
        })),
    };

    updateData(featureCollection);

    if (data.search.edges.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(c);

      data.search.edges.forEach((res) => {
        if (res.node.__typename === 'OrganizationSearchHit') {
          const node = res.node.organization.addresses.edges[0].node;
          if (node.longitude && node.latitude) {
            bounds.extend([node.longitude, node.latitude]);
          }
        }
      });

      map()?.fitBounds(bounds, {
        padding: 150,
        duration: 4000,
        easing: easeOutExpo,
        maxZoom: 9,
      });
    } else {
      map()?.easeTo({
        center: murica,
        zoom: 4,
        duration: 1000,
        easing: easeOutExpo,
      });
    }

    batch(() => {
      setLoading(false);
      setResults(data.search.edges);
    });
  }

  onMount(() => {
    const map = new mapboxgl.Map({
      container: mapNode,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: murica,
      zoom: 4,
    });

    setMap(map);

    map.on('load', () => {
      invariant(map, 'Map should be defined');

      map.setFog({
        range: [0.8, 8],
        color: '#FFFFFF',
        'horizon-blend': 0.5,
        'high-color': '#FEFEFE',
        'space-color': '#FFFFFF',
        'star-intensity': 0.15,
      });

      map.setLayoutProperty('poi-label', 'visibility', 'none'); // Hide the layer

      map.addSource('churches', {
        type: 'geojson',
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50, // defaults to 50
      });
      setSource(map.getSource('churches')!);

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'churches',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            // count < 100
            '#818cf8',
            100,
            // 100 <= count < 750
            '#a5b4fc',
            750,
            // count >= 750
            '#c7d2fe',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            // count < 100
            20,
            100,
            // 100 <= count < 750
            30,
            750,
            // count >= 750
            40,
          ],
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'churches',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'churches',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#6366f1',
          'circle-radius': 7,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });

      // inspect a cluster on click
      map.on('click', 'clusters', (e) => {
        invariant(map, 'Map should be defined');

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['clusters'],
        });
        const clusterId = features[0].properties?.cluster_id;
        const churches = source();

        if (churches?.type === 'geojson') {
          churches.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const geometry = features[0].geometry;

            if (map && geometry.type === 'Point') {
              map.easeTo({
                center: geometry.coordinates as [number, number],
                zoom: zoom,
              });
            }
          });
        }
      });

      map.on('click', 'unclustered-point', (e) => {
        const geometry = e.features?.[0].geometry;

        if (geometry?.type !== 'Point') {
          return;
        }

        const coordinates = geometry.coordinates.slice();

        // Ensure that if the map is zoomed out such that
        // multiple copies of the feature are visible, the
        // popup appears over the copy being pointed to.
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        invariant(map, 'Map should be defined');

        new mapboxgl.Popup()
          .setLngLat(coordinates as [number, number])
          .setHTML(e.features?.[0].properties?.title)
          .addTo(map);
      });

      map.on('mouseenter', 'clusters', () => {
        invariant(map, 'Map should be defined');
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'clusters', () => {
        invariant(map, 'Map should be defined');
        map.getCanvas().style.cursor = '';
      });
    });
  });

  return (
    <div class="relative grid w-full grid-cols-3">
      <div class="pointer-events-auto col-span-1 space-y-2 p-2">
        <div class="flex gap-2">
          <LocationFilter />
          <DenominationFilter />
        </div>
        <Show when={!loading()} fallback={<p>Loading</p>}>
          <For each={results()}>
            {(res) => (
              <div class="sm:flex">
                <div class="mb-4 flex-shrink-0 sm:mb-0 sm:mr-4">
                  <svg
                    class="h-32 w-full border border-gray-300 bg-white text-gray-300 sm:w-32"
                    preserveAspectRatio="none"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 200 200"
                    aria-hidden="true"
                  >
                    <path
                      vector-effect="non-scaling-stroke"
                      stroke-width="1"
                      d="M0 0l200 200M0 200L200 0"
                    />
                  </svg>
                </div>
                <div>
                  <h4 class="text-lg font-bold">
                    {'name' in res.node ? res.node.name : null}
                  </h4>
                  <p class="mt-1">
                    {'organization' in res.node
                      ? res.node.organization.addresses.edges[0].node
                          .streetAddress
                      : null}
                  </p>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
      <div class="sticky top-16 col-span-2 h-[calc(100vh-theme(spacing.16))]">
        <div class="h-full w-full rounded-b-md" ref={mapNode!} />
      </div>
    </div>
  );
}
