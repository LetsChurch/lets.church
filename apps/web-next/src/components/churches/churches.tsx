import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  createSignal,
  onMount,
  For,
  batch,
  createEffect,
  Show,
} from 'solid-js';
import invariant from 'tiny-invariant';
import mapboxgl from 'mapbox-gl';
import { createMediaQuery } from '@solid-primitives/media';
import { Avatar } from '../avatar';
import { ChurchesDataQuery } from './__generated__/data';
import { getChurchesData } from './data';
import { cn, easeOutExpo } from '~/util';
import Searchbox, {
  murica,
  useParsedFilters,
  type Filters,
} from '~/components/churches/searchbox';

mapboxgl.accessToken = import.meta.env['VITE_MAPBOX_MAP_TOKEN'];

const unclusteredColor = '#6366f1';
const clusterSmallColor = '#818cf8';
const clusterMediumColor = '#a5b4fc';
const clusterLargeColor = '#c7d2fe';
const hoverColor = '#d946ef';

const unclusteredRadius = 7;
const unclusteredHoverRadius = 10;

export default function ChurchesApp(props: {
  embed?: boolean;
  hidden?: Array<string>;
}) {
  const [map, setMap] = createSignal<MapboxMap | null>(null);
  const [source, setSource] = createSignal<mapboxgl.AnySourceImpl | null>(null);
  let mapNode: HTMLDivElement;
  const [loading, setLoading] = createSignal(true);
  const [interacted, setInteracted] = createSignal(false);
  const [visibleIds, setVisibleIds] = createSignal<Set<string>>(new Set());
  const [results, setResults] = createSignal<
    ChurchesDataQuery['search']['edges']
  >([]);
  const isLarge = createMediaQuery('(min-width: 1024px)');

  const renderedResults = () => {
    const res = results();
    if (interacted()) {
      const vis = visibleIds();
      return res.filter((r) => vis.has(r.node.id));
    }

    return res;
  };

  const f = useParsedFilters();

  createEffect(() => {
    const m = map();
    const s = source();

    if (m && s) {
      fetchData(f());
    }
  });

  function updateData(data: GeoJSON.FeatureCollection<GeoJSON.Geometry>) {
    const s = source();
    invariant(s, 'Source not yet set up');

    if (s?.type === 'geojson') {
      setInteracted(false);
      s.setData(data);
    }
  }

  async function fetchData(f: Filters) {
    const data = await getChurchesData(f);

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features:
        data?.search.edges
          .map((e) => e.node)
          .filter(
            (
              n,
            ): n is Extract<
              ChurchesDataQuery['search']['edges'][number]['node'],
              { __typename: 'OrganizationSearchHit' }
            > => n.__typename === 'OrganizationSearchHit',
          )
          .map((node) => ({
            type: 'Feature' as const,
            properties: { id: node.id, title: node.name },
            geometry: {
              type: 'Point' as const,
              coordinates: [
                node.organization.addresses.edges[0]?.node.longitude ?? 0,
                node.organization.addresses.edges[0]?.node.latitude ?? 0,
              ],
            },
          })) ?? [],
    };

    updateData(featureCollection);

    if ((data?.search.edges.length ?? 0) > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(f.center);

      data?.search.edges.forEach((res) => {
        if (res.node.__typename === 'OrganizationSearchHit') {
          const node = res.node.organization.addresses.edges[0]?.node;
          if (node?.longitude && node.latitude) {
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
      setResults(data?.search.edges ?? []);
    });
  }

  onMount(() => {
    const map = new mapboxgl.Map({
      container: mapNode,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: murica,
      zoom: 4,
    });

    map.on('mousedown', () => setInteracted(true));
    map.on('touchstart', () => setInteracted(true));
    map.on('wheel', () => setInteracted(true));

    function getRenderedUnclusteredChurches() {
      const renderedPoints = map.queryRenderedFeatures(undefined, {
        layers: ['unclustered-point'],
      });

      const seen = new Set();

      return renderedPoints.filter((p) => {
        if (seen.has(p.properties?.['id'])) {
          return false;
        }

        seen.add(p.properties?.['id']);

        return true;
      });
    }

    async function getRenderedClusteredChurches() {
      const source = map.getSource('churches') as GeoJSONSource;
      const renderedClusters = map.queryRenderedFeatures(undefined, {
        layers: ['clusters'],
      });

      const clusterIds = Array.from(
        new Set(renderedClusters.map((f) => f.properties?.['cluster_id'])),
      );

      type ClusterPoints = Parameters<
        Parameters<(typeof source)['getClusterLeaves']>[3]
      >[1];

      const clusterPoints = await Promise.all(
        clusterIds.map(
          (id) =>
            new Promise<ClusterPoints>((resolve, reject) => {
              source.getClusterLeaves(id, 100, 0, (err, features) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(features);
                }
              });
            }),
        ),
      );

      return clusterPoints.flat();
    }

    map.on('moveend', async () => {
      setVisibleIds(
        new Set(
          [
            ...getRenderedUnclusteredChurches(),
            ...(await getRenderedClusteredChurches()),
          ].map((p) => p.properties?.['id']),
        ),
      );
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
        const clusterId = features[0]?.properties?.['cluster_id'];
        const churches = source();

        if (churches?.type === 'geojson') {
          churches.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const geometry = features[0]?.geometry;

            if (map && geometry?.type === 'Point') {
              map.easeTo({
                center: geometry.coordinates as [number, number],
                zoom: zoom,
              });
            }
          });
        }
      });

      map.on('click', 'unclustered-point', (e) => {
        const geometry = e.features?.[0]?.geometry;

        if (geometry?.type !== 'Point') {
          return;
        }

        const coordinates = geometry.coordinates.slice();

        // Ensure that if the map is zoomed out such that
        // multiple copies of the feature are visible, the
        // popup appears over the copy being pointed to.
        while (Math.abs(e.lngLat.lng - (coordinates?.[0] ?? 0)) > 180) {
          coordinates[0] += e.lngLat.lng > (coordinates[0] ?? 0) ? 360 : -360;
        }

        invariant(map, 'Map should be defined');

        new mapboxgl.Popup()
          .setLngLat(coordinates as [number, number])
          .setHTML(e.features?.[0]?.properties?.['title'])
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

  async function handleMouseEnter({
    node,
  }: ChurchesDataQuery['search']['edges'][number]) {
    invariant('organization' in node);
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

    const addr = node.organization.addresses.edges[0]?.node;

    if (isLarge()) {
      hoverPopup = new mapboxgl.Popup()
        .setLngLat([addr?.longitude as number, addr?.latitude as number]) // TODO: handle missing coords
        .setHTML(node.name)
        .addTo(m);
    }
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
    <div class="relative grid w-full auto-rows-min grid-cols-1 lg:grid-cols-3 lg:grid-rows-1">
      <div
        class={cn(
          'sticky z-10 row-span-1 h-[30vh] lg:order-2 lg:col-span-2',
          props.embed
            ? 'top-0 lg:h-screen'
            : 'top-16 lg:h-[calc(100vh-theme(spacing.16))]',
        )}
      >
        <div class="h-full w-full rounded-b-md" ref={mapNode!} />
      </div>
      <div class="pointer-events-auto row-span-1 space-y-2 p-2 lg:order-1 lg:col-span-1">
        <Searchbox hidden={props.hidden} />
        <Show when={!loading()} fallback={<p>Loading</p>}>
          <For each={renderedResults()}>
            {(res) => (
              <div
                class="relative rounded-md p-2 even:bg-gray-100 hover:bg-gray-200 sm:flex"
                onMouseEnter={[handleMouseEnter, res]}
                onMouseLeave={handleMouseLeave}
              >
                <div class="mb-4 flex-shrink-0 sm:mb-0 sm:mr-4">
                  <Avatar
                    size="2xl"
                    name={
                      'organization' in res.node
                        ? res.node.organization.name
                        : null
                    }
                  />
                </div>
                <div>
                  <h4 class="text-lg font-bold">
                    <a
                      href={`/churches/${'organization' in res.node ? res.node.organization.slug : null}`}
                      class="before:absolute before:inset-0"
                    >
                      {'name' in res.node ? res.node.name : null}
                    </a>
                  </h4>
                  <p class="mt-1">
                    {'organization' in res.node
                      ? res.node.organization.addresses.edges[0]?.node
                          .streetAddress
                      : null}
                  </p>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
