import { UploadViewSource } from '@letschurch/db/types';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Player } from '@/components/player';
import { trpcClient, useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/embed/media/$mediaId')({
  component: RouteComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center">
      <p className="text-gray-300 text-sm">Media not found.</p>
    </div>
  ),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      type: (search.type as 'video' | 'audio' | undefined) ?? 'video',
    };
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    // Only primes/returns media (head() needs it for SEO meta, where hooks
    // can't run). View recording happens in a mount effect in the component —
    // loaders also run on preload/revalidation, which would count views the
    // user never actually saw.
    const media = await queryClient.ensureQueryData(
      trpc.media.getMediaById.queryOptions({
        mediaId: params.mediaId,
      }),
    );

    // getMediaById returns null for missing/private/unapproved media; render
    // the route's notFoundComponent instead of crashing on the destructure.
    if (!media) {
      throw notFound();
    }

    // Exclude the probe field from media to avoid serialization issues
    const { probe: _probe, ...mediaWithoutProbe } = media;

    return {
      media: mediaWithoutProbe,
    };
  },
  head: ({ loaderData }) => {
    const media = loaderData?.media;
    if (!media) return {};
    const title = media.title
      ? `${media.title} - Let's Church`
      : "Let's Church";
    const description =
      media.description ||
      `Watch ${media.title || 'this video'} on Let's Church`;
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/embed/media/${media.id}`;
    const imageUrl = media.fullSizeThumbnailUrl || media.posterThumbnailUrl;

    return {
      meta: [
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'video.other',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        ...(imageUrl
          ? [
              {
                property: 'og:image',
                content: imageUrl,
              },
            ]
          : []),
        ...(media.width
          ? [
              {
                property: 'og:image:width',
                content: media.width.toString(),
              },
            ]
          : []),
        ...(media.height
          ? [
              {
                property: 'og:image:height',
                content: media.height.toString(),
              },
            ]
          : []),
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://lets.church/embed/media/${media.id}`,
        },
      ],
    };
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const trpc = useTRPC();

  const { data: mediaData } = useSuspenseQuery(
    trpc.media.getMediaById.queryOptions({
      mediaId: params.mediaId,
    }),
  );

  // getMediaById returns null for missing/inaccessible media, but the loader
  // throws notFound() in that case, so by the time this component renders the
  // media is guaranteed to be present.
  const media = mediaData as NonNullable<typeof mediaData>;

  // Record a view once the embed actually mounts on the client — not in the
  // loader, which also runs on preload/revalidation. createUploadView returns
  // the daily viewHash the player uses to record watch-time; it stays '' until
  // the mutation resolves, which the player treats as "not ready to record".
  const [viewHash, setViewHash] = useState('');
  useEffect(() => {
    let cancelled = false;
    trpcClient.media.createUploadView
      .mutate({
        uploadRecordId: params.mediaId,
        source: UploadViewSource.EMBED,
      })
      .then((res) => {
        if (!cancelled) {
          setViewHash(res?.viewHash ?? '');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.mediaId]);

  // Determine what type to show based on query param and availability
  const requestedType = search.type;
  const hasVideo = media.mediaSource !== null;
  const hasAudio = media.audioSource !== null;

  // Show video if requested and available, otherwise show audio if available
  const showVideo =
    requestedType === 'video'
      ? hasVideo
      : requestedType === 'audio'
        ? false
        : hasVideo;

  // For video: use actual dimensions, for audio: use a fixed ratio that looks good
  const aspectWidth = showVideo ? (media.width ?? 1920) : 8;
  const aspectHeight = showVideo ? (media.height ?? 1080) : 3;

  return (
    <div
      className="flex w-full items-center justify-center bg-black"
      style={
        !showVideo
          ? {
              height: '150px',
            }
          : {
              minHeight: 0,
            }
      }
    >
      <Player
        uploadRecordId={params.mediaId}
        viewHash={viewHash}
        mediaSource={showVideo ? media.mediaSource : null}
        audioSource={!showVideo && hasAudio ? media.audioSource : null}
        posterThumbnailUrl={media.posterThumbnailUrl}
        videoWidth={aspectWidth}
        videoHeight={aspectHeight}
        peaksJsonUrl={media.peaksJsonUrl}
        lengthSeconds={media.lengthSeconds}
        videoClassName="w-full"
        embed={true}
      />
    </div>
  );
}
