import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type UlProps = JSX.IntrinsicElements['ul'];

export function Ul(props: UlProps) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <ul class={cn('ml-8 mt-4 list-disc', localProps.class)} {...restProps} />
  );
}

export type OlProps = JSX.IntrinsicElements['ol'];

export function Ol(props: OlProps) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <ol class={cn('ml-8 mt-4 list-decimal', localProps.class)} {...restProps} />
  );
}
