import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

export const DONATE_CARD_COOKIE_NAME = 'lc-donate-card-dismissed';
export const DONATE_CARD_CHANGE_EVENT = 'donate-card-dismissed-change';

export const getInitialDonateCardDismissed = createIsomorphicFn()
  .client(() =>
    Boolean(JSON.parse(Cookies.get(DONATE_CARD_COOKIE_NAME) ?? 'false')),
  )
  .server(() =>
    Boolean(JSON.parse(getCookie(DONATE_CARD_COOKIE_NAME) ?? 'false')),
  );

export function setDonateCardDismissed(dismissed: boolean) {
  if (typeof window !== 'undefined') {
    Cookies.set(DONATE_CARD_COOKIE_NAME, JSON.stringify(dismissed), {
      expires: 14, // 14 days
    });
    window.dispatchEvent(
      new CustomEvent(DONATE_CARD_CHANGE_EVENT, { detail: { dismissed } }),
    );
  }
}
