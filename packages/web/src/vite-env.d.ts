/// <reference types="vite/client" />

// Fontsource packages resolve (via their `exports` map) to a bare `index.css`,
// so the extensionless side-effect imports (`import '@fontsource-variable/…'`)
// aren't covered by vite/client's `*.css` glob (which matches on the specifier
// string, so only paths ending in `.css` qualify). TypeScript 5.x accepted a
// bare side-effect import resolving to a non-JS file silently; the 6.0 → 7.0
// line tightened this to emit TS2882 ("Cannot find module or type declarations
// for side-effect import"). Declare them as side-effect modules to satisfy it.
declare module '@fontsource-variable/*';
