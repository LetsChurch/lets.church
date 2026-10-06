# Let's Church Mirror (browser extension)

Chrome + Firefox (MV3) extension that adds **"Mirror to Let's Church"** to
YouTube Studio, for one video (edit page) or a selection (Content list). It
downloads the owner's original file through Studio's own **Download** and
uploads it to a Let's Church channel, so it works for Private videos and never
uses yt-dlp.

Built with [WXT](https://wxt.dev) + React + Base UI + Tailwind.

## How it works

```
YouTube Studio tab                      extension                     lets.church
──────────────────                      ─────────                     ───────────
studio.content (shadow-root UI)
  ├─ reads selection / current video
  ├─ get_creator_videos (Studio API) ──▶ title, description, length,
  │                                      publish time, downloadUrl
  └─ Mirror dialog ─── lc:* messages ──▶ background ──── tRPC ────────▶ dashboard.mirror.getContext
                                                                        dashboard.mirror.findDuplicates
                       queue:enqueue ──▶ storage.local job:<id>
                                         queue page (runner)
                                           ├─ fetch download_my_video (→ *.c.youtube.com)
                                           ├─ createUpload ───────────▶ record + presigned parts
                                           ├─ PUT 10 MB parts ────────▶ ingest bucket (S3)
                                           └─ finalizeUpload ─────────▶ processing workflow
```

- **Auth** rides your normal Let's Church sign-in (`lc-session` cookie); the
  extension has host permissions for the site. Sign in on the site, then use the
  extension. See `docs/security.md` → "Browser extension clients".
- **Studio data** comes from Studio's internal `creator/get_creator_videos`
  API, called from the content script with Studio's own config (`ytcfg`) and a
  `SAPISIDHASH` header. It is undocumented; everything that knows its shape is
  in `src/lib/studio-api.ts`, and DOM selectors are in `src/lib/studio-dom.ts`.
  If Studio changes, those two files are where to look.
- **Transfers run in the queue tab**, one video at a time, streaming the
  download into parts (never holding the whole file). Service workers / event
  pages can be suspended mid-download; a tab can't, and it shows progress.
  Downloads without a `Content-Length` are spooled to OPFS first. Studio's
  download redirects to a YouTube media host (`rr*---sn-*.c.youtube.com`, or
  `*.googlevideo.com`); those need host permissions, or the redirect is
  CORS-blocked. Download links
  expire, so before each job the queue asks any open Studio tab for a fresh one.
- **Duplicates** are matched heuristically on title, publish date, duration and
  original filename (`packages/web/src/util/mirror-duplicates.ts`). Certain
  matches are unticked in the dialog; possible ones are flagged.
- Closing the queue tab cancels in-flight uploads; reopening it re-queues them
  from the start (their server-side records are aborted).

## Development

```sh
pnpm install                      # runs `wxt prepare`
WXT_LC_URL=http://localhost:4000 pnpm dev            # Chrome, against local stack
WXT_LC_URL=http://localhost:4000 pnpm dev:firefox    # Firefox
pnpm test                         # vitest (pure helpers)
pnpm check                        # tsc + oxlint + oxfmt
```

`WXT_LC_URL` defaults to `https://lets.church`; it sets both the API base URL
and the extension's host permission.

To load a build by hand: `pnpm build:chrome` → `chrome://extensions` →
Developer mode → **Load unpacked** → `.output/chrome-mv3`. For Firefox,
`pnpm build:firefox` → `about:debugging` → **Load Temporary Add-on** →
`.output/firefox-mv3/manifest.json`. Firefox treats MV3 host permissions as
opt-in: the popup shows **Allow access** until they're granted.

Store packages: `pnpm zip` (Chrome Web Store + AMO zips in `.output/`).

The package is excluded from the server Docker build (`.dockerignore`).

## Requirements on the server side

- The user needs `canUpload` (or admin) on the target channel.
- Ingest buckets must allow cross-origin `PUT` and expose `ETag` (see the root
  README's bucket CORS section); extension pages upload parts directly.
