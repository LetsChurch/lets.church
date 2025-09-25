import {
  IconBookmark,
  IconCompass,
  IconFlag,
  IconSearch,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

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

export default function BottomTabBar() {
  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 bg-gray-950 sm:hidden">
      <nav className="flex items-center justify-around px-4">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className="relative flex min-w-0 flex-1 flex-col items-center justify-center p-3 text-zinc-400 transition-colors"
            activeProps={{
              className:
                'after:absolute after:top-0 after:h-0.5 after:w-full after:rounded-full after:bg-indigo-500',
            }}
          >
            <div className="flex h-6 w-6 items-center justify-center">
              {item.icon}
            </div>
            <span className="mt-3 truncate text-xs">{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
