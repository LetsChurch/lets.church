import Mux from '@mux/mux-node';
import { z } from 'zod';

// Mux's global RTMP(S) ingest endpoints. The same URL for every live stream;
// broadcasters append their per-stream key. Shown to channel admins. (Mux
// custom CNAME domains only support plain RTMP, not RTMPS, so we don't offer a
// vanity-host override.)
export const MUX_RTMPS_URL = 'rtmps://global-live.mux.com:443/app';
export const MUX_RTMP_URL = 'rtmp://global-live.mux.com:5222/app';

// Live HLS manifest for a Mux playback id. Served from Mux's CDN while a
// broadcast is live; once the recording is imported + transcoded we switch
// to our own CDN (see getPublicMediaUrl). Pure helper — safe to import on hot
// paths without pulling in Mux credentials.
export function getMuxLivePlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

// Lazily constructed so importing this module (e.g. transitively from the
// media router) never requires Mux credentials at boot — they're only needed
// when actually talking to Mux (provisioning, simulcast, webhook verify).
// Only the API token is required here; the webhook secret is handled
// separately (see getMuxWebhookSecret) so non-webhook usage doesn't depend on
// it.
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

// Webhook signing secret used to verify inbound webhooks. Mux GENERATES this
// value (the dashboard webhook, or the `mux webhooks listen` CLI which prints
// it and persists it per-environment) — you can't pick the value Mux signs
// with. Returns null when unset: the webhook route then skips verification in
// dev (so you can POST synthetic events) but refuses to skip in production.
export function getMuxWebhookSecret(): string | null {
  return process.env.MUX_WEBHOOK_SECRET || null;
}
