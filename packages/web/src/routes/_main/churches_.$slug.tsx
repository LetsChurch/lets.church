import {
  IconBuilding,
  IconBuildingChurch,
  IconChevronRight,
  IconMail,
  IconMapPin,
  IconPhone,
  IconWorld,
} from '@tabler/icons-react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar';
import Header from '@/components/header';
import { MediaCarousel } from '@/components/media-carousel';
import { Tag } from '@/components/tag';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

export const Route = createFileRoute('/_main/churches_/$slug')({
  component: ChurchProfileComponent,
});

// Generate a consistent color based on a string hash
function getColorFromString(str: string): {
  from: string;
  via: string;
  to: string;
} {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Define color palettes (hue ranges for pleasant gradients)
  const palettes = [
    // Indigo/Purple
    { from: 'from-indigo-600', via: 'via-purple-600', to: 'to-indigo-700' },
    // Blue/Cyan
    { from: 'from-blue-600', via: 'via-cyan-600', to: 'to-blue-700' },
    // Teal/Green
    { from: 'from-teal-600', via: 'via-green-600', to: 'to-teal-700' },
    // Purple/Pink
    { from: 'from-purple-600', via: 'via-pink-600', to: 'to-purple-700' },
    // Rose/Orange
    { from: 'from-rose-600', via: 'via-orange-600', to: 'to-rose-700' },
    // Violet/Fuchsia
    { from: 'from-violet-600', via: 'via-fuchsia-600', to: 'to-violet-700' },
    // Emerald/Lime
    { from: 'from-emerald-600', via: 'via-lime-600', to: 'to-emerald-700' },
    // Sky/Blue
    { from: 'from-sky-600', via: 'via-blue-600', to: 'to-sky-700' },
  ];

  // Use hash to select a palette
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
}

