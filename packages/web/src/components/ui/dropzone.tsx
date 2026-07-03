import {
  type CSSProperties,
  createContext,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react';
import { cn } from '@/util/cn';

// A Mantine-compatible Dropzone built on native drag/drop + a hidden file
// input, so migrated pages keep `<Dropzone onDrop accept>` plus the
// `Dropzone.Accept/Reject/Idle` render-state children.

type DropzoneStatus = 'idle' | 'accept' | 'reject';

const DropzoneStatusContext = createContext<DropzoneStatus>('idle');

type AcceptValue = string[] | Record<string, string[]>;

function normalizeAccept(accept?: AcceptValue): string[] {
  if (!accept) return [];
  if (Array.isArray(accept)) return accept;
  return Object.keys(accept);
}

function matchesPattern(type: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    return type.startsWith(`${pattern.slice(0, -1)}`);
  }
  return type === pattern;
}

function fileMatches(type: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((p) => matchesPattern(type, p));
}

type DropzoneProps = {
  onDrop: (files: File[]) => void;
  onReject?: (files: File[]) => void;
  accept?: AcceptValue;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
  onMouseEnter?: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
};

export function Dropzone({
  onDrop,
  onReject,
  accept,
  maxSize,
  multiple = true,
  disabled,
  loading,
  w,
  h,
  radius,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  children,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<DropzoneStatus>('idle');
  const patterns = normalizeAccept(accept);

  const acceptAttr = patterns.length > 0 ? patterns.join(',') : undefined;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const accepted: File[] = [];
    const rejected: File[] = [];
    for (const file of files) {
      const okType = fileMatches(file.type, patterns);
      const okSize = maxSize ? file.size <= maxSize : true;
      if (okType && okSize) accepted.push(file);
      else rejected.push(file);
    }
    if (accepted.length > 0) onDrop(multiple ? accepted : [accepted[0]]);
    if (rejected.length > 0) onReject?.(rejected);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const items = Array.from(event.dataTransfer.items ?? []);
    const allMatch =
      items.length === 0 ||
      items.every(
        (item) => item.kind !== 'file' || fileMatches(item.type, patterns),
      );
    setStatus(allMatch ? 'accept' : 'reject');
  };

  const handleDragLeave = () => setStatus('idle');

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setStatus('idle');
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  return (
    <DropzoneStatusContext.Provider value={status}>
      {/* biome-ignore lint/a11y/useSemanticElements: a drag-and-drop dropzone needs a div, not a native button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          'flex cursor-pointer items-center justify-center border border-gray-300 border-dashed p-4 text-center text-muted transition-colors dark:border-zinc-700',
          status === 'accept' && 'border-brand bg-brand/5 text-brand',
          status === 'reject' && 'border-red-500 bg-red-500/5 text-red-500',
          (disabled || loading) && 'pointer-events-none opacity-60',
          radius === undefined && 'rounded-lg',
          className,
        )}
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          ...style,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {children}
      </div>
    </DropzoneStatusContext.Provider>
  );
}

function DropzoneAccept({ children }: { children: ReactNode }) {
  return useContext(DropzoneStatusContext) === 'accept' ? children : null;
}

function DropzoneReject({ children }: { children: ReactNode }) {
  return useContext(DropzoneStatusContext) === 'reject' ? children : null;
}

function DropzoneIdle({ children }: { children: ReactNode }) {
  return useContext(DropzoneStatusContext) === 'idle' ? children : null;
}

Dropzone.Accept = DropzoneAccept;
Dropzone.Reject = DropzoneReject;
Dropzone.Idle = DropzoneIdle;
