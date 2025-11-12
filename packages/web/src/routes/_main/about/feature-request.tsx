import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_main/about/feature-request')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_main/about/feature-request"!</div>;
}
