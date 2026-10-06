import '@/assets/app.css';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';

import { onMessage } from '@/lib/messages';

import { App } from './App';
import { startRunner } from './runner';

// Answer the background's "is the queue open?" so it focuses this tab instead
// of opening a second runner.
onMessage((message) =>
  message.type === 'queue:ping'
    ? browser.tabs.getCurrent().then((tab) => {
        if (tab?.id === undefined) {
          throw new Error('Queue page is not in a tab');
        }
        return tab.id;
      })
    : undefined,
);

// One runner per browser: Web Locks are shared across extension pages, so a
// second queue tab waits instead of double-uploading.
void navigator.locks.request('lets-church-mirror-runner', () => startRunner());

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