function ChurchProfileComponent() {
  const { slug } = Route.useParams();
  const trpc = useTRPC();

  const { data: church } = useSuspenseQuery(
    trpc.church.getOrganizationBySlug.queryOptions({ slug }),
  );

  const { data: churchMedia } = useQuery(
    trpc.church.getOrganizationMedia.queryOptions({ slug, limit: 10 }),
  );

  if (!church) {
    return (
      <div className="mx-auto mt-32 max-w-5xl px-6 text-center">
        <IconBuildingChurch
          size={64}
          className="mx-auto mb-6 text-zinc-300 dark:text-zinc-700"
          strokeWidth={1.5}
        />
        <h1 className="font-bold text-4xl text-zinc-900 tracking-tight dark:text-white">
          Church not found
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-zinc-600 leading-relaxed dark:text-zinc-400">
          The church you're looking for doesn't exist or may have been removed.
        </p>
        <Link
          to="/churches"
          className="mt-8 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition-all hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          Browse all churches
        </Link>
      </div>
    );
  }

  const hasContactInfo =
    church.primaryEmail || church.primaryPhoneNumber || church.websiteUrl;

  const headerColors = getColorFromString(church.name);
  const darkHeaderColors = {
    from: headerColors.from.replace('-600', '-900'),
    via: headerColors.via.replace('-600', '-900'),
    to: headerColors.to.replace('-700', '-950'),
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 via-white to-indigo-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/20">
      {/* Cover Image or Gradient Header */}
      <div className="relative">
        {church.coverUrl ? (
          <div className="h-80 overflow-hidden">
            <img
              src={church.coverUrl}
              alt=""
              className="size-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`h-48 overflow-hidden bg-linear-to-br ${headerColors.from} ${headerColors.via} ${headerColors.to} dark:${darkHeaderColors.from} dark:${darkHeaderColors.via} dark:${darkHeaderColors.to}`}
          >
            <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/10 dark:to-black/20" />
            <div className="absolute inset-0 opacity-20">
              <svg
                className="size-full"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <defs>
                  <pattern
                    id="grid"
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 32 0 L 0 0 0 32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          </div>
        )}

        {/* Header overlay with gradient */}
        <div className="absolute inset-x-0 top-0">
          <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/30 to-transparent" />
          <div className="relative">
            <Header
              searchPlaceholder={`Search...`}
              showBlurredBackground={false}
              variant="light"
            />
          </div>
        </div>
      </div>

      <div className="isolate mx-auto max-w-5xl px-6 pb-24">
        {/* Profile Header */}
        <div className="-mt-12 sm:-mt-16 mb-8 sm:mb-12">
          <div className="flex items-center overflow-hidden rounded-full border-fancy-pants bg-white shadow-lg dark:bg-zinc-900">
            <Avatar
              src={church.avatarUrl}
              alt={church.name}
              className="size-20 shrink-0 sm:size-32 lg:size-40"
              fallbackClassName="text-xl sm:text-3xl lg:text-4xl"
            />
            <div className="flex-1 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-6">
              <h1 className="font-bold text-xl text-zinc-900 tracking-tight sm:text-3xl lg:text-4xl dark:text-white">
                {church.name}
              </h1>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-8 lg:col-span-2">
            {/* Description and Tags */}
            {church.description || church.tags.length > 0 ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 font-medium text-primary text-sm">About</h2>
                {church.description ? (
                  <p className="whitespace-pre-wrap text-lg text-secondary leading-relaxed">
                    {church.description}
                  </p>
                ) : null}

                {church.tags.length > 0 ? (
                  <div className={church.description ? 'mt-6' : ''}>
                    {Object.entries(
                      church.tags.reduce(
                        (acc, tag) => {
                          const category = tag.category;
                          if (!acc[category]) {
                            acc[category] = [];
                          }
                          acc[category].push(tag);
                          return acc;
                        },
                        {} as Record<string, typeof church.tags>,
                      ),
                    ).map(([category, tags]) => (
                      <div key={category} className="mb-4 last:mb-0">
                        <h3 className="mb-2 font-medium text-muted text-xs uppercase tracking-wider">
                          {category.toLowerCase().replace('_', ' ')}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <Tag
                              key={tag.slug}
                              size="sm"
                              color={
                                tag.color as
                                  | 'BLUE'
                                  | 'GREEN'
                                  | 'RED'
                                  | 'INDIGO'
                                  | 'PINK'
                                  | 'PURPLE'
                                  | 'GRAY'
                              }
                            >
                              {tag.label}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Official Channels */}
            {/* Note: Only show this section if there are channels OR if there's contact info to encourage upload.
              Churches without channels AND without contact info shouldn't really be listed anyway. */}
            {church.officialChannels.length > 0 || hasContactInfo ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 font-medium text-primary text-sm">
                  Official Channels
                </h2>
                {church.officialChannels.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {church.officialChannels.map((channel) => {
                      return (
                        <Link
                          key={channel.slug}
                          to="/channel/$slug"
                          params={{ slug: channel.slug }}
                          className="group flex items-center gap-4 rounded-xl bg-zinc-50/50 p-4 transition-all hover:shadow-md dark:bg-zinc-800/50"
                        >
                          <Avatar
                            src={channel.avatarUrl}
                            alt={channel.name}
                            className="size-14 shrink-0"
                            fallbackClassName="text-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-primary">
                              {channel.name}
                            </h3>
                            <p className="text-secondary text-sm">
                              Official channel
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl bg-zinc-50/50 p-6 text-center dark:bg-zinc-800/50">
                    <p className="mb-4 text-secondary text-sm leading-relaxed">
                      Want to search and watch their sermons? Let them know!
                    </p>
                    {church.primaryEmail ? (
                      <a
                        href={`mailto:${church.primaryEmail}?subject=${encodeURIComponent(`Upload your sermons to Let's Church`)}&body=${encodeURIComponent(`Hi,\n\nI noticed that ${church.name} is listed on Let's Church (https://lets.church), but doesn't have any sermons uploaded yet.\n\nI'd love to be able to search and watch your sermons on the platform. Would you consider uploading them?\n\nThanks!`)}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-sm text-white transition-all hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      >
                        <IconMail size={16} strokeWidth={2} />
                        Send them an email
                      </a>
                    ) : (
                      <div className="space-y-2 text-secondary text-sm">
                        <p className="font-medium">Contact them:</p>
                        <div className="flex flex-wrap justify-center gap-3">
                          {church.primaryPhoneNumber ? (
                            <a
                              href={church.primaryPhoneUri ?? undefined}
                              className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              <IconPhone size={14} strokeWidth={2} />
                              {church.primaryPhoneNumber}
                            </a>
                          ) : null}
                          {church.websiteUrl ? (
                            <a
                              href={church.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              <IconWorld size={14} strokeWidth={2} />
                              Website
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {churchMedia && churchMedia.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-4 font-medium text-primary text-sm">
                      Recent Uploads
                    </h3>
                    <MediaCarousel
                      items={churchMedia.map((media) => ({
                        id: media.id,
                        title: media.title,
                        thumbnailUrl: media.thumbnailUrl,
                        channelName: media.channel.name,
                        channelAvatarUrl: media.channel.avatarUrl,
                        duration: media.lengthSeconds
                          ? formatTime(media.lengthSeconds * 1000)
                          : undefined,
                      }))}
                      edgeMargin="-mx-5 px-5"
                      fadeSize={0}
                      buttonPositioning="inside"
                      tailerCard={
                        church.officialChannels.length > 0 ? (
                          <Link
                            to="/channel/$slug"
                            params={{ slug: church.officialChannels[0].slug }}
                            className="flex aspect-video items-center justify-center rounded-lg border-fancy-pants bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                          >
                            <div className="flex items-center gap-2 text-center">
                              <span className="font-medium text-primary text-sm">
                                Browse all content
                              </span>
                              <IconChevronRight className="size-4 text-muted" />
                            </div>
                          </Link>
                        ) : undefined
                      }
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Endorsed Channels */}
            {church.endorsedChannels.length > 0 ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 font-medium text-primary text-sm">
                  Endorsed Channels
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {church.endorsedChannels.map((channel) => {
                    return (
                      <Link
                        key={channel.slug}
                        to="/channel/$slug"
                        params={{ slug: channel.slug }}
                        className="group flex items-center gap-4 rounded-xl bg-zinc-50/50 p-4 transition-all hover:shadow-md dark:bg-zinc-800/50"
                      >
                        <Avatar
                          src={channel.avatarUrl}
                          alt={channel.name}
                          className="size-14 shrink-0"
                          fallbackClassName="text-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-primary">
                            {channel.name}
                          </h3>
                          <p className="text-secondary text-sm">Endorsed</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:col-span-1">
            {/* Contact Information */}
            {hasContactInfo ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 flex items-center gap-2 font-medium text-primary text-sm">
                  <IconBuilding size={16} strokeWidth={2} />
                  Contact
                </h2>
                <div className="space-y-3">
                  {church.primaryEmail ? (
                    <a
                      href={`mailto:${church.primaryEmail}`}
                      className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                    >
                      <IconMail
                        size={20}
                        className="mt-0.5 shrink-0 text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                        strokeWidth={1.5}
                      />
                      <span className="break-all text-secondary text-sm group-hover:text-indigo-600 dark:group-hover:text-white">
                        {church.primaryEmail}
                      </span>
                    </a>
                  ) : null}
                  {church.primaryPhoneNumber ? (
                    <a
                      href={church.primaryPhoneUri ?? undefined}
                      className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                    >
                      <IconPhone
                        size={20}
                        className="mt-0.5 shrink-0 text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                        strokeWidth={1.5}
                      />
                      <span className="text-secondary text-sm group-hover:text-indigo-600 dark:group-hover:text-white">
                        {church.primaryPhoneNumber}
                      </span>
                    </a>
                  ) : null}
                  {church.websiteUrl ? (
                    <a
                      href={church.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                    >
                      <IconWorld
                        size={20}
                        className="mt-0.5 shrink-0 text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                        strokeWidth={1.5}
                      />
                      <span className="break-all text-secondary text-sm group-hover:text-indigo-600 dark:group-hover:text-white">
                        {church.websiteUrl.replace(/^https?:\/\//, '')}
                      </span>
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Addresses */}
            {church.addresses.length > 0 ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 flex items-center gap-2 font-medium text-primary text-sm">
                  <IconMapPin size={16} strokeWidth={2} />
                  {church.addresses.length === 1 ? 'Location' : 'Locations'}
                </h2>
                <div className="space-y-4">
                  {church.addresses.map((address) => {
                    const addressLines = [
                      address.name,
                      address.streetAddress,
                      address.postOfficeBoxNumber
                        ? `PO Box ${address.postOfficeBoxNumber}`
                        : null,
                      [address.locality, address.region]
                        .filter(Boolean)
                        .join(', '),
                      address.postalCode,
                      address.country,
                    ].filter(Boolean);

                    const addressKey = `${address.type}-${address.streetAddress}-${address.locality}`;

                    return (
                      <div key={addressKey} className="rounded-lg p-3">
                        {address.type && church.addresses.length > 1 ? (
                          <p className="mb-2 font-medium text-indigo-600 text-xs uppercase tracking-wider dark:text-indigo-400">
                            {address.type.toLowerCase()}
                          </p>
                        ) : null}
                        <address className="space-y-0.5 text-secondary text-sm not-italic leading-relaxed">
                          {addressLines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </address>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
