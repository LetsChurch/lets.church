import desktopUserAgents from 'top-user-agents/desktop';

// Some CDNs (e.g. audio.buzzsprout.com) respond with a 403 when a request has an
// empty or non-browser User-Agent, which is the default for a bare Node fetch().
// Import downloads therefore impersonate a real browser.
//
// The source of truth is the `top-user-agents` package, which ships an
// always-up-to-date list of the most common browser user-agents (sorted by
// popularity) and is republished weekly. Bump it with `pnpm update
// top-user-agents` to refresh. The fallback below only applies if that list is
// ever empty/unexpected.
const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// Prefer the most common plain-Chrome desktop UA (matching the Chrome
// impersonation used by yt-dlp and Playwright elsewhere in the importer), then
// fall back to the most common desktop UA, then to the hardcoded constant.
export const USER_AGENT: string =
  desktopUserAgents.find(
    (ua) => /Chrome\/\d+/.test(ua) && !/Edg|OPR|Firefox/.test(ua),
  ) ??
  desktopUserAgents[0] ??
  FALLBACK_USER_AGENT;
