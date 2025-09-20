export type Props = {
  title: string;
};

export function MediaCard({ title }: Props) {
  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-lg border border-top-highlight bg-card" />
      <div className="flex flex-row items-center gap-2">
        <div className="size-8 rounded-full bg-white" />
        <div className="space-y-1">
          <h3 className="line-clamp-2 font-medium text-primary text-sm">
            {title}
          </h3>
          <p className="text-secondary text-xs">Channel Name</p>
        </div>
      </div>
    </div>
  );
}
