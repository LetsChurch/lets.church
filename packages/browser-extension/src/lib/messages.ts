/**
 * Typed runtime messages between the Studio content script, the queue page,
 * and the background. The background is the only Studio-facing context that
 * can call lets.church (content-script fetches are bound by Studio's CORS).
 */
import { browser, type Browser } from 'wxt/browser';

import type {
  DuplicateMatch,
  LcContext,
  LcVisibility,
  StudioVideo,
} from './types';

export type Message =
  | { type: 'lc:getContext' }
  | {
      type: 'lc:findDuplicates';
      channelId: string;
      videos: Array<StudioVideo>;
    }
  | {
      type: 'queue:enqueue';
      videos: Array<StudioVideo>;
      channelId: string;
      channelName: string;
      visibility: LcVisibility | null;
    }
  | { type: 'queue:open' }
  /** Background → queue page: are you open? Answers with its tab id. */
  | { type: 'queue:ping' }
  /** Background → Studio tab: re-read videos for fresh download links. */
  | { type: 'studio:getVideos'; videoIds: Array<string> };

export type MessageResult = {
  'lc:getContext': LcContext | null;
  'lc:findDuplicates': Record<string, DuplicateMatch>;
  'queue:enqueue': { added: number; skipped: number };
  'queue:open': null;
  'queue:ping': number;
  'studio:getVideos': Array<StudioVideo>;
};

/** Envelope so errors cross the message boundary as data, not rejections. */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

export async function send<M extends Message>(
  message: M,
): Promise<MessageResult[M['type']]> {
  const reply = (await browser.runtime.sendMessage(message)) as
    | Reply<MessageResult[M['type']]>
    | undefined;
  if (!reply) {
    throw new Error('No response from the extension background.');
  }
  if (!reply.ok) {
    throw new Error(reply.error);
  }
  return reply.value;
}

export async function sendToTab<M extends Message>(
  tabId: number,
  message: M,
): Promise<MessageResult[M['type']]> {
  const reply = (await browser.tabs.sendMessage(tabId, message)) as
    | Reply<MessageResult[M['type']]>
    | undefined;
  if (!reply) {
    throw new Error('No response from the YouTube Studio tab.');
  }
  if (!reply.ok) {
    throw new Error(reply.error);
  }
  return reply.value;
}

/**
 * Register a message handler that answers through the `Reply` envelope.
 * Uses `sendResponse` + `return true`, which both Chrome and Firefox support
 * for async replies. Return `undefined` from `handle` to leave a message for
 * another listener.
 */
export function onMessage(
  handle: (
    message: Message,
    sender: Browser.runtime.MessageSender,
  ) => Promise<unknown> | undefined,
) {
  browser.runtime.onMessage.addListener(
    (
      message: Message,
      sender,
      sendResponse: (reply: Reply<unknown>) => void,
    ) => {
      const result = handle(message, sender);
      if (!result) {
        return false;
      }
      result.then(
        (value) => sendResponse({ ok: true, value: value ?? null }),
        (err: unknown) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      return true;
    },
  );
}
