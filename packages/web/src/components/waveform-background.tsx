import { useEffect, useRef, useState } from 'react';
import { cn } from '@/util/cn';

type WaveformBackgroundProps = {
  className?: string;
  peaksJsonUrl?: string | null;
  currentTime?: number;
  lengthSeconds?: number;
};

const TARGET_BAR_WIDTH = 5;
const GAP_SIZE = 4; // matches gap-1 in Tailwind (4px)

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function WaveformBackground({
  className,
  peaksJsonUrl,
  currentTime = 0,
  lengthSeconds = 0,
}: WaveformBackgroundProps) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [barCount, setBarCount] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch peaks data
  useEffect(() => {
    if (!peaksJsonUrl) return;

    fetch(peaksJsonUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.data && Array.isArray(data.data)) {
          setPeaks(data.data);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch peaks:', err);
      });
  }, [peaksJsonUrl]);

  // Calculate bar count based on container width
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setBarCount(
          Math.floor(
            (entry.contentRect.width + GAP_SIZE) /
              (TARGET_BAR_WIDTH + GAP_SIZE),
          ),
        );
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Reduce peaks to match bar count or generate bars from peaks
  const bars =
    peaks.length > 0
      ? chunk(peaks, Math.floor(peaks.length / barCount)).map((chunk) => {
          const peak = Math.max(...chunk);
          const height = ((peak + 128) / (127 + 128)) * 100;
          return { height };
        })
      : Array.from({ length: barCount }, (_, i) => {
          // Fallback to pseudo-random pattern if no peaks data
          const phase1 = Math.sin(i * 0.15) * 0.5 + 0.5;
          const phase2 = Math.cos(i * 0.08) * 0.3 + 0.5;
          const phase3 = Math.sin(i * 0.25) * 0.2 + 0.5;
          const height = (phase1 * 0.5 + phase2 * 0.3 + phase3 * 0.2) * 100;
          return { height };
        });

  // Calculate which bar corresponds to current time
  const currentBarIndex = lengthSeconds
    ? Math.floor((currentTime / lengthSeconds) * bars.length)
    : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-none absolute bottom-0 left-4 flex h-36 w-[calc(100%-2rem)] items-end gap-1 overflow-hidden',
        className,
      )}
    >
      {bars.map((bar, i) => {
        // Calculate opacity based on playback progress
        // Bars before current position: full opacity
        // Current bar: partial opacity based on progress within that segment
        // Bars after current position: very low opacity
        let opacity: number;
        if (i < currentBarIndex) {
          opacity = 0.15;
        } else if (i === currentBarIndex) {
          const barDuration = lengthSeconds / bars.length;
          const barStartTime = i * barDuration;
          const progressInBar = (currentTime - barStartTime) / barDuration;
          opacity = 0.05 + progressInBar * 0.1;
        } else {
          opacity = 0.05;
        }

        return (
          <div
            key={i}
            className="min-h-px min-w-[3px] shrink-0 grow basis-0 rounded-sm bg-gray-950 dark:bg-white"
            style={{
              height: `${bar.height}%`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
