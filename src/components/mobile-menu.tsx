import { Dialog } from '@base-ui-components/react/dialog';
import { IconX } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/util/cn';
import { DonateCard } from './donate-card';
import Logo from './logo';

type MobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const handleClose = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />

        <Dialog.Popup
          className={cn(
            'fixed top-0 left-0 z-50 h-full w-80 bg-zinc-900',
            'data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full',
            'transition-transform duration-300 ease-in-out',
          )}
        >
          <div className="flex items-center justify-between border-zinc-800 border-b px-4 py-4">
            <Logo />
            <Dialog.Close
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-zinc-800 hover:text-primary"
                >
                  <IconX />
                </button>
              )}
            />
          </div>

          <div className="border-zinc-800 border-t px-4">
            <div className="space-y-3 py-6">
              <Link
                to="/"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                Our Mission
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                The Dorean Principle
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                Roadmap
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="block font-semibold text-lg text-primary hover:text-indigo-400"
              >
                Request a Feature
              </Link>
            </div>

            {/* Legal Links */}
            <div className="space-y-3 border-zinc-800 border-t py-6">
              <Link
                to="/"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                Terms of Service
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                Privacy Policy
              </Link>
              <Link
                to="/"
                onClick={handleClose}
                className="block font-medium text-primary text-sm hover:text-primary"
              >
                DCMA
              </Link>
            </div>

            <div className="mb-6">
              <DonateCard />
            </div>

            <footer className="pb-6">
              <p className="text-muted text-xs">
                Let's Church is in the public domain and is operated as a
                non-profit.{' '}
                <Link to="/" className="text-primary hover:text-indigo-300">
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
