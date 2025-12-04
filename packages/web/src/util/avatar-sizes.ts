/**
 * Avatar size constants.
 *
 * Mantine avatar sizes match the CSS variables defined in the theme:
 * --avatar-size-xs: 16px
 * --avatar-size-sm: 26px
 * --avatar-size-md: 38px
 * --avatar-size-lg: 56px
 * --avatar-size-xl: 84px
 *
 * The 2x variants are for high-DPI displays and image resizing.
 */

// Mantine Avatar sizes (used in dashboard)
export const mantineAvatarXs = { width: 16, height: 16 };
export const mantineAvatarXs2x = { width: 32, height: 32 };

export const mantineAvatarSm = { width: 26, height: 26 };
export const mantineAvatarSm2x = { width: 52, height: 52 };

export const mantineAvatarMd = { width: 38, height: 38 };
export const mantineAvatarMd2x = { width: 76, height: 76 };

export const mantineAvatarLg = { width: 56, height: 56 };
export const mantineAvatarLg2x = { width: 112, height: 112 };

export const mantineAvatarXl = { width: 84, height: 84 };
export const mantineAvatarXl2x = { width: 168, height: 168 };

// App-specific avatar sizes (used in public-facing pages)
// Small avatar for channel badges, upload cards
export const appAvatarXs = { width: 32, height: 32 };
export const appAvatarXs2x = { width: 64, height: 64 };

// Medium avatar for channel lists, subscriptions
export const appAvatarSm = { width: 64, height: 64 };
export const appAvatarSm2x = { width: 128, height: 128 };

// Large avatar for channel pages
export const appAvatarMd = { width: 128, height: 128 };
export const appAvatarMd2x = { width: 256, height: 256 };
