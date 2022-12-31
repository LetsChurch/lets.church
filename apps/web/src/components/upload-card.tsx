export type VideoCardProps = {
  title: string;
  channel: string;
  href: string;
  avatarUrl: string;
};

export default function UploadCard(props: VideoCardProps) {
  const resolvedTitle = () => props.title || 'Untitled';

  return (
    <div class="relative space-y-3">
      <div class="aspect-video bg-gray-100" />
      <div class="flex items-center space-x-3 overflow-hidden">
        <img
          class="h-8 w-8 rounded-full"
          src={props.avatarUrl}
          alt={resolvedTitle()}
        />
        <a
          href={props.href}
          class="block min-w-0 before:absolute before:inset-0"
        >
          <p class="truncate text-sm font-medium text-gray-900">
            {resolvedTitle()}
          </p>
          <p class="truncate text-sm text-gray-500">{props.channel}</p>
        </a>
      </div>
    </div>
  );
}
