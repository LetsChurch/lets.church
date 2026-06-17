import { db, SiteConfig } from '@letschurch/db';

export { DEFAULT_MAINTENANCE_MESSAGE } from './maintenance-constants';

export type MaintenanceConfig = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
};

const DEFAULT_CONFIG: MaintenanceConfig = {
  maintenanceMode: false,
  maintenanceMessage: null,
};

// The maintenance gate runs on every gated request (tRPC + the root route
// loader), so we cache the singleton row in-process for a few seconds rather
// than hitting the database each time. Admin writes clear the cache eagerly so
// toggling maintenance mode takes effect immediately for the admin who flipped
// it; other instances pick it up within the TTL.
const CACHE_TTL_MS = 5_000;

let cache: { value: MaintenanceConfig; expiresAt: number } | null = null;

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const row = await db.query.SiteConfig.findFirst({
    where: (t, { eq }) => eq(t.id, 1),
    columns: { maintenanceMode: true, maintenanceMessage: true },
  });

  const value: MaintenanceConfig = row
    ? {
        maintenanceMode: row.maintenanceMode,
        maintenanceMessage: row.maintenanceMessage,
      }
    : DEFAULT_CONFIG;

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };

  return value;
}

export function clearMaintenanceCache() {
  cache = null;
}

export async function setMaintenanceConfig(input: {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  updatedById: string;
}) {
  await db
    .insert(SiteConfig)
    .values({
      id: 1,
      maintenanceMode: input.maintenanceMode,
      maintenanceMessage: input.maintenanceMessage,
      updatedById: input.updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: SiteConfig.id,
      set: {
        maintenanceMode: input.maintenanceMode,
        maintenanceMessage: input.maintenanceMessage,
        updatedById: input.updatedById,
        updatedAt: new Date(),
      },
    });

  clearMaintenanceCache();
}

export async function getMaintenanceSettings() {
  const row = await db.query.SiteConfig.findFirst({
    where: (t, { eq }) => eq(t.id, 1),
    columns: {
      maintenanceMode: true,
      maintenanceMessage: true,
      updatedAt: true,
      updatedById: true,
    },
  });

  return (
    row ?? {
      maintenanceMode: false,
      maintenanceMessage: null,
      updatedAt: null,
      updatedById: null,
    }
  );
}
