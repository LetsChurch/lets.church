import { PageHeading } from '~/components/page-heading';
import { RequireUser } from '~/util/user-context';
import ChurchForm from '~/components/settings/church-form';

export default function ProfileNewChurchesRoute() {
  return (
    <RequireUser>
      {() => (
        <>
          <PageHeading title="Add New Church" backButton />
          <ChurchForm />
        </>
      )}
    </RequireUser>
  );
}
