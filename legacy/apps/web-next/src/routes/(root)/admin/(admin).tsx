import { PageHeading } from '~/components/page-heading';
import { RequireUser } from '~/util/user-context';

export default function AdminRoute() {
  return (
    <RequireUser requireAdmin>
      {(user) => (
        <div>
          <PageHeading title="Admin" />
          <p>Hello, {user.username}!</p>
        </div>
      )}
    </RequireUser>
  );
}
