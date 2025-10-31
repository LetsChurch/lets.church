import { IconSearch } from '@tabler/icons-react';
import { Transcript } from '@/components/transcript';
import { cn } from '@/util/cn';

type TranscriptSidebarProps = {
  transcript: Array<{
    start: number;
    text: string;
  }>;
};

export function TranscriptSidebar({ transcript }: TranscriptSidebarProps) {
  return (
    <div>
      <div className="sticky top-4 bottom-4 isolate flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border-top-highlight bg-card">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-zinc-800 border-b px-5 py-2.5">
          <h3 className="font-medium text-primary text-sm">Transcript</h3>
          <div className="flex items-center">
            <button type="button" className="rounded-lg p-2 hover:bg-white/10">
              <IconSearch size={16} className="text-primary/80" />
            </button>
          </div>
        </div>

        {/* Transcript Items */}
        <div className="relative flex-1 overflow-hidden">
          <Transcript transcript={transcript} />
          {/* Gradient fade at bottom */}
          <div
            className={cn(
              'pointer-events-none absolute right-0 bottom-0 left-0 h-8',
              'bg-gradient-to-b from-edge-fade/0 via-80% via-edge-fade/90 to-edge-fade',
            )}
          />
        </div>
      </div>
    </div>
  );
}
