import HCaptcha from '@hcaptcha/react-hcaptcha';
import { IconMail } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import { useTRPC } from '@/trpc/react';

export function NewsletterCard() {
  const trpc = useTRPC();
  const [opened, setOpened] = useState(false);
  const [email, setEmail] = useState('');
  const [hcaptchaToken, setHCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);

  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  const subscribeMutation = useMutation(
    trpc.newsletter.subscribe.mutationOptions({
      onSuccess: (data) => {
        if (data.success) {
          setSuccess(true);
          setError(null);
          // Close modal after 2 seconds
          setTimeout(() => {
            setOpened(false);
            setEmail('');
            setHCaptchaToken('');
            setSuccess(false);
          }, 2000);
        } else {
          setError(data.error || 'Failed to subscribe. Please try again.');
        }
      },
      onError: () => {
        setError('Unable to subscribe at this time. Please try again later.');
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setOpened(true);
  };

  const handleCaptchaSubmit = () => {
    if (!hcaptchaToken) {
      setError('Please complete the verification.');
      return;
    }
    subscribeMutation.mutate(
      { email, hcaptchaToken },
      {
        onSettled: () => {
          setHCaptchaToken('');
          captchaRef.current?.resetCaptcha();
        },
      },
    );
  };

  return (
    <>
      <div className="border-fancy-pants flex aspect-video flex-col gap-2 rounded-lg bg-emerald-500 p-4">
        <h3 className="text-base font-bold text-white">
          Want updates about Let's Church?
        </h3>
        <p className="text-xs leading-relaxed text-white">
          Subscribe to our newsletter to get updates on new features, platform
          improvements, and upcoming changes. No spam, just the important stuff.
        </p>

        <div className="mt-auto">
          <form onSubmit={handleSubmit}>
            <div className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 transition-colors focus-within:border-white/40 focus-within:bg-white/20 hover:border-white/30 hover:bg-white/15">
              <IconMail size={18} className="text-white opacity-70" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 appearance-none bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/50"
                required
              />
              <button
                type="submit"
                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-gray-50"
              >
                Subscribe
              </button>
            </div>
          </form>
        </div>
      </div>

      <LcModal.Root
        open={opened}
        onOpenChange={(open) => {
          setOpened(open);
          if (!open) {
            setError(null);
            setHCaptchaToken('');
            captchaRef.current?.resetCaptcha();
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Verify you're human" />

            <div className="flex flex-col gap-4">
              {success ? (
                <p className="font-medium text-green-600">
                  Successfully subscribed! Thank you for joining our newsletter.
                </p>
              ) : (
                <>
                  <LcModal.Description>
                    Please complete the verification below to subscribe to our
                    newsletter.
                  </LcModal.Description>

                  {error ? (
                    <p className="text-sm text-red-600">{error}</p>
                  ) : null}

                  <div className="flex justify-center">
                    {env?.HCAPTCHA_SITE_KEY ? (
                      <HCaptcha
                        ref={captchaRef}
                        sitekey={env.HCAPTCHA_SITE_KEY}
                        onVerify={setHCaptchaToken}
                        onExpire={() => setHCaptchaToken('')}
                        onError={() => setHCaptchaToken('')}
                      />
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleCaptchaSubmit}
                    disabled={!hcaptchaToken || subscribeMutation.isPending}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {subscribeMutation.isPending
                      ? 'Subscribing...'
                      : 'Subscribe'}
                  </button>
                </>
              )}
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </>
  );
}
