// Static Tailwind class maps for the dashboard UI primitives. Tailwind can only
// see class names that appear verbatim in source, so every color/variant combo
// is enumerated here rather than built dynamically.

export type LcColor =
  | 'brand'
  | 'gray'
  | 'red'
  | 'green'
  | 'blue'
  | 'orange'
  | 'yellow'
  | 'purple'
  | 'teal';

// Normalize legacy Mantine color names to our palette.
export function normalizeColor(color?: string): LcColor {
  if (!color) return 'brand';
  if (color === 'lc' || color === 'indigo' || color === 'violet')
    return 'brand';
  if (color === 'amber') return 'yellow';
  if (color === 'cyan') return 'teal';
  if (
    color === 'brand' ||
    color === 'gray' ||
    color === 'red' ||
    color === 'green' ||
    color === 'blue' ||
    color === 'orange' ||
    color === 'yellow' ||
    color === 'purple' ||
    color === 'teal'
  ) {
    return color;
  }
  return 'gray';
}

export type BadgeVariant = 'light' | 'filled' | 'outline';

export const BADGE: Record<LcColor, Record<BadgeVariant, string>> = {
  brand: {
    light: 'bg-brand/10 text-brand dark:text-indigo-300',
    filled: 'bg-brand text-white',
    outline: 'border border-brand/40 text-brand dark:text-indigo-300',
  },
  gray: {
    light: 'bg-gray-500/10 text-gray-700 dark:text-zinc-300',
    filled: 'bg-gray-600 text-white',
    outline: 'border border-gray-500/40 text-gray-700 dark:text-zinc-300',
  },
  red: {
    light: 'bg-red-500/10 text-red-700 dark:text-red-300',
    filled: 'bg-red-600 text-white',
    outline: 'border border-red-500/40 text-red-700 dark:text-red-300',
  },
  green: {
    light: 'bg-green-500/10 text-green-700 dark:text-green-300',
    filled: 'bg-green-600 text-white',
    outline: 'border border-green-500/40 text-green-700 dark:text-green-300',
  },
  blue: {
    light: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    filled: 'bg-blue-600 text-white',
    outline: 'border border-blue-500/40 text-blue-700 dark:text-blue-300',
  },
  orange: {
    light: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    filled: 'bg-orange-600 text-white',
    outline: 'border border-orange-500/40 text-orange-700 dark:text-orange-300',
  },
  yellow: {
    light: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
    filled: 'bg-yellow-500 text-white',
    outline: 'border border-yellow-500/40 text-yellow-700 dark:text-yellow-300',
  },
  purple: {
    light: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
    filled: 'bg-purple-600 text-white',
    outline: 'border border-purple-500/40 text-purple-700 dark:text-purple-300',
  },
  teal: {
    light: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    filled: 'bg-teal-600 text-white',
    outline: 'border border-teal-500/40 text-teal-700 dark:text-teal-300',
  },
};

export type ButtonVariant =
  | 'filled'
  | 'light'
  | 'outline'
  | 'subtle'
  | 'default';

// The neutral `default` variant ignores color (matches Mantine's default
// variant), so it is shared here.
const NEUTRAL_DEFAULT =
  'border-fancy-pants bg-gray-950/5 text-primary hover:bg-gray-950/10 dark:bg-white/10 dark:hover:bg-white/15';

