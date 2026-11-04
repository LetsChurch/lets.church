import HCaptcha from '@hcaptcha/react-hcaptcha';
import { IconMail } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { HCaptchaNotice } from '@/components/ui/form';
import { useTRPC } from '@/trpc/react';

export function NewsletterCard() {
  const trpc = useTRPC();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  // execute() waits for the hCaptcha script, forever if it is blocked or fails
  // to load, so only run it once the widget reports it is ready.
  const [captchaLoaded, setCaptchaLoaded] = useState(false);
  // The card is on the home page; don't load hCaptcha's third-party script for
  // every visitor, only for someone who starts to subscribe.
  const [captchaWanted, setCaptchaWanted] = useState(false);

  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  const subscribeMutation = useMutation(
    trpc.newsletter.subscribe.mutationOptions({
      onSuccess: (data) => {
        if (data.success) {
          setSuccess(true);
          setError(null);
          setEmail('');
        } else {
          setError(data.error || 'Failed to subscribe. Please try again.');
        }
      },
      onError: () => {
        setError('Unable to subscribe at this time. Please try again later.');
      },
    }),
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (verifying || subscribeMutation.isPending) return;
    if (!captchaLoaded || !captchaRef.current) {
      setCaptchaWanted(true);
      setError('Verification is still loading. Please try again in a moment.');
      return;
    }
    setError(null);
    setSuccess(false);
    setVerifying(true);
    let hcaptchaToken: string;
    try {
      ({ response: hcaptchaToken } = await captchaRef.current.execute({
        async: true,
      }));
    } catch {
      setError('Please complete the verification.');
      return;
    } finally {
      setVerifying(false);
    }
    subscribeMutation.mutate(
      { email, hcaptchaToken },
      { onSettled: () => captchaRef.current?.resetCaptcha() },
    );
  };

  const busy = verifying || subscribeMutation.isPending;

  return (
    <div className="border-fancy-pants flex aspect-video flex-col gap-2 rounded-lg bg-emerald-500 p-4">
      <h3 className="text-base font-bold text-white">
        Want updates about Let's Church?
      </h3>
      <p className="text-xs leading-relaxed text-white">
        Subscribe to our newsletter to get updates on new features, platform
        improvements, and upcoming changes. No spam, just the important stuff.
      </p>

      <div className="mt-auto flex flex-col gap-1">
        {success ? (
          <p className="text-xs font-bold text-white" role="status">
            Subscribed! Thank you for joining our newsletter.
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-bold text-white" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <div className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 transition-colors focus-within:border-white/40 focus-within:bg-white/20 hover:border-white/30 hover:bg-white/15">
            <IconMail size={18} className="text-white opacity-70" />
            <input
              onFocus={() => setCaptchaWanted(true)}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              aria-label="Email address"
              className="flex-1 appearance-none bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/50"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? 'Subscribing...' : 'Subscribe'}
            </button>
          </div>
        </form>
        {captchaWanted && env?.HCAPTCHA_SITE_KEY ? (
          <HCaptcha
            ref={captchaRef}
            // onReady, not onLoad: onLoad only fires when this instance loads
            // the script, not when an earlier page already did.
            onReady={() => setCaptchaLoaded(true)}
            sitekey={env.HCAPTCHA_SITE_KEY}
            size="invisible"
          />
        ) : null}
        <HCaptchaNotice className="text-[10px] text-white/70" />
      </div>
    </div>
  );
}
