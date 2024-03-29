export default function ListHeading(props: { children: string }) {
  return (
    <h2 class="sticky bg-white px-2 pt-1 text-xs font-semibold text-gray-900">
      {props.children}
    </h2>
  );
}
