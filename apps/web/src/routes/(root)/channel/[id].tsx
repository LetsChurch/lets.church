import { useParams } from 'solid-start';

export default function ChannelRoute() {
  const params = useParams<{ id: string }>();

  return <h1>Channel: {params.id}</h1>;
}
