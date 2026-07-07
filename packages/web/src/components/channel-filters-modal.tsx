import { Dialog } from '@base-ui/react/dialog';
import { IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { cn } from '@/util/cn';

import { MobileDrawer } from './mobile-drawer';

type ChannelFiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: 'name' | 'subscribers' | 'newest';
  onSortChange: (sort: 'name' | 'subscribers' | 'newest') => void;
};

// Common Components
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 text-[10px] font-bold tracking-[1px] text-gray-500 uppercase dark:text-zinc-400">
      {children}
    </h3>
  );
}

function SelectableOption({
  onClick,
  selected,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-primary hover:bg-primary/10 flex w-full cursor-pointer items-center justify-between rounded-lg px-1 py-[7px] text-sm font-medium transition-colors"
    >
      {children}
      <IconCheck
        size={16}
        className={selected ? 'text-primary shrink-0' : 'shrink-0 opacity-0'}
      />
    </button>
  );
}

export function ChannelFiltersModal({
  open,
  onOpenChange,
  sort,
  onSortChange,
}: ChannelFiltersModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSortChange = (newSort: 'name' | 'subscribers' | 'newest') => {
    onSortChange(newSort);
    onOpenChange(false);
  };

  return (
    <>
      {/* Mobile Drawer */}
      {isMobile ? (
        <MobileDrawer.Root open={open} onOpenChange={onOpenChange}>
          <MobileDrawer.Portal>
            <MobileDrawer.Backdrop />
            <MobileDrawer.Content>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="flex w-full flex-col content-stretch items-start gap-1">
                  <SectionHeading>Sort By</SectionHeading>

                  <SelectableOption
                    onClick={() => handleSortChange('subscribers')}
                    selected={sort === 'subscribers'}
                  >
                    Most Followers
                  </SelectableOption>

                  <SelectableOption
                    onClick={() => handleSortChange('name')}
                    selected={sort === 'name'}
                  >
                    A-Z
                  </SelectableOption>

                  <SelectableOption
                    onClick={() => handleSortChange('newest')}
                    selected={sort === 'newest'}
                  >
                    Newest
                  </SelectableOption>
                </div>
              </div>

              {/* Home Indicator */}
              <div className="relative h-[34px] w-full shrink-0">
                <div className="absolute bottom-2 left-1/2 flex h-[5px] w-36 -translate-x-1/2 items-center justify-center">
                  <div className="flex-none scale-y-[-100%] rotate-180">
                    <div className="h-[5px] w-36 rounded-[100px] bg-gray-950 dark:bg-white" />
                  </div>
                </div>
              </div>
            </MobileDrawer.Content>
          </MobileDrawer.Portal>
        </MobileDrawer.Root>
      ) : (
        /* Desktop Modal */
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
          <Dialog.Portal>
            <Dialog.Backdrop
              className={cn(
                'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',
                'transition-opacity duration-300 ease-in-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
              )}
            >
              <Dialog.Popup
                className={cn(
                  'flex max-h-[85vh] w-sm flex-col rounded-2xl border-fancy-pants bg-white shadow-xl dark:bg-zinc-900',
                  'transition-all duration-300 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
                )}
              >
                <div className="overflow-y-auto p-5">
                  <div className="flex w-full flex-col content-stretch items-start gap-1">
                    <SectionHeading>Sort By</SectionHeading>

                    <SelectableOption
                      onClick={() => handleSortChange('subscribers')}
                      selected={sort === 'subscribers'}
                    >
                      Most Followers
                    </SelectableOption>

                    <SelectableOption
                      onClick={() => handleSortChange('name')}
                      selected={sort === 'name'}
                    >
                      A-Z
                    </SelectableOption>

                    <SelectableOption
                      onClick={() => handleSortChange('newest')}
                      selected={sort === 'newest'}
                    >
                      Newest
                    </SelectableOption>
                  </div>
                </div>
              </Dialog.Popup>
            </Dialog.Backdrop>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
