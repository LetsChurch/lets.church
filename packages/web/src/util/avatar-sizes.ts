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
 * The sizes are all 2x variants for high-DPI displays and image resizing.
 */

// Mantine Avatar sizes (used in dashboard)
export const mantineAvatarXs2x = { width: 32, height: 32 };

export const mantineAvatarSm2x = { width: 52, height: 52 };

export const mantineAvatarMd2x = { width: 76, height: 76 };

export const mantineAvatarLg2x = { width: 112, height: 112 };

export const mantineAvatarXl2x = { width: 168, height: 168 };

// App-specific avatar sizes (used in public-facing pages)
// Small avatar for channel badges, upload cards
export const appAvatarXs2x = { width: 64, height: 64 };

// Medium avatar for channel lists, subscriptions
export const appAvatarSm2x = { width: 128, height: 128 };

// Large avatar for channel pages
export const appAvatarMd2x = { width: 256, height: 256 };
