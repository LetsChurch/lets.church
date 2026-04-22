import { useEffect, useState } from 'react';
import { getInitialBrowserSize } from '@/stores/browser-size';
import {
  getInitialSidebarCollapsed,
  SIDEBAR_CHANGE_EVENT,
} from '@/stores/sidebar';

type VideoLayoutParams = {
  aspectWidth?: number;
  aspectHeight?: number;
  minVisibleHeight?: number;
  headerHeight?: number;
  contentMargins?: number;
  chromeBelow?: number;
  transcriptSidebarWidth?: number;
  gap?: number;
  isAudio?: boolean;
};

type VideoLayoutResult = {
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  showSidebar: boolean;
};

type VideoLayout = VideoLayoutResult & {
  setTranscriptWidth: (width: number) => void;
};

export function useVideoLayout({
  aspectWidth = 1920,
  aspectHeight = 1080,
  minVisibleHeight = 200,
  headerHeight = 64,
  contentMargins = 32, // mx-4 = 1rem = 16px on each side
  chromeBelow = 120, // title, actions, tabs area
  transcriptSidebarWidth = 368, // 92rem = 92 * 0.25rem = 23rem = 368px
  gap = 16, // gap-4 = 1rem = 16px
  isAudio = false,
}: VideoLayoutParams = {}): VideoLayout {
  const [pageSidebarCollapsed, setPageSidebarCollapsed] = useState(
    getInitialSidebarCollapsed(),
  );

  // Track the dynamic transcript sidebar width
  const [dynamicTranscriptWidth, setDynamicTranscriptWidth] = useState(
    transcriptSidebarWidth,
  );

  const [layout, setLayout] = useState<VideoLayoutResult>(() => {
    const browserSize = getInitialBrowserSize();

    return calculateLayout({
      vw: browserSize.width,
      vh: browserSize.height,
      aspectWidth,
      aspectHeight,
      minVisibleHeight,
      headerHeight,
      contentMargins,
      chromeBelow,
      transcriptSidebarWidth: dynamicTranscriptWidth,
      gap,
      pageSidebarCollapsed,
      isAudio,
    });
  });

  useEffect(() => {
    const recalculate = () => {
      setLayout(
        calculateLayout({
          vw: window.innerWidth,
          vh: window.innerHeight,
          aspectWidth,
          aspectHeight,
          minVisibleHeight,
          headerHeight,
          contentMargins,
          chromeBelow,
          transcriptSidebarWidth: dynamicTranscriptWidth,
          gap,
          pageSidebarCollapsed,
          isAudio,
        }),
      );
    };

    const handleSidebarChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setPageSidebarCollapsed(customEvent.detail.collapsed);
    };

    const ac = new AbortController();

    // Recalculate on resize
    window.addEventListener('resize', recalculate, ac);

    // Listen for sidebar changes
    window.addEventListener(SIDEBAR_CHANGE_EVENT, handleSidebarChange, ac);

    // Recalculate whenever dependencies change
    recalculate();

    return () => {
      ac.abort();
    };
  }, [
    aspectWidth,
    aspectHeight,
    minVisibleHeight,
    headerHeight,
    contentMargins,
    chromeBelow,
    dynamicTranscriptWidth,
    gap,
    pageSidebarCollapsed,
    isAudio,
  ]);

  return { ...layout, setTranscriptWidth: setDynamicTranscriptWidth };
}

type CalculateLayoutParams = VideoLayoutParams & {
  vw: number;
  vh: number;
  aspectWidth: number;
  aspectHeight: number;
  minVisibleHeight: number;
  headerHeight: number;
  contentMargins: number;
  chromeBelow: number;
  transcriptSidebarWidth: number;
  gap: number;
  pageSidebarCollapsed: boolean;
  isAudio: boolean;
};

function calculateLayout({
  vw,
  vh,
  aspectWidth,
  aspectHeight,
  minVisibleHeight,
  headerHeight,
  contentMargins,
  chromeBelow,
  transcriptSidebarWidth,
  gap,
  pageSidebarCollapsed,
  isAudio,
}: CalculateLayoutParams): VideoLayoutResult {
  const aspect = aspectWidth / aspectHeight;

  // Page sidebar widths: w-14 = 3.5rem = 56px, w-50 = 12.5rem = 200px
  // Page sidebar is hidden below sm breakpoint (640px)
  const pageSidebarWidth = vw >= 640 ? (pageSidebarCollapsed ? 56 : 200) : 0;

  // Calculate available viewport height for video (subtract header and chrome below)
  const maxPlayerH = Math.max(
    minVisibleHeight,
    vh - headerHeight - chromeBelow,
  );

  // First, try with transcript sidebar if above sm breakpoint
  let showSidebar = vw >= 640;
  let availableWidth =
    vw -
    pageSidebarWidth -
    contentMargins -
    (showSidebar ? transcriptSidebarWidth + gap : 0);

  // Audio always fills available width; aspect ratio and height constraints don't apply
  if (isAudio) {
    return {
      videoWidth: Math.round(availableWidth),
      videoHeight: 240,
      containerWidth: Math.round(availableWidth),
      showSidebar,
    };
  }

  // Calculate video dimensions based on available width
  let w = availableWidth;
  let h = w / aspect;

  // If height exceeds max, use height constraint
  if (h > maxPlayerH) {
    h = maxPlayerH;
    w = h * aspect;
  }

  // If we hit the minimum height floor, ensure we meet it
  if (h < minVisibleHeight) {
    h = minVisibleHeight;
    w = h * aspect;
  }

  // Check if showing the sidebar would cause it to be cut off or video to be too cramped
  // We need: video width + page sidebar + margins + transcript sidebar + gap <= viewport width
  const totalWidthNeeded =
    w + pageSidebarWidth + contentMargins + transcriptSidebarWidth + gap;
  if (showSidebar && totalWidthNeeded > vw) {
    // Not enough space for sidebar, go single column
    showSidebar = false;
    availableWidth = vw - pageSidebarWidth - contentMargins;

    w = availableWidth;
    h = w / aspect;

    if (h > maxPlayerH) {
      h = maxPlayerH;
      w = h * aspect;
    }

    if (h < minVisibleHeight) {
      h = minVisibleHeight;
      w = h * aspect;
    }
  }

  return {
    videoWidth: Math.round(w),
    videoHeight: Math.round(h),
    containerWidth: Math.round(w),
    showSidebar,
  };
}
