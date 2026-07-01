import {
  IconBookmark,
  IconBuildingChurch,
  IconCompass,
  IconFlag,
  IconSearch,
} from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

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
    name: 'Churches',
    icon: <IconBuildingChurch />,
    href: '/churches',
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
  const navRef = useRef<HTMLElement>(null);
  // Position of the sliding underline, measured from the active link. Null
  // until measured (and when no bar route is active) so the indicator is
  // simply absent rather than parked at the far left.
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Re-measure whenever the route changes so the underline follows the active
  // link. Selecting just the pathname keeps re-renders minimal.
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[data-status="active"]');
      setIndicator(
        active ? { left: active.offsetLeft, width: active.offsetWidth } : null,
      );
    };
    measure();
    // Keep it aligned when the bar reflows (rotation / width changes).
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 bg-white px-4 sm:hidden dark:bg-gray-950">
      <nav ref={navRef} className="relative flex items-center justify-around">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className="relative flex min-w-0 flex-1 flex-col items-center justify-center p-3 text-muted transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center">
              {item.icon}
            </div>
            <span className="mt-3 truncate text-xs">{item.name}</span>
          </Link>
        ))}
        {indicator ? (
          <div
            aria-hidden="true"
            className="glow-md pointer-events-none absolute top-0 h-0.5 rounded-full bg-brand transition-all duration-200"
            style={{ left: indicator.left, width: indicator.width }}
          />
        ) : null}
      </nav>
    </div>
  );
}
