import { PageHeading } from '~/components/page-heading';
import { RequireUser } from '~/util/user-context';

export default function ProfileChurchesRoute() {
  return (
    <RequireUser>
      {() => (
        <>
          <PageHeading
            title="Churches"
            actions={[{ label: 'Add Church', variant: 'primary', href: 'new' }]}
          />
          <p>Hello</p>
        </>
      )}
    </RequireUser>
  );
}