export const BUTTON: Record<LcColor, Record<ButtonVariant, string>> = {
  brand: {
    filled: 'bg-brand text-white hover:bg-brand-600',
    light: 'bg-brand/10 text-brand hover:bg-brand/20 dark:text-indigo-300',
    outline:
      'border border-brand/50 text-brand hover:bg-brand/10 dark:text-indigo-300',
    subtle: 'text-brand hover:bg-brand/10 dark:text-indigo-300',
    default: NEUTRAL_DEFAULT,
  },
  gray: {
    filled: 'bg-gray-600 text-white hover:bg-gray-700',
    light:
      'bg-gray-500/10 text-gray-700 hover:bg-gray-500/20 dark:text-zinc-300',
    outline:
      'border border-gray-500/40 text-gray-700 hover:bg-gray-500/10 dark:text-zinc-300',
    subtle: 'text-gray-700 hover:bg-gray-500/10 dark:text-zinc-300',
    default: NEUTRAL_DEFAULT,
  },
  red: {
    filled: 'bg-red-600 text-white hover:bg-red-700',
    light: 'bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300',
    outline:
      'border border-red-500/50 text-red-700 hover:bg-red-500/10 dark:text-red-300',
    subtle: 'text-red-700 hover:bg-red-500/10 dark:text-red-300',
    default: NEUTRAL_DEFAULT,
  },
  green: {
    filled: 'bg-green-600 text-white hover:bg-green-700',
    light:
      'bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-300',
    outline:
      'border border-green-500/50 text-green-700 hover:bg-green-500/10 dark:text-green-300',
    subtle: 'text-green-700 hover:bg-green-500/10 dark:text-green-300',
    default: NEUTRAL_DEFAULT,
  },
  blue: {
    filled: 'bg-blue-600 text-white hover:bg-blue-700',
    light:
      'bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-300',
    outline:
      'border border-blue-500/50 text-blue-700 hover:bg-blue-500/10 dark:text-blue-300',
    subtle: 'text-blue-700 hover:bg-blue-500/10 dark:text-blue-300',
    default: NEUTRAL_DEFAULT,
  },
  orange: {
    filled: 'bg-orange-600 text-white hover:bg-orange-700',
    light:
      'bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300',
    outline:
      'border border-orange-500/50 text-orange-700 hover:bg-orange-500/10 dark:text-orange-300',
    subtle: 'text-orange-700 hover:bg-orange-500/10 dark:text-orange-300',
    default: NEUTRAL_DEFAULT,
  },
  yellow: {
    filled: 'bg-yellow-500 text-white hover:bg-yellow-600',
    light:
      'bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-300',
    outline:
      'border border-yellow-500/50 text-yellow-700 hover:bg-yellow-500/10 dark:text-yellow-300',
    subtle: 'text-yellow-700 hover:bg-yellow-500/10 dark:text-yellow-300',
    default: NEUTRAL_DEFAULT,
  },
  purple: {
    filled: 'bg-purple-600 text-white hover:bg-purple-700',
    light:
      'bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:text-purple-300',
    outline:
      'border border-purple-500/50 text-purple-700 hover:bg-purple-500/10 dark:text-purple-300',
    subtle: 'text-purple-700 hover:bg-purple-500/10 dark:text-purple-300',
    default: NEUTRAL_DEFAULT,
  },
  teal: {
    filled: 'bg-teal-600 text-white hover:bg-teal-700',
    light:
      'bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:text-teal-300',
    outline:
      'border border-teal-500/50 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300',
    subtle: 'text-teal-700 hover:bg-teal-500/10 dark:text-teal-300',
    default: NEUTRAL_DEFAULT,
  },
};

export const ALERT: Record<LcColor, string> = {
  brand: 'bg-brand/10 text-indigo-900 dark:text-indigo-200 [&_a]:text-brand',
  gray: 'bg-gray-500/10 text-gray-900 dark:text-zinc-200',
  red: 'bg-red-500/10 text-red-900 dark:text-red-200',
  green: 'bg-green-500/10 text-green-900 dark:text-green-200',
  blue: 'bg-blue-500/10 text-blue-900 dark:text-blue-200',
  orange: 'bg-orange-500/10 text-orange-900 dark:text-orange-200',
  yellow: 'bg-yellow-500/10 text-yellow-900 dark:text-yellow-200',
  purple: 'bg-purple-500/10 text-purple-900 dark:text-purple-200',
  teal: 'bg-teal-500/10 text-teal-900 dark:text-teal-200',
};

// Icon/heading accent color for alerts.
export const ALERT_ACCENT: Record<LcColor, string> = {
  brand: 'text-brand',
  gray: 'text-gray-600 dark:text-zinc-400',
  red: 'text-red-600 dark:text-red-400',
  green: 'text-green-600 dark:text-green-400',
  blue: 'text-blue-600 dark:text-blue-400',
  orange: 'text-orange-600 dark:text-orange-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  purple: 'text-purple-600 dark:text-purple-400',
  teal: 'text-teal-600 dark:text-teal-400',
};
