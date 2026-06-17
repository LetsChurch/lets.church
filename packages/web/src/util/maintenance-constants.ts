// Client-safe constants for maintenance mode. Keep this module free of any
// server-only imports (e.g. the db package) so it can be imported from route
// components without pulling Node/pg code into the browser bundle.
export const DEFAULT_MAINTENANCE_MESSAGE =
  "We're currently performing scheduled maintenance and will be back shortly.";
