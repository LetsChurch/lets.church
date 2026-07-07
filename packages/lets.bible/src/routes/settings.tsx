import { Select } from '@base-ui/react/select';
import { Slider } from '@base-ui/react/slider';
import { Switch } from '@base-ui/react/switch';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { PageShell } from '@/components/chrome';
import { useTRPC } from '@/trpc/react';

// Mirror of the server-side bounds (server/preferences.ts) — kept here so the
// settings UI doesn't import the server module into the client bundle.
const TEXT_SIZE_MIN = 16;
const TEXT_SIZE_MAX = 32;

const DIVINE_NAME_LABELS: Record<'lord' | 'yhwh' | 'yahweh', string> = {
  lord: 'The LORD',
  yhwh: 'YHWH',
  yahweh: 'Yahweh',
};

export const Route = createFileRoute('/settings')({
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(trpc.common.preferences.queryOptions()),
      queryClient.ensureQueryData(trpc.bible.translations.queryOptions()),
    ]);
  },
  component: Settings,
});

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="border-line flex items-center justify-between gap-4 border-t py-[14px]">
      <div>
        <div className="text-ink text-[14.5px] font-semibold">{label}</div>
        <div className="text-muted-2 text-[12.5px]">{hint}</div>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="bg-line-strong focus-visible:ring-gold/40 data-[checked]:bg-gold relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2"
      >
        <Switch.Thumb className="aspect-square h-full rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}

function toNumber(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}

