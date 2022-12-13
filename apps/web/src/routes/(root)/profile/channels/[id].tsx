import { useParams } from 'solid-start';
import { useCrumb } from '~/components/page-breadcrumbs';

export default function ChannelRoute() {
  const params = useParams();

  useCrumb({
    title: params['id'] ?? '',
    href: `/profile/channels/${params['id']}`,
  });

  return <h1>Channel: {params['id']}</h1>;
}
