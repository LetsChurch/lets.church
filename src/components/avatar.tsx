export type Props = {
  src?: string | null;
  alt: string;
  size?: number;
};

export function Avatar({ src, alt, size = 32 }: Props) {
  return (
    <div
      className="overflow-hidden rounded-full bg-white"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : null}
    </div>
  );
}
