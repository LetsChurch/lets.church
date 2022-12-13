import ChevronLeft from '@tabler/icons/chevron-left.svg?component-solid';
import ChevronRight from '@tabler/icons/chevron-right.svg?component-solid';
import {
  Accessor,
  createContext,
  createSignal,
  For,
  onCleanup,
  onMount,
  ParentProps,
  Show,
  useContext,
} from 'solid-js';
import { A } from 'solid-start';

type Crumb = {
  title: string;
  href: string;
};

const BreadcrumbContext =
  createContext<
    readonly [
      Accessor<Array<Crumb>>,
      { addCrumb: (crumb: Crumb) => void; removeCrumb: (crumb: Crumb) => void },
    ]
  >();

export function BreadcrumbProvider(props: ParentProps) {
  const [crumbs, setCrumbs] = createSignal<Array<Crumb>>([]);

  const value = [
    crumbs,
    {
      addCrumb(crumb: Crumb) {
        setCrumbs((a) => [...a, crumb]);
      },
      removeCrumb({ title, href }: Crumb) {
        setCrumbs((a) => a.filter((c) => c.title !== title && c.href !== href));
      },
    },
  ] as const;

  return (
    <BreadcrumbContext.Provider value={value}>
      {props.children}
    </BreadcrumbContext.Provider>
  );
}

export function useCrumb(crumb: Crumb) {
  const [, { addCrumb, removeCrumb }] = useContext(BreadcrumbContext)!;

  onMount(() => addCrumb(crumb));
  onCleanup(() => removeCrumb(crumb));
}

// TODO: fix pop-in
export default function PageBreadcrumbs() {
  const [crumbs] = useContext(BreadcrumbContext)!;

  const lastCrumb = () => {
    const list = crumbs();

    return list[Math.max(list.length - 1, 0)];
  };

  const initialCrumbs = () => {
    const list = crumbs();

    return list.slice(0, -1);
  };

  return (
    <Show when={crumbs().length > 1}>
      <div>
        <nav class="sm:hidden" aria-label="Back">
          <A
            href={lastCrumb()?.href ?? '#'}
            class="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft
              class="-ml-1 mr-1 h-5 w-5 flex-shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              width={24}
              height={24}
              aria-hidden="true"
            />
            Back
          </A>
        </nav>
        <nav class="hidden sm:flex" aria-label="Breadcrumb">
          <ol class="flex items-center space-x-4">
            <For each={initialCrumbs()}>
              {(crumb, crumbI) => (
                <li>
                  <div class="flex items-center">
                    <Show when={crumbI() > 0}>
                      <ChevronRight
                        class="h-4 w-4 flex-shrink-0 text-gray-400"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={24}
                        height={24}
                        aria-hidden="true"
                      />
                    </Show>
                    <A
                      href={crumb.href}
                      class="text-sm font-medium text-gray-500 hover:text-gray-700"
                      classList={{ 'ml-4': crumbI() > 0 }}
                    >
                      {crumb.title}
                    </A>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </nav>
      </div>
    </Show>
  );
}
