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
import Searchbox, { murica, parsedFilters, type Filters } from './searchbox';

mapboxgl.accessToken = import.meta.env.PUBLIC_MAPBOX_MAP_TOKEN;

const unclusteredColor = '#6366f1';
const clusterSmallColor = '#818cf8';
const clusterMediumColor = '#a5b4fc';
const clusterLargeColor = '#c7d2fe';
const hoverColor = '#d946ef';

const unclusteredRadius = 7;
const unclusteredHoverRadius = 10;

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
    const f = parsedFilters();

    if (m && s) {
      fetchData(f);
    }
  });

  function updateData(data: GeoJSON.FeatureCollection<GeoJSON.Geometry>) {
    const s = source();
    invariant(s, 'Source not yet set up');

    if (s?.type === 'geojson') {
      s.setData(data);
    }
  }

  async function fetchData(f: Filters) {
    const res = await fetch('/churches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
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
      bounds.extend(f.center);

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
            clusterSmallColor,
            100,
            // 100 <= count < 750
            clusterMediumColor,
            750,
            // count >= 750
            clusterLargeColor,
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
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#fff',
        },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'churches',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': unclusteredColor,
          'circle-radius': unclusteredRadius,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });

      // inspect a cluster on click
      // eslint-disable-next-line solid/reactivity
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

  let hoverPopup: mapboxgl.Popup | null = null;

  function handleMouseEnter({
    node,
  }: ResultOf<typeof churchesQuery>['search']['edges'][number]) {
    invariant('id' in node);
    const m = map();
    invariant(m, 'Map should be defined');

    m.setPaintProperty('unclustered-point', 'circle-color', [
      'case',
      ['==', ['get', 'id'], node.id], // Check if it's the hovered feature
      hoverColor, // If it is, set the color to the hover color
      unclusteredColor, // Otherwise, set the color to the default color
    ]);

    m.setPaintProperty('unclustered-point', 'circle-radius', [
      'case',
      ['==', ['get', 'id'], node.id], // Check if it's the hovered feature
      unclusteredHoverRadius, // If it is, set the radius larger
      unclusteredRadius, // Otherwise, set the radius to the default
    ]);

    if (hoverPopup?.isOpen()) {
      hoverPopup.remove();
    }

    const addr = node.organization.addresses.edges[0].node;
    hoverPopup = new mapboxgl.Popup()
      .setLngLat([addr.longitude as number, addr.latitude as number]) // TODO: handle missing coords
      .setHTML(node.name)
      .addTo(m);
  }

  function handleMouseLeave() {
    map()?.setPaintProperty(
      'unclustered-point',
      'circle-color',
      unclusteredColor,
    );

    map()?.setPaintProperty(
      'unclustered-point',
      'circle-radius',
      unclusteredRadius,
    );

    if (hoverPopup?.isOpen()) {
      hoverPopup.remove();
    }
  }

  return (
    <div class="relative grid w-full grid-cols-3">
      <div class="pointer-events-auto col-span-1 space-y-2 p-2">
        <Searchbox />
        <Show when={!loading()} fallback={<p>Loading</p>}>
          <For each={results()}>
            {(res) => (
              <div
                class="sm:flex"
                onMouseEnter={[handleMouseEnter, res]}
                onMouseLeave={handleMouseLeave}
              >
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
