import { IconMoon, IconSun } from '@tabler/icons-react';

import { LcTooltip } from '@/components/lc-tooltip';
import { setTheme, useTheme } from '@/stores/theme';

type ThemeSwitcherProps = {
  collapsed?: boolean;
};

export function ThemeSwitcher({ collapsed = false }: ThemeSwitcherProps) {
  // Before hydration finishes this is the server's guess, which can be wrong
  // for visitors whose OS is in dark mode, so the visible icon and text come
  // from CSS (`data-theme`, set before React runs) rather than from this value.
  const currentTheme = useTheme();

  const handleToggle = () => {
    // Read the live theme rather than `currentTheme`, which can still hold the
    // server's guess for a moment after hydration.
    const isDark = document.documentElement.dataset.theme === 'dark';
    setTheme(isDark ? 'light' : 'dark');
  };

  const label = currentTheme === 'light' ? 'Dark Mode' : 'Light Mode';

  if (collapsed) {
    return (
      <LcTooltip
        content={label}
        side="right"
        render={
          <button
            type="button"
            className="text-primary/70 hover:text-primary/90 flex size-6 cursor-pointer items-center justify-center transition-colors"
            onClick={handleToggle}
          />
        }
      >
        <IconMoon size={16} className="dark:hidden" />
        <IconSun size={16} className="hidden dark:block" />
        <span className="sr-only dark:hidden">Dark Mode</span>
        <span className="sr-only hidden dark:inline">Light Mode</span>
      </LcTooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="hover:text-primary/80 flex w-full cursor-pointer items-center gap-2.5 transition-colors"
    >
      <div className="flex size-6 items-center justify-center">
        <IconMoon size={16} className="text-primary/70 dark:hidden" />
        <IconSun size={16} className="text-primary/70 hidden dark:block" />
      </div>
      <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
        <span className="dark:hidden">Dark Mode</span>
        <span className="hidden dark:inline">Light Mode</span>
      </span>
    </button>
  );
}
