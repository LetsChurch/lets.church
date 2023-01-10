import { useParams } from 'solid-start';

export default function MediaRoute() {
  const params = useParams<{ id: string }>();

  return <h1>Media: {params.id}</h1>;
}
