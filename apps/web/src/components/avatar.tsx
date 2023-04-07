export type Props = {
  src: string | null;
  size: 'sm' | 'md' | 'lg' | 'xl';
  alt?: string;
};

export function Avatar(props: Props) {
  return (
    <img
      class={`inline-block rounded-full bg-gray-200 text-transparent ${
        props.size === 'xl'
          ? 'h-16 w-16'
          : props.size === 'lg'
          ? 'h-12 w-12'
          : props.size === 'md'
          ? 'h-10 w-10'
          : 'h-8 w-8'
      }`}
      src={props.src ?? ''}
      alt={props.alt ?? 'Avatar'}
    />
  );
}
