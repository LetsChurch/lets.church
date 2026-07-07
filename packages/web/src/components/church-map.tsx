import { useQuery } from '@tanstack/react-query';

import 'mapbox-gl/dist/mapbox-gl.css';
import { invariant } from 'es-toolkit';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';

import type { ParsedFilters } from '@/routes/_main/churches';
import { getInitialTheme, THEME_CHANGE_EVENT } from '@/stores/theme';
import { useTRPC } from '@/trpc/react';
import { escapeHtml } from '@/util/html-escape';
import { getInitials } from '@/util/misc';
import { safeHttpHref } from '@/util/safe-url';

type ChurchDatum = {
  items: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatarUrl: string | null;
    primaryEmail: string | null;
    primaryPhoneNumber: string | null;
    websiteUrl: string | null;
    addresses: Array<{
      latitude: number | null;
      longitude: number | null;
      locality: string | null;
      region: string | null;
      streetAddress: string | null;
      postalCode: string | null;
      country: string | null;
    }>;
    tags: Array<{
      category: string;
      color: string;
      label: string;
      slug: string;
    }>;
  }>;
};

const unclusteredColor = '#6366f1';
const clusterSmallColor = '#818cf8';
const clusterMediumColor = '#a5b4fc';
const clusterLargeColor = '#c7d2fe';

const unclusteredRadius = 7;

function getTagColorClass(color: string): string {
  switch (color) {
    case 'BLUE':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
    case 'GREEN':
      return 'bg-green-500/10 text-green-700 dark:text-green-300';
    case 'RED':
      return 'bg-red-500/10 text-red-700 dark:text-red-300';
    case 'INDIGO':
      return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
    case 'PINK':
      return 'bg-pink-500/10 text-pink-700 dark:text-pink-300';
    case 'PURPLE':
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-300';
    case 'GRAY':
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
  }
}

