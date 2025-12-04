import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import mapboxgl from 'mapbox-gl';
import { useTRPC } from '@/trpc/react';
import { getInitialTheme, THEME_CHANGE_EVENT } from '@/stores/theme';
import { invariant } from 'es-toolkit';

type ChurchMapProps = {
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
};

export function ChurchMap({ padding }: ChurchMapProps) {
  const ref = useRef(null);
  const map = useRef<mapboxgl.Map | null>(null);
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

      map.current = new mapboxgl.Map({
        container: ref.current,
        center: [-98.5795, 39.8283], // Geographic center of contiguous USA
        zoom: 3.5,
        style:
          theme === 'dark'
            ? 'mapbox://styles/letschurch/cmiqubq4r001h01qk8xaaeh6q'
            : undefined,
      });

      map.current.on('load', () => {
        const m = map.current;
        invariant(m, 'Failed to get map reference');

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

        m.setFog(fogConfig);
        m.setLayoutProperty('poi-label', 'visibility', 'none'); // Hide the layer

        if (padding) {
          m.setPadding(padding);
        }
      });

      return () => map.current?.remove();
    }
  }, [env, padding, theme]);

  // Update padding when it changes and resize map
  useEffect(() => {
    if (map.current && padding) {
      // Use a small delay to allow the DOM to update before resizing
      const timeoutId = setTimeout(() => {
        map.current?.resize();
        map.current?.setPadding(padding);
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [padding]);

  // Listen for window resize events to resize the map
  useEffect(() => {
    if (!map.current) return;

    const handleResize = () => {
      map.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={ref} className="size-full" />;
}
