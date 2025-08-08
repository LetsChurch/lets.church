import A from './a';

export type Props = {
  text: string;
  id: string;
  href: string;
  label: string;
};

export default function AboutFootnote(props: Props) {
  return (
    <aside class="mt-4">
      <ol>
        <li id={props.id}>
          <small>
            &ast; {props.text}
            <A
              href={props.href}
              aria-label={props.label}
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              role="doc-backlink"
            >
              ↩
            </A>
          </small>
        </li>
      </ol>
    </aside>
  );
}
