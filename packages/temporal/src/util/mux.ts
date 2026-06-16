import Mux from '@mux/mux-node';
import { z } from 'zod';

// Lazily constructed so importing this module (e.g. when the import-worker
// loads its activity bundle) never requires Mux credentials at boot — they're
// only needed when a recording is actually imported.
let _mux: Mux | null = null;

export function getMux(): Mux {
  if (!_mux) {
    const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = z
      .object({
        MUX_TOKEN_ID: z.string().min(1),
        MUX_TOKEN_SECRET: z.string().min(1),
      })
      .parse(process.env);

    _mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
  }

  return _mux;
}

// Resolve the highest-resolution downloadable MP4 URL for a Mux asset's
// recording. Requires the asset to have static renditions enabled (we set
// `static_renditions` in new_asset_settings when provisioning the live
// stream). Throws if no ready static rendition exists yet.
export async function getMuxRecordingMp4Url(assetId: string): Promise<string> {
  const asset = await getMux().video.assets.retrieve(assetId);

  const playbackId = asset.playback_ids?.[0]?.id;
  if (!playbackId) {
    throw new Error(`Mux asset ${assetId} has no playback id`);
  }

  // Advanced static renditions get predictable, resolution-named files
  // (e.g. 1080p.mp4 / highest.mp4). Pick the highest-resolution ready one.
  // If none is ready yet (renditions are still generating after the asset
  // becomes ready), throw so the calling activity retries until one lands.
  const renditions = asset.static_renditions?.files ?? [];
  const ready = renditions
    .filter((f) => f.status === 'ready' && f.name?.endsWith('.mp4'))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  const fileName = ready[0]?.name;
  if (!fileName) {
    throw new Error(
      `Mux asset ${assetId} has no ready MP4 static rendition yet`,
    );
  }

  return `https://stream.mux.com/${playbackId}/${fileName}`;
}
