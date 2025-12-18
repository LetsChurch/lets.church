import type { ReactNode } from 'react';
import Header from './header';

type Channel = {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
};

type MainLayoutProps = {
  children: ReactNode;
  headerChildren?: ReactNode;
  defaultSearchValue?: string;
  searchPlaceholder?: string;
  channelSlug?: string;
  containerClassName?: string;
  availableChannels?: Channel[];
};

export default function MainLayout({
  children,
  headerChildren,
  defaultSearchValue,
  searchPlaceholder,
  channelSlug,
  containerClassName = 'pb-8 sm:px-16',
  availableChannels = [],
}: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header
        defaultSearchValue={defaultSearchValue}
        searchPlaceholder={searchPlaceholder}
        channelSlug={channelSlug}
        availableChannels={availableChannels}
      >
        {headerChildren}
      </Header>
      <div className={`isolate ${containerClassName}`}>{children}</div>
    </div>
  );
}
