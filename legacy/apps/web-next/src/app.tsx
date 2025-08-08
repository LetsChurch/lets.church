// @refresh reload
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { ErrorBoundary, Suspense } from 'solid-js';
import { MetaProvider } from '@solidjs/meta';
import * as Sentry from '@sentry/browser';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Suspense>
            <ErrorBoundary
              fallback={(error) => {
                Sentry.captureException(error);

                return <h1>Error: {error.message}</h1>;
              }}
            >
              {props.children}
            </ErrorBoundary>
          </Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
