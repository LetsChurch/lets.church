import maplibregl from 'maplibre-gl';
import layers from 'protomaps-themes-base';
import { onMount } from 'solid-js';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function Map() {
  let root: HTMLDivElement;

  onMount(() => {
    new maplibregl.Map({
      container: root,
      style: {
        version: 8,
        glyphs:
          'https://public.letschurch.cloud/basemaps-assets/fonts/{fontstack}/{range}.pbf',
        sources: {
          protomaps: {
            type: 'vector',
            tiles: [
              'https://maptiles.letschurch.cloud/20240112/{z}/{x}/{y}.mvt',
            ],
            maxzoom: 15,
          },
        },
        transition: {
          duration: 0,
        },
        layers: layers('protomaps', 'light'),
      },
      center: [-74.5, 40], // starting position [lng, lat]
      zoom: 9, // starting zoom
    });
  });

  return <div ref={root!} class="h-[70vh] min-h-[500px] w-full" />;
}
