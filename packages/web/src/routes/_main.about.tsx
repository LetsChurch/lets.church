import { createFileRoute, Outlet } from '@tanstack/react-router';
import Header from '@/components/header';

export const Route = createFileRoute('/_main/about')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />
      <Outlet />
    </div>
  );
}
