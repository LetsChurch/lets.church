import { IconMoon, IconSun } from '@tabler/icons-react';
import { useState } from 'react';

import { LcTooltip } from '@/components/lc-tooltip';
import { getInitialTheme, setTheme } from '@/stores/theme';

type Theme = 'light' | 'dark';

type ThemeSwitcherProps = {
  collapsed?: boolean;
};

export function ThemeSwitcher({ collapsed = false }: ThemeSwitcherProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme());

  const handleToggle = () => {
    const newTheme: Theme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
    setTheme(newTheme);
  };

  const Icon = currentTheme === 'light' ? IconMoon : IconSun;
  const label = currentTheme === 'light' ? 'Dark Mode' : 'Light Mode';

  if (collapsed) {
    return (
      <LcTooltip content={label} side="right">
        <button
          type="button"
          className="text-primary/70 hover:text-primary/90 flex size-6 cursor-pointer items-center justify-center transition-colors"
          onClick={handleToggle}
          aria-label={label}
        >
          <Icon size={16} />
        </button>
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
        <Icon size={16} className="text-primary/70" />
      </div>
      <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
        {label}
      </span>
    </button>
  );
}
