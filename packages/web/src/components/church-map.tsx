import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import { invariant } from 'es-toolkit';
import mapboxgl from 'mapbox-gl';
import type { ParsedFilters } from '@/routes/_main/churches';
import { getInitialTheme, THEME_CHANGE_EVENT } from '@/stores/theme';
import { useTRPC } from '@/trpc/react';

type ChurchSearchResult = {
  items: Array<{
    id: string;
    name: string;
    addresses: Array<{
      latitude: number | null;
      longitude: number | null;
      locality: string | null;
      region: string | null;
    }>;
  }>;
};

const unclusteredColor = '#6366f1';
const clusterSmallColor = '#818cf8';
const clusterMediumColor = '#a5b4fc';
const clusterLargeColor = '#c7d2fe';
const _hoverColor = '#d946ef';

const unclusteredRadius = 7;
const _unclusteredHoverRadius = 10;

type ChurchMapProps = {
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  filters: ParsedFilters;
  churchData?: ChurchSearchResult;
};

export function ChurchMap({ padding, filters, churchData }: ChurchMapProps) {
  const ref = useRef(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const trpc = useTRPC();
  const [theme, setTheme] = useState(getInitialTheme());

  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  // Listen for theme changes
  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: 'light' | 'dark' }>;
      setTheme(customEvent.detail.theme);
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () =>
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    if (env?.MAPBOX_MAP_TOKEN && ref.current) {
      mapboxgl.accessToken = env.MAPBOX_MAP_TOKEN;

      mapRef.current = new mapboxgl.Map({
        container: ref.current,
        center: [-98.5795, 39.8283], // Geographic center of contiguous USA
        zoom: 3.5,
        style:
          theme === 'dark'
            ? 'mapbox://styles/letschurch/cmiqubq4r001h01qk8xaaeh6q'
            : undefined,
      });

      mapRef.current.on('load', () => {
        const map = mapRef.current;
        invariant(map, 'Failed to get map reference');

        const fogConfig =
          theme === 'dark'
            ? {
                range: [0.8, 8] as [number, number],
                color: '#0a0a0a',
                'horizon-blend': 0.5,
                'high-color': '#050505',
                'space-color': '#000000',
                'star-intensity': 0.15,
              }
            : {
                range: [0.8, 8] as [number, number],
                color: '#e8e8e8',
                'horizon-blend': 0.5,
                'high-color': '#f0f0f0',
                'space-color': '#e5e5e5',
                'star-intensity': 0.15,
              };

        map.setFog(fogConfig);
        map.setLayoutProperty('poi-label', 'visibility', 'none'); // Hide the layer

        if (padding) {
          map.setPadding(padding);
        }

        map.addSource('churches', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50, // defaults to 50
        });
        const source = map.getSource('churches');
        // setSource(m.getSource('churches')!);

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
        map.on('click', 'clusters', (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters'],
          });
          const clusterId = features[0]?.properties?.cluster_id;

          if (source?.type === 'geojson') {
            source.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err) return;
              const geometry = features[0]?.geometry;

              if (geometry?.type === 'Point') {
                map.easeTo({
                  center: geometry.coordinates as [number, number],
                  zoom: zoom ?? 1,
                  padding,
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
            coordinates[0] =
              (coordinates[0] ?? 0) + e.lngLat.lng > (coordinates[0] ?? 0)
                ? 360
                : -360;
          }

          invariant(mapRef, 'Map should be defined');

          new mapboxgl.Popup()
            .setLngLat(coordinates as [number, number])
            .setHTML(e.features?.[0]?.properties?.title)
            .addTo(map);
        });

        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = '';
        });
      });

      return () => mapRef.current?.remove();
    }
  }, [env, padding, theme]);

  // Update padding when it changes and resize map
  useEffect(() => {
    if (mapRef.current && padding) {
      // Use a small delay to allow the DOM to update before resizing
      const timeoutId = setTimeout(() => {
        mapRef.current?.resize();
        mapRef.current?.setPadding(padding);
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [padding]);

  // Listen for window resize events to resize the map
  useEffect(() => {
    if (!mapRef.current) return;

    const handleResize = () => {
      mapRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update map data when church data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !churchData) return;

    // Wait for map to be loaded before updating source
    const updateSource = () => {
      const source = map.getSource('churches');
      if (!source || source.type !== 'geojson') return;

      // Transform church data to GeoJSON format
      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: churchData.items.map((church) => {
          const address = church.addresses[0];
          return {
            type: 'Feature',
            properties: {
              id: church.id,
              title: church.name,
            },
            geometry: {
              type: 'Point',
              coordinates: [address?.longitude ?? 0, address?.latitude ?? 0],
            },
          };
        }),
      };

      // Update the source data
      source.setData(featureCollection);

      // Fit bounds to show all churches if there are results
      if (churchData.items.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend(filters.center);

        churchData.items.forEach((church) => {
          const address = church.addresses[0];
          if (address?.longitude && address?.latitude) {
            bounds.extend([address.longitude, address.latitude]);
          }
        });

        map.fitBounds(bounds, {
          padding: padding ?? { top: 150, bottom: 150, left: 150, right: 150 },
          duration: 2000,
          maxZoom: 9,
        });
      } else if (churchData.items.length === 0) {
        // If no results, center on the search location
        map.easeTo({
          center: filters.center,
          zoom: 4,
          duration: 1000,
          padding,
        });
      }
    };

    if (map.loaded()) {
      updateSource();
    } else {
      map.once('load', updateSource);
    }
  }, [churchData, filters, padding]);

  return <div ref={ref} className="size-full" />;
}
