import { useEffect, useRef } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import mapboxgl from 'mapbox-gl';
import { useTRPC } from '@/trpc/react';

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

  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  useEffect(() => {
    if (env?.MAPBOX_MAP_TOKEN && ref.current) {
      mapboxgl.accessToken = env.MAPBOX_MAP_TOKEN;
      map.current = new mapboxgl.Map({
        container: ref.current,
        center: [-98.5795, 39.8283], // Geographic center of contiguous USA
        zoom: 3.5,
      });

      // Apply padding if provided
      if (padding) {
        map.current.setPadding(padding);
      }

      return () => map.current?.remove();
    }
  }, [env, padding]);

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
