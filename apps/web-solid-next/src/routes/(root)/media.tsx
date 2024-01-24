import { ParentProps } from 'solid-js';
import Header from '~/components/media/header';

export default function MediaLayout(props: ParentProps) {
  return (
    <>
      <Header class="mb-5" />
      {props.children}
    </>
  );
}
