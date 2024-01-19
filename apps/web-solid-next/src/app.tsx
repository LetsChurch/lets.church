// @refresh reload
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start';
import { Suspense } from 'solid-js';
import { MetaProvider, Title } from '@solidjs/meta';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Let's Church</Title>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
