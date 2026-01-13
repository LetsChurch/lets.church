import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAutoplayEnabled } from '@/stores/autoplay';

type UseAutoplayOptions = {
  enabled: boolean;
  nextMediaId?: string;
  nextMediaUrl?: string;
  onVideoEnded?: () => void;
};

type UseAutoplayReturn = {
  showCountdown: boolean;
  countdown: number;
  cancelAutoplay: () => void;
  handleVideoEnded: () => void;
};

const COUNTDOWN_SECONDS = 5;

export function useAutoplay({
  enabled,
  nextMediaId,
  nextMediaUrl,
  onVideoEnded,
}: UseAutoplayOptions): UseAutoplayReturn {
  const navigate = useNavigate();
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<number | null>(null);

  const cancelAutoplay = useCallback(() => {
    setShowCountdown(false);
    setCountdown(COUNTDOWN_SECONDS);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    // Call optional onVideoEnded callback
    onVideoEnded?.();

    // Check if autoplay is enabled and there's a next item
    const autoplayEnabled = enabled && getAutoplayEnabled();
    if (!autoplayEnabled || !nextMediaId || !nextMediaUrl) {
      return;
    }

    // Start countdown
    setShowCountdown(true);
    setCountdown(COUNTDOWN_SECONDS);

    let currentCountdown = COUNTDOWN_SECONDS;

    intervalRef.current = window.setInterval(() => {
      currentCountdown -= 1;
      setCountdown(currentCountdown);

      if (currentCountdown <= 0) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setShowCountdown(false);

        // Navigate to next item
        navigate({ to: nextMediaUrl });
      }
    }, 1000);
  }, [enabled, nextMediaId, nextMediaUrl, navigate, onVideoEnded]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    showCountdown,
    countdown,
    cancelAutoplay,
    handleVideoEnded,
  };
}