function buildPopupHTML(properties: {
  title?: string;
  slug?: string;
  description?: string;
  avatarUrl?: string;
  address?: string;
  primaryEmail?: string;
  primaryPhoneNumber?: string;
  websiteUrl?: string;
  tags?: string;
}): string {
  const {
    title,
    slug,
    description,
    avatarUrl,
    address,
    primaryEmail,
    primaryPhoneNumber,
    websiteUrl,
    tags,
  } = properties;

  if (!title || !slug) return '';

  // The slug is interpolated into href path segments below; encode it so a
  // stored value containing quotes/markup can't break out of the attribute.
  const slugPath = encodeURIComponent(slug);
  // Drop non-http(s) website URLs (e.g. `javascript:`) before they reach href.
  const safeWebsiteUrl = safeHttpHref(websiteUrl);

  let parsedTags: Array<{ label: string; color: string }> = [];
  if (tags) {
    try {
      parsedTags = JSON.parse(tags);
    } catch {
      // ignore parse errors
    }
  }

  const initials = getInitials(title, 2);

  const truncatedDescription =
    description && description.length > 120
      ? `${description.slice(0, 120)}...`
      : description;

  return `
    <div class="min-w-[280px] max-w-[320px] p-4 bg-white dark:bg-zinc-900 rounded-xl border-fancy-pants">
      <a href="/churches/${slugPath}" class="block hover:opacity-90 transition-opacity">
        <div class="flex items-center gap-3 mb-3">
          ${
            avatarUrl
              ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(title)}" class="w-12 h-12 rounded-full object-cover" />`
              : `<div class="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">${escapeHtml(initials)}</div>`
          }
          <h3 class="font-bold text-lg text-gray-900 dark:text-white leading-tight flex-1">${escapeHtml(title)}</h3>
        </div>
      </a>

      ${truncatedDescription ? `<p class="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">${escapeHtml(truncatedDescription)}</p>` : ''}

      ${
        parsedTags.length > 0
          ? `<div class="flex flex-wrap gap-1 mb-3">${parsedTags
              .slice(0, 3)
              .map(
                (tag) =>
                  `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${getTagColorClass(tag.color)}">${escapeHtml(tag.label)}</span>`,
              )
              .join('')}</div>`
          : ''
      }

      ${address ? `<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${escapeHtml(address)}</p>` : ''}

      <div class="space-y-1.5 mb-3">
        ${primaryEmail ? `<a href="mailto:${escapeHtml(primaryEmail)}" class="block text-sm text-indigo-600 hover:underline dark:text-white">${escapeHtml(primaryEmail)}</a>` : ''}
        ${primaryPhoneNumber ? `<a href="tel:${escapeHtml(primaryPhoneNumber)}" class="block text-sm text-indigo-600 hover:underline dark:text-white">${escapeHtml(primaryPhoneNumber)}</a>` : ''}
        ${safeWebsiteUrl ? `<a href="${escapeHtml(safeWebsiteUrl)}" target="_blank" rel="noopener noreferrer" class="block text-sm text-indigo-600 hover:underline dark:text-white">${escapeHtml(safeWebsiteUrl.replace(/^https?:\/\//, ''))}</a>` : ''}
      </div>

      <a href="/churches/${slugPath}" class="block w-full text-center bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors text-sm">
        See Church
      </a>
    </div>
  `;
}

type ChurchMapProps = {
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  filters: ParsedFilters;
  churchData?: ChurchDatum;
  isEmbed?: boolean;
  debug?: boolean;
};

export function ChurchMap({
  padding,
  filters,
  churchData,
  isEmbed = false,
  debug = false,
}: ChurchMapProps) {
  const ref = useRef(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const trpc = useTRPC();
  const [theme, setTheme] = useState(isEmbed ? 'light' : getInitialTheme());
  const [vanishingPoint, setVanishingPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  // Inject custom popup styles
  useEffect(() => {
    const styleId = 'church-map-popup-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .church-map-popup .mapboxgl-popup-content {
          padding: 0;
          border-radius: 0.75rem;
          overflow: visible;
        }

        .church-map-popup .mapboxgl-popup-close-button {
          display: none;
        }

        .church-map-popup .mapboxgl-popup-tip {
          display: none;
        }

        :root[data-theme="dark"] .church-map-popup .mapboxgl-popup-content {
          background-color: #18181b !important;
          color: #fafafa !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Listen for theme changes (skip for embed routes - they're always light)
  useEffect(() => {
    if (isEmbed) return;

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: 'light' | 'dark' }>;
      setTheme(customEvent.detail.theme);
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () =>
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, [isEmbed]);

  // Listen for escape key to close popup
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

        // Hide poi-label layer if it exists in the style
        if (map.getLayer('poi-label')) {
          map.setLayoutProperty('poi-label', 'visibility', 'none');
        }

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
            // Controls the intensity of light emitted from the circles (0+, default 0)
            // Higher values make circles glow brighter, primarily useful in dark mode
            'circle-emissive-strength': 1,
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
            // Controls the intensity of light emitted from the circles (0+, default 0)
            // Higher values make circles glow brighter, primarily useful in dark mode
            'circle-emissive-strength': 1,
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

          const properties = e.features?.[0]?.properties;

          if (properties) {
            const popupHTML = buildPopupHTML(properties);
            if (popupHTML) {
              // Close existing popup if any
              if (popupRef.current) {
                popupRef.current.remove();
              }

              // Create and store new popup
              popupRef.current = new mapboxgl.Popup({
                maxWidth: '360px',
                className: 'church-map-popup',
                closeOnClick: true,
                anchor: 'bottom',
                offset: 15,
              })
                .setLngLat(coordinates as [number, number])
                .setHTML(popupHTML)
                .addTo(map);

              // Clear ref when popup is closed
              popupRef.current.on('close', () => {
                popupRef.current = null;
              });
            }
          }
        });

        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('mouseenter', 'unclustered-point', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'unclustered-point', () => {
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

  // Calculate vanishing point for debug visualization
  useEffect(() => {
    if (!debug || !ref.current) return;

    const updateVanishingPoint = () => {
      const container = ref.current as HTMLElement | null;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const padLeft = padding?.left ?? 0;
      const padRight = padding?.right ?? 0;
      const padTop = padding?.top ?? 0;
      const padBottom = padding?.bottom ?? 0;

      // Vanishing point is the center of the viewport after accounting for padding
      const x = (rect.width - padLeft - padRight) / 2 + padLeft;
      const y = (rect.height - padTop - padBottom) / 2 + padTop;

      setVanishingPoint({ x, y });
    };

    updateVanishingPoint();
    window.addEventListener('resize', updateVanishingPoint);
    return () => window.removeEventListener('resize', updateVanishingPoint);
  }, [debug, padding]);

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
          const addressLine = [
            address?.streetAddress,
            [address?.locality, address?.region].filter(Boolean).join(', '),
          ]
            .filter(Boolean)
            .join(', ');

          return {
            type: 'Feature',
            properties: {
              id: church.id,
              title: church.name,
              slug: church.slug,
              description: church.description,
              avatarUrl: church.avatarUrl,
              address: addressLine,
              primaryEmail: church.primaryEmail,
              primaryPhoneNumber: church.primaryPhoneNumber,
              websiteUrl: church.websiteUrl,
              tags: JSON.stringify(church.tags),
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

  return (
    <div className="relative size-full">
      <div ref={ref} className="size-full" />
      {debug && vanishingPoint ? (
        <>
          {/* Vertical line */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: `${vanishingPoint.x}px` }}
          />
          {/* Horizontal line */}
          <div
            className="pointer-events-none absolute right-0 left-0 h-px bg-red-500"
            style={{ top: `${vanishingPoint.y}px` }}
          />
          {/* Center circle */}
          <div
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-500 bg-red-500/20"
            style={{
              left: `${vanishingPoint.x}px`,
              top: `${vanishingPoint.y}px`,
            }}
          />
          {/* Label */}
          <div
            className="pointer-events-none absolute -translate-y-full bg-red-500 px-2 py-1 font-mono text-xs text-white"
            style={{
              left: `${vanishingPoint.x + 10}px`,
              top: `${vanishingPoint.y - 10}px`,
            }}
          >
            Vanishing Point
          </div>
        </>
      ) : null}
    </div>
  );
}
