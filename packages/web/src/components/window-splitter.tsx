import { useEffect, useRef, useState } from 'react';

import { cn } from '@/util/cn';

type WindowSplitterProps = {
  /**
   * Initial width of the right panel in pixels
   */
  initialWidth: number;
  /**
   * Minimum width of the right panel in pixels
   */
  minWidth?: number;
  /**
   * Maximum width of the right panel in pixels
   */
  maxWidth?: number;
  /**
   * Default width to reset to on double-click
   */
  defaultWidth?: number;
  /**
   * Callback when the width changes
   */
  onWidthChange: (width: number) => void;
  /**
   * Label for screen readers
   */
  ariaLabel?: string;
  /**
   * Width of the draggable handle in pixels
   */
  handleWidth?: number;
};

export function WindowSplitter({
  initialWidth,
  minWidth = 200,
  maxWidth = 800,
  defaultWidth = 368,
  onWidthChange,
  ariaLabel = 'Resize transcript sidebar',
  handleWidth = 16,
}: WindowSplitterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const splitterRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate the change in x position
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, startWidthRef.current + deltaX),
      );

      setWidth(newWidth);
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    // Add event listeners
    const ac = new AbortController();
    document.addEventListener('mousemove', handleMouseMove, ac);
    document.addEventListener('mouseup', handleMouseUp, ac);

    // Set cursor for entire document while dragging
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      ac.abort();
    };
  }, [isDragging, minWidth, maxWidth, onWidthChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    let newWidth = width;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newWidth = Math.min(maxWidth, width + step);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newWidth = Math.max(minWidth, width - step);
        break;
      case 'Home':
        e.preventDefault();
        newWidth = minWidth;
        break;
      case 'End':
        e.preventDefault();
        newWidth = maxWidth;
        break;
      default:
        return;
    }

    setWidth(newWidth);
    onWidthChange(newWidth);
  };

  const handleDoubleClick = () => {
    setWidth(defaultWidth);
    onWidthChange(defaultWidth);
  };

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- window splitter requires interactive div with ref for drag handling
    <div
      ref={splitterRef}
      role="separator"
      aria-label={ariaLabel}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-orientation="vertical"
      tabIndex={0}
      className="group relative flex max-h-[calc(100vh-var(--header-height)-1rem)] shrink-0 cursor-col-resize items-center justify-center focus:outline-none"
      style={{ width: `${handleWidth}px` }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Visual indicator */}
      <div
        className={cn(
          `h-full w-1 rounded-full transition-colors group-focus:bg-blue-500 before:absolute before:inset-y-0 before:-right-2 before:-left-2 before:content-['']`,
          isDragging
            ? 'bg-blue-500'
            : 'bg-transparent group-hover:bg-zinc-400 dark:group-hover:bg-zinc-700',
        )}
      />
    </div>
  );
}