function Settings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: prefs } = useSuspenseQuery(
    trpc.common.preferences.queryOptions(),
  );
  const { data: translations } = useSuspenseQuery(
    trpc.bible.translations.queryOptions(),
  );
  const defaultId =
    translations.find((t) => t.isDefault)?.id ?? translations[0]?.id ?? 'BSB';

  const [translation, setTranslation] = useState(
    prefs.translation ?? defaultId,
  );
  const [redLetter, setRedLetter] = useState(prefs.redLetter);
  const [verseNumbers, setVerseNumbers] = useState(prefs.verseNumbers);
  const [textSize, setTextSize] = useState(prefs.textSize);
  const [divineName, setDivineName] = useState(prefs.divineName);
  const [sourceOverlay, setSourceOverlay] = useState(prefs.sourceOverlay);

  const save = useMutation(
    trpc.common.setPreferences.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.common.preferences.queryKey(), data);
        // The reader resolves translation + rendering from prefs — refetch.
        queryClient.invalidateQueries({
          queryKey: trpc.bible.chapter.queryKey(),
        });
      },
    }),
  );

  return (
    <PageShell>
      <div className="animate-fade mx-auto max-w-[560px] px-6 pt-[34px] pb-16">
        <h1 className="text-ink-strong mb-[18px] font-serif text-[26px]">
          Settings
        </h1>
        <div className="text-ink-strong mb-3 font-serif text-[20px]">
          Reading
        </div>

        <label
          htmlFor="translation"
          className="text-muted mb-[7px] block text-[13px] font-semibold"
        >
          Default translation
        </label>
        <Select.Root
          id="translation"
          value={translation}
          onValueChange={(value: string | null) => {
            if (value == null) {
              return;
            }
            setTranslation(value);
            save.mutate({ translation: value });
          }}
        >
          <Select.Trigger className="border-line-strong bg-paper-raised text-ink focus-visible:ring-gold/40 mb-6 flex h-11 w-full items-center gap-2 rounded-[11px] border px-[14px] text-[15px] outline-none focus-visible:ring-2">
            <Select.Value className="flex-1 text-left" />
            <Select.Icon className="text-faint text-[11px]">▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-40" sideOffset={6}>
              <Select.Popup className="border-line-strong bg-paper-raised min-w-[var(--anchor-width)] rounded-xl border p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
                {translations.map((t) => (
                  <Select.Item
                    key={t.id}
                    value={t.id}
                    className="text-ink data-highlighted:bg-paper-soft data-selected:text-gold flex cursor-pointer items-baseline gap-2 rounded-md px-3 py-2 text-[14px] outline-none"
                  >
                    <Select.ItemText>
                      {t.name} <span className="text-muted-2">· {t.id}</span>
                    </Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>

        <label
          htmlFor="divineName"
          className="text-muted mb-[7px] block text-[13px] font-semibold"
        >
          Divine name (YHWH)
        </label>
        <Select.Root
          id="divineName"
          value={divineName}
          onValueChange={(value: 'lord' | 'yhwh' | 'yahweh' | null) => {
            if (value == null) {
              return;
            }
            setDivineName(value);
            save.mutate({ divineName: value });
          }}
        >
          <Select.Trigger className="border-line-strong bg-paper-raised text-ink focus-visible:ring-gold/40 mb-6 flex h-11 w-full items-center gap-2 rounded-[11px] border px-[14px] text-[15px] outline-none focus-visible:ring-2">
            <Select.Value className="flex-1 text-left">
              {DIVINE_NAME_LABELS[divineName]}
            </Select.Value>
            <Select.Icon className="text-faint text-[11px]">▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-40" sideOffset={6}>
              <Select.Popup className="border-line-strong bg-paper-raised min-w-[var(--anchor-width)] rounded-xl border p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
                {(['lord', 'yhwh', 'yahweh'] as const).map((opt) => (
                  <Select.Item
                    key={opt}
                    value={opt}
                    className="text-ink data-highlighted:bg-paper-soft data-selected:text-gold flex cursor-pointer items-baseline gap-2 rounded-md px-3 py-2 text-[14px] outline-none"
                  >
                    <Select.ItemText>{DIVINE_NAME_LABELS[opt]}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>

        <div className="mb-[11px] flex items-baseline justify-between">
          <span className="text-muted text-[13px] font-semibold">
            Text size
          </span>
          <span className="text-muted-2 font-mono text-[12px]">
            {textSize} px
          </span>
        </div>
        <Slider.Root
          value={textSize}
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={1}
          onValueChange={(value) => setTextSize(toNumber(value))}
          onValueCommitted={(value) =>
            save.mutate({ textSize: toNumber(value) })
          }
          className="mb-[6px] flex items-center gap-[14px]"
        >
          <span className="text-faint font-serif text-[14px]">A</span>
          <Slider.Control className="relative flex h-5 flex-1 items-center">
            <Slider.Track className="bg-line-strong h-[5px] w-full rounded-full">
              <Slider.Indicator className="bg-gold-soft rounded-full" />
            </Slider.Track>
            <Slider.Thumb className="border-line-strong focus-visible:ring-gold/40 size-5 rounded-full border bg-white shadow-[0_2px_5px_rgba(120,96,40,0.28)] outline-none focus-visible:ring-2" />
          </Slider.Control>
          <span className="text-muted font-serif text-[24px]">A</span>
        </Slider.Root>

        <div className="mt-[18px]">
          <ToggleRow
            label="Verse numbers"
            hint="Show superscript verse numbers."
            checked={verseNumbers}
            onChange={(c) => {
              setVerseNumbers(c);
              save.mutate({ verseNumbers: c });
            }}
          />
          <ToggleRow
            label="Red letters"
            hint="Show the words of Christ in red."
            checked={redLetter}
            onChange={(c) => {
              setRedLetter(c);
              save.mutate({ redLetter: c });
            }}
          />
          <ToggleRow
            label="Source-text overlays"
            hint="Dotted underline + tooltips on the divine name, Hallelujah, and Old Testament quotations."
            checked={sourceOverlay}
            onChange={(c) => {
              setSourceOverlay(c);
              save.mutate({ sourceOverlay: c });
            }}
          />
        </div>

        <div className="text-ink-strong mt-9 mb-3 font-serif text-[20px]">
          Offline
        </div>
        <p className="text-muted text-[13px]">
          lets.bible works offline automatically — every translation, search,
          and your highlights, notes, and reading position are cached on this
          device. No download needed.
        </p>
      </div>
    </PageShell>
  );
}
