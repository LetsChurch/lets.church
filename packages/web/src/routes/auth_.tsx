import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

import Logo from '@/components/logo';

export const Route = createFileRoute('/auth_')({
  component: AuthLayoutComponent,
});

function AuthLayoutComponent() {
  return (
    <div className="bg-page flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
