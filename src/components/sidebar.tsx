import {
  IconBookmark,
  IconCompass,
  IconFlag,
  IconMenu2,
  IconSearch,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

type SidebarProps = {
  className?: string;
};

const navigation = [
  {
    name: 'Explore',
    icon: <IconCompass />,
    href: '/',
    current: true,
  },
  {
    name: 'Following',
    icon: <IconFlag />,
    href: '/following',
    current: false,
  },
  {
    name: 'Search',
    icon: <IconSearch />,
    href: '/search',
    current: false,
  },
  {
    name: 'Library',
    icon: <IconBookmark />,
    href: '/library',
    current: false,
  },
];

export default function Sidebar({ className }: SidebarProps) {
  return (
    <div
      className={`flex h-full w-[200px] flex-col border-sidebar border-r bg-sidebar ${className || ''}`}
    >
      {/* Logo and Menu Button */}
      <div className="flex items-center gap-3 border-sidebar border-b px-3 py-4">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-overlay text-primary transition-colors hover:bg-overlay-strong"
        >
          <IconMenu2 />
        </button>
        <div className="font-semibold text-lg text-primary">Let's Church</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className={`group relative flex items-center rounded-lg px-4 py-2 font-medium text-sm transition-colors ${
              item.current
                ? 'bg-transparent text-primary'
                : 'text-muted hover:bg-overlay hover:text-primary'
            }
            `}
          >
            {item.current && (
              <div className="absolute top-0 right-0 bottom-0 w-0.5 bg-indigo-500 shadow-indigo-500/50 shadow-lg" />
            )}
            <div className="mr-3 flex-shrink-0">{item.icon}</div>
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
