import { useLocation } from '@solidjs/router';
import { Meta } from '@solidjs/meta';
import bannerUrl from './og-banner.png';
import type { Optional } from '~/util';

export type Props = {
  title: string;
  description: string;
  image?: Optional<string>;
  // TODO: try feeding in url without location if this is still crashing
};

export default function Og(props: Props) {
  const loc = useLocation();
  const url = () => `https://lets.church/${loc.pathname}${loc.search}`;

  return (
    <>
      <Meta name="description" content={props.description} />

      <Meta property="og:url" content={url()} />
      <Meta property="og:type" content="website" />
      <Meta property="og:title" content={props.title} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:image" content={props.image ?? bannerUrl} />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta property="twitter:domain" content="lets.church" />
      <Meta property="twitter:url" content={url()} />
      <Meta name="twitter:title" content={props.title} />
      <Meta name="twitter:description" content={props.description} />
      <Meta name="twitter:image" content={props.image ?? bannerUrl} />
    </>
  );
}
