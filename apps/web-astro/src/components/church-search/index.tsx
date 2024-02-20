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
import LocationFilter from './filters/location';

const murica = [-97.9222112121185, 39.3812661305678] as [number, number];

mapboxgl.accessToken = import.meta.env.PUBLIC_MAPBOX_MAP_TOKEN;

export default function ChurchSearch() {
  let map: mapboxgl.Map | null = null;
  let mapNode: HTMLDivElement;
  const [loading, setLoading] = createSignal(true);
  const [results, setResults] = createSignal<
    ResultOf<typeof churchesQuery>['search']['edges']
  >([]);

  const [center, setCenter] = createSignal<[number, number] | null>(murica);

  createEffect(() => {
    const c = center();

    if (c) {
      map?.easeTo({ center: c, duration: 4000, zoom: 7 });
    } else {
      map?.easeTo({ center: murica, duration: 1000, zoom: 4 });
    }
  });

  function updateData(data: GeoJSON.FeatureCollection<GeoJSON.Geometry>) {
    const source = map?.getSource('churches');
    invariant(source, 'Source not yet set up');

    if (source?.type === 'geojson') {
      source.setData(data);
    }
  }

  async function fetchData() {
    const res = await fetch('', { method: 'POST' });
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

    batch(() => {
      setLoading(false);
      setResults(data.search.edges);
    });
  }

  onMount(() => {
    map = new mapboxgl.Map({
      container: mapNode,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: murica,
      zoom: 4,
    });

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
        const churches = map.getSource('churches');

        if (churches.type === 'geojson') {
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

      fetchData();
    });
  });

  return (
    <div class="relative grid w-full grid-cols-3">
      <div class="pointer-events-auto col-span-1 space-y-2 p-2">
        <div>
          <LocationFilter setCenter={setCenter} />
        </div>
        <Show when={!loading()} fallback={<p>Loading</p>}>
          <For each={results()}>
            {(res) => (
              <div class="flex h-20 w-full items-center justify-center rounded-md bg-gray-200">
                {'name' in res.node ? res.node.name : null}
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
