import { useParams } from 'solid-start';
import { PageHeading } from '~/components/page-heading';

export default function ChannelRoute() {
  const params = useParams();

  return (
    <>
      <PageHeading title={`Channel: ${params['id']}`} backButton />
      <p>Hello</p>
    </>
  );
}
