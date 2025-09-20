export type Props = {
  title: string;
};

export function SavedCard({ title }: Props) {
  return (
    <div className="flex items-stretch gap-3">
      <div className="aspect-video h-16 rounded border border-top-highlight bg-card" />
      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <h4 className="line-clamp-1 font-medium text-primary text-sm">
          {title}
        </h4>
        <div className="flex flex-row gap-1.5">
          <div className="size-4 rounded-full bg-white" />
          <p className="text-secondary text-xs">Channel</p>
        </div>
      </div>
    </div>
  );
}
