import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { type CanonBook, NEW_TESTAMENT, OLD_TESTAMENT } from '@/lib/canon';
import { useIsDesktop } from '@/lib/use-media-query';
import { useTRPC } from '@/trpc/react';

import { PickerDrawer } from './picker-drawer';

const triggerClass =
  'inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 outline-none hover:bg-paper data-[popup-open]:bg-paper focus-visible:ring-2 focus-visible:ring-gold/40';
const popupClass =
  'z-40 rounded-xl border border-line-strong bg-paper-raised p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]';

const groupLabelClass =
  'px-3 pt-2 pb-1 font-bold text-[10.5px] text-faint uppercase tracking-[0.1em]';

// Dropdown affordance for the header pickers. A stroked chevron rather than the
// “▾” glyph, which collapses into a dot at small sizes.
function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-muted-2 ${className}`}
      aria-hidden="true"
    >
      <title>Open</title>
      <path d="M4 6.5 8 10.5 12 6.5" />
    </svg>
  );
}

function bookLinkClass(active: boolean) {
  return `block cursor-pointer rounded-md px-3 py-1.5 text-[14px] outline-none data-highlighted:bg-paper-soft ${
    active ? 'font-semibold text-gold' : 'text-ink'
  }`;
}

function BookList({ books, current }: { books: CanonBook[]; current: string }) {
  return (
    <>
      {books.map((b) => (
        <Menu.Item
          key={b.slug}
          render={(props) => (
            <Link
              {...props}
              to="/bible/$book/$chapter"
              params={{ book: b.slug, chapter: '1' }}
              className={bookLinkClass(b.slug === current)}
            >
              {b.name}
            </Link>
          )}
        />
      ))}
    </>
  );
}

// Mobile drawer body: the same OT/NT book lists as plain links (no Menu.Item).
function BookDrawerList({
  books,
  current,
  close,
}: {
  books: CanonBook[];
  current: string;
  close: () => void;
}) {
  return (
    <>
      {books.map((b) => (
        <Link
          key={b.slug}
          to="/bible/$book/$chapter"
          params={{ book: b.slug, chapter: '1' }}
          onClick={close}
          className={bookLinkClass(b.slug === current)}
        >
          {b.name}
        </Link>
      ))}
    </>
  );
}

// Book selector — the current book name opens a grouped, scrollable list
// (Base UI menu on desktop, a Base UI bottom sheet on mobile).
export function BookPicker({ book }: { book: CanonBook }) {
  const isDesktop = useIsDesktop();
  const trigger = (
    <>
      <span className="text-faint text-[14px]">{book.name}</span>
      <Chevron />
    </>
  );

  if (!isDesktop) {
    return (
      <PickerDrawer
        triggerClassName={triggerClass}
        trigger={trigger}
        title="Book"
      >
        {(close) => (
          <>
            <div className={groupLabelClass}>Old Testament</div>
            <BookDrawerList
              books={OLD_TESTAMENT}
              current={book.slug}
              close={close}
            />
            <div className="bg-line my-1 h-px" />
            <div className={groupLabelClass}>New Testament</div>
            <BookDrawerList
              books={NEW_TESTAMENT}
              current={book.slug}
              close={close}
            />
          </>
        )}
      </PickerDrawer>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={triggerClass}>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start" className="z-50">
          <Menu.Popup
            className={`max-h-[70vh] w-[240px] overflow-y-auto ${popupClass}`}
          >
            <Menu.Group>
              <Menu.GroupLabel className={groupLabelClass}>
                Old Testament
              </Menu.GroupLabel>
              <BookList books={OLD_TESTAMENT} current={book.slug} />
            </Menu.Group>
            <Menu.Separator className="bg-line my-1 h-px" />
            <Menu.Group>
              <Menu.GroupLabel className={groupLabelClass}>
                New Testament
              </Menu.GroupLabel>
              <BookList books={NEW_TESTAMENT} current={book.slug} />
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function chapterLinkClass(active: boolean) {
  return `flex h-9 cursor-pointer items-center justify-center rounded-md text-[13.5px] outline-none data-highlighted:bg-paper-soft ${
    active ? 'bg-gold/15 font-bold text-gold' : 'text-ink'
  }`;
}

// Chapter selector — a number grid for the current book.
export function ChapterPicker({
  book,
  chapter,
}: {
  book: CanonBook;
  chapter: number;
}) {
  const isDesktop = useIsDesktop();
  const chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
  const trigger = (
    <>
      <span className="text-ink-strong font-serif text-[17px] font-bold">
        Chapter {chapter}
      </span>
      <Chevron />
    </>
  );

  if (!isDesktop) {
    return (
      <PickerDrawer
        triggerClassName={triggerClass}
        trigger={trigger}
        title={`${book.name} — chapter`}
      >
        {(close) => (
          <div className="grid grid-cols-6 gap-1.5 pt-1">
            {chapters.map((n) => (
              <Link
                key={n}
                to="/bible/$book/$chapter"
                params={{ book: book.slug, chapter: String(n) }}
                onClick={close}
                className={chapterLinkClass(n === chapter)}
              >
                {n}
              </Link>
            ))}
          </div>
        )}
      </PickerDrawer>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={triggerClass}>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} className="z-50">
          <Menu.Popup
            className={`grid max-h-[60vh] w-[268px] grid-cols-6 gap-1 overflow-y-auto ${popupClass}`}
          >
            {chapters.map((n) => (
              <Menu.Item
                key={n}
                render={(props) => (
                  <Link
                    {...props}
                    to="/bible/$book/$chapter"
                    params={{ book: book.slug, chapter: String(n) }}
                    className={chapterLinkClass(n === chapter)}
                  >
                    {n}
                  </Link>
                )}
              />
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const translationTriggerClass =
  'inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-paper px-[10px] py-[5px] font-semibold text-[12.5px] text-muted outline-none hover:bg-paper-soft focus-visible:ring-2 focus-visible:ring-gold/40 data-[popup-open]:bg-paper-soft';

type TranslationOption = {
  id: string;
  name: string;
  isDefault: boolean;
  hasInterlinear: boolean;
  attribution?: string | null;
};

const rowActionClass =
  'inline-flex h-7 flex-shrink-0 items-center justify-center rounded-md border border-line-strong font-semibold text-[11.5px] text-muted-2 outline-none hover:border-gold-soft hover:bg-paper hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/40';

// The list of translations, shared by the desktop popover and the mobile drawer.
// Each row switches the reading translation; rows with an interlinear get an
// "Aα" interlinear button, and non-current rows get a "Compare" button (compare
// the current translation against that one).
function TranslationRows({
  list,
  book,
  chapter,
  current,
  onAction,
}: {
  list: TranslationOption[];
  book: string;
  chapter: number;
  current: string;
  onAction?: () => void;
}) {
  const anyInterlinear = list.some((t) => t.hasInterlinear);
  return (
    <div className="flex flex-col">
      {list.map((t) => {
        const isCurrent = t.id === current;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg py-1 pr-2 pl-2.5 ${
              isCurrent ? 'bg-gold/[0.06]' : ''
            }`}
          >
            <Link
              to="/bible/$book/$chapter"
              params={{ book, chapter: String(chapter) }}
              search={{ translation: t.id }}
              onClick={onAction}
              className="focus-visible:ring-gold/40 flex min-w-0 flex-1 flex-col rounded-md py-1 text-[13.5px] outline-none focus-visible:ring-2"
            >
              <span className="flex items-baseline gap-2">
                <span
                  className={`font-semibold ${isCurrent ? 'text-gold' : 'text-ink'}`}
                >
                  {t.id}
                </span>
                <span className="text-muted-2 truncate text-[12px]">
                  {t.name}
                </span>
              </span>
              {t.attribution ? (
                <span className="text-faint truncate text-[10.5px]">
                  {t.attribution}
                </span>
              ) : null}
            </Link>
            {/* Interlinear (Aα) — fixed-width column so it aligns across rows. */}
            {t.hasInterlinear ? (
              <Link
                to="/bible/$book/$chapter"
                params={{ book, chapter: String(chapter) }}
                search={{ translation: t.id, view: 'interlinear' }}
                onClick={onAction}
                title={`${t.id} interlinear (original languages)`}
                className={`${rowActionClass} w-9 font-serif`}
              >
                A<span className="text-gold-soft">α</span>
              </Link>
            ) : (
              <span className="w-9 flex-shrink-0" aria-hidden />
            )}
            {/* Compare — same fixed width whether shown or reserved as a spacer. */}
            {isCurrent ? (
              <span className="w-[78px] flex-shrink-0" aria-hidden />
            ) : (
              <Link
                to="/compare/$book/$chapter"
                params={{ book, chapter: String(chapter) }}
                search={{ with: `${current},${t.id}` }}
                onClick={onAction}
                title={`Compare ${current} with ${t.id}`}
                className={`${rowActionClass} w-[78px]`}
              >
                Compare
              </Link>
            )}
          </div>
        );
      })}
      {/* Legend — the "Aα" row action is icon-only, so name what it does for
          sighted users (it already carries a title/aria description). */}
      {anyInterlinear ? (
        <div className="border-line text-muted-2 mt-1 flex items-center gap-2 border-t px-2.5 pt-2.5 pb-1 text-[11.5px]">
          <span className="text-ink font-serif font-semibold">
            A<span className="text-gold-soft">α</span>
          </span>
          <span>
            opens the interlinear — each word in its original language.
          </span>
        </div>
      ) : null}
    </div>
  );
}

// Translation selector — switch the reading translation, or launch compare /
// interlinear for a translation. Base UI Popover on desktop (rows hold multiple
// actions), a Base UI drawer on mobile.
export function TranslationPicker({
  book,
  chapter,
  current,
  interlinear = false,
}: {
  book: string;
  chapter: number;
  current: string;
  interlinear?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const trpc = useTRPC();
  const { data: translations } = useQuery(
    trpc.bible.translations.queryOptions(),
  );
  const list: TranslationOption[] = translations ?? [];
  const trigger = (
    <>
      {current}
      {interlinear ? (
        <span className="text-gold-soft font-serif text-xs">Aα</span>
      ) : null}
      <Chevron />
    </>
  );

  if (!isDesktop) {
    return (
      <PickerDrawer
        triggerClassName={translationTriggerClass}
        trigger={trigger}
        title="Translation"
      >
        {(close) => (
          <TranslationRows
            list={list}
            book={book}
            chapter={chapter}
            current={current}
            onAction={close}
          />
        )}
      </PickerDrawer>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={translationTriggerClass}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className={`min-w-[360px] ${popupClass}`}>
            <TranslationRows
              list={list}
              book={book}
              chapter={chapter}
              current={current}
              onAction={() => setOpen(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
