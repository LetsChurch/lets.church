import { Dialog } from '@base-ui-components/react/dialog';
import {
  IconBookmark,
  IconBuildingChurch,
  IconCompass,
  IconFlag,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/util/cn';
import Logo from './logo';
import { ThemeSwitcher } from './theme-switcher';

type MobileMenuDonateCardProps = {
  onDismiss?: () => void;
};

function MobileMenuDonateCard({ onDismiss }: MobileMenuDonateCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-brand p-3">
      <div className="mb-3">
        <p className="text-center font-bold text-sm text-white leading-snug">
          Keep sharing good news without ads.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <a
          href="https://givebutter.com/LetsChurch"
          className="rounded-full bg-white px-2.5 py-1.5 text-center font-semibold text-brand text-xs transition-opacity hover:opacity-90"
          target="_blank"
          rel="noopener"
        >
          Donate Now
        </a>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-2.5 py-1.5 font-semibold text-white/80 text-xs transition-colors hover:bg-white/10"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const handleClose = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0" />

        <Dialog.Popup
          className={cn(
            'fixed top-0 left-0 z-50 h-full w-80 bg-white dark:bg-zinc-900',
            'data-ending-style:-translate-x-full data-starting-style:-translate-x-full',
            'transition-transform duration-300 ease-in-out',
          )}
        >
          <div className="flex items-center justify-between border-gray-200 border-b px-4 py-4 dark:border-zinc-800">
            <Link to="/" onClick={handleClose}>
              <Logo />
            </Link>
            <Dialog.Close
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-zinc-800"
                >
                  <IconX />
                </button>
              )}
            />
          </div>

          <div className="h-[stretch] overflow-y-auto border-gray-200 border-t px-4 dark:border-zinc-800">
            {/* Main Navigation */}
            <div className="space-y-3 border-gray-200 border-b py-6 dark:border-zinc-800">
              <Link
                to="/search"
                onClick={handleClose}
                className="flex items-center gap-3 font-semibold text-lg text-primary hover:text-indigo-400"
              >
                <IconSearch className="size-6" />
                <span>Search</span>
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="flex items-center gap-3 font-semibold text-lg text-primary hover:text-indigo-400"
              >
                <IconCompass className="size-6" />
                <span>Explore</span>
              </Link>
              <Link
                to="/following"
                onClick={handleClose}
                className="flex items-center gap-3 font-semibold text-lg text-primary hover:text-indigo-400"
              >
                <IconFlag className="size-6" />
                <span>Following</span>
              </Link>
              <Link
                to="/churches"
                onClick={handleClose}
                className="flex items-center gap-3 font-semibold text-lg text-primary hover:text-indigo-400"
              >
                <IconBuildingChurch className="size-6" />
                <span>Churches</span>
              </Link>
              <Link
                to="/library"
                onClick={handleClose}
                className="flex items-center gap-3 font-semibold text-lg text-primary hover:text-indigo-400"
              >
                <IconBookmark className="size-6" />
                <span>Library</span>
              </Link>
            </div>

            {/* About Section */}
            <div className="space-y-3 py-6">
              <Link
                to="/about"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                Our Mission
              </Link>
              <Link
                to="/about/dorean"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                The Dorean Principle
              </Link>
              <Link
                to="/about/add-content"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                How to Add Content
              </Link>
            </div>

            {/* Theme Switcher */}
            <div className="border-gray-200 border-t py-6 dark:border-zinc-800">
              <ThemeSwitcher />
            </div>

            {/* Legal Links */}
            <div className="space-y-3 border-gray-200 border-t py-6 dark:border-zinc-800">
              <Link
                to="/about/theology"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                Statement of Theology
              </Link>
              <Link
                to="/about/terms"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                Terms of Service
              </Link>
              <Link
                to="/about/privacy"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                Privacy Policy
              </Link>
              <Link
                to="/about/dmca"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                DMCA
              </Link>
            </div>

            <div className="mb-6">
              <MobileMenuDonateCard />
            </div>

            <footer className="pb-6">
              <p className="text-muted text-xs">
                Let's Church is in the public domain and is operated as a
                non-profit.{' '}
                <Link
                  to="/about"
                  className="text-primary hover:text-indigo-300"
                >
                  Learn more
                </Link>
              </p>
            </footer>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
