import type { ReactNode } from 'react';
import Header from './header';

type MainLayoutProps = {
  children: ReactNode;
  headerChildren?: ReactNode;
  defaultSearchValue?: string;
  searchPlaceholder?: string;
  channelSlug?: string;
  containerClassName?: string;
};

export default function MainLayout({
  children,
  headerChildren,
  defaultSearchValue,
  searchPlaceholder,
  channelSlug,
  containerClassName = 'pb-8 sm:px-16',
}: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header
        defaultSearchValue={defaultSearchValue}
        searchPlaceholder={searchPlaceholder}
        channelSlug={channelSlug}
      >
        {headerChildren}
      </Header>
      <div className={`isolate ${containerClassName}`}>{children}</div>
    </div>
  );
}
