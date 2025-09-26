import {
  IconBookmark,
  IconCompass,
  IconFlag,
  IconMenu2,
  IconSearch,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/util/cn';
import Logo from './logo';

type SidebarProps = {
  className?: string;
};

const navigation = [
  {
    name: 'Explore',
    icon: <IconCompass />,
    href: '/',
  },
  {
    name: 'Following',
    icon: <IconFlag />,
    href: '/following',
  },
  {
    name: 'Search',
    icon: <IconSearch />,
    href: '/search',
  },
  {
    name: 'Library',
    icon: <IconBookmark />,
    href: '/library',
  },
];

export default function Sidebar({ className }: SidebarProps) {
  return (
    <div
      className={cn(
        'hidden h-full w-[200px] flex-col border-sidebar border-r bg-sidebar sm:flex',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-sidebar border-b px-3 py-4">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg bg-overlay text-primary transition-colors hover:bg-overlay-strong"
        >
          <IconMenu2 />
        </button>
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className="group relative flex items-center rounded-lg px-4 py-2 font-medium text-muted text-sm transition-colors hover:bg-overlay hover:text-primary"
            activeProps={{
              className:
                'bg-transparent text-primary after:absolute after:top-0 after:right-0 after:bottom-0 after:w-0.5 after:bg-indigo-500 after:glow-md',
            }}
          >
            <div className="mr-3 flex-shrink-0">{item.icon}</div>
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
