import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasValidSession } from '../auth_/login';

export const Route = createFileRoute('/dashboard_/')({
  component: DashboardHome,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
});

function DashboardHome() {
  return <h1>Dashboard Home</h1>;
}
