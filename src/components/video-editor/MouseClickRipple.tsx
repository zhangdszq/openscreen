/**
 * MouseClickRipple Component
 * 
 * Renders animated green ripple effects at mouse click positions during video playback.
 * Click events are matched to the current playback time and rendered as expanding
 * concentric circles that fade out.
 * 
 * Coordinate mapping:
 * - Click events have normalized (0-1) coordinates relative to the full recording screen.
 * - The video is displayed in a container with crop + padding, so only a portion is visible.
 * - `videoContentRect` defines the pixel rect where the cropped video is rendered.
 * - `cropRegion` defines which portion of the original video is visible.
 * - We map click coordinates: full-screen → crop-relative → video content pixel position.
 */

import { useEffect, useRef, useState } from "react";
import type { RecordedMouseEvent, CropRegion } from "./types";

interface MouseClickRippleProps {
  /** Array of recorded mouse click events with normalized x,y positions */
  clickEvents: RecordedMouseEvent[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Ripple color (CSS color string) */
  rippleColor?: string;
  /** Ripple scale multiplier */
  rippleScale?: number;
  /** The pixel rect where the visible video content is rendered within the overlay container */
  videoContentRect: { x: number; y: number; width: number; height: number };
  /** The crop region defining which portion of the original video is visible (all values 0-1) */
  cropRegion?: CropRegion;
}

/** Duration of the ripple animation in ms */
const RIPPLE_DURATION_MS = 800;
/** How far ahead/behind current time to look for click events (ms) */
const TIME_WINDOW_MS = 50;
/** Base size of the ripple in pixels */
const BASE_RIPPLE_SIZE = 40;

interface ActiveRipple {
  id: string;
  /** Pixel x position within the overlay container */
  pixelX: number;
  /** Pixel y position within the overlay container */
  pixelY: number;
  startTime: number;  // performance.now() when this ripple was triggered
}

export function MouseClickRipple({
  clickEvents,
  currentTime,
  isPlaying,
  rippleColor = '#34B27B',
  rippleScale = 1.5,
  videoContentRect,
  cropRegion,
}: MouseClickRippleProps) {
  const [activeRipples, setActiveRipples] = useState<ActiveRipple[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Track which events have been triggered to avoid duplicate ripples
  const triggeredEventsRef = useRef<Set<string>>(new Set());

  // Cache the latest videoContentRect and cropRegion in refs for use in effects
  const videoContentRectRef = useRef(videoContentRect);
  videoContentRectRef.current = videoContentRect;
  const cropRegionRef = useRef(cropRegion);
  cropRegionRef.current = cropRegion;

  /**
   * Map a click's normalized (0-1) screen coordinates to pixel position
   * within the overlay container.
   * Returns null if the click falls outside the visible crop area.
   */
  const mapClickToPixel = (mouseX: number, mouseY: number): { x: number; y: number } | null => {
    const rect = videoContentRectRef.current;
    const crop = cropRegionRef.current || { x: 0, y: 0, width: 1, height: 1 };

    // Map from full-screen normalized coords to crop-relative coords
    const relX = (mouseX - crop.x) / crop.width;
    const relY = (mouseY - crop.y) / crop.height;

    // If outside the visible crop area, skip
    if (relX < -0.05 || relX > 1.05 || relY < -0.05 || relY > 1.05) {
      return null;
    }

    // Map to pixel position within the container
    const pixelX = rect.x + relX * rect.width;
    const pixelY = rect.y + relY * rect.height;

    return { x: pixelX, y: pixelY };
  };

  // When currentTime changes, check if any clicks should trigger
  useEffect(() => {
    if (!isPlaying) return;

    const currentTimeMs = currentTime * 1000;
    const newRipples: ActiveRipple[] = [];

    for (const event of clickEvents) {
      // Only process click events within the time window
      const diff = currentTimeMs - event.timestampMs;
      if (diff >= -TIME_WINDOW_MS && diff <= TIME_WINDOW_MS) {
        // Check if this event was already triggered
        if (!triggeredEventsRef.current.has(event.id)) {
          triggeredEventsRef.current.add(event.id);
          
          const pos = mapClickToPixel(event.x, event.y);
          if (pos) {
            newRipples.push({
              id: event.id,
              pixelX: pos.x,
              pixelY: pos.y,
              startTime: performance.now(),
            });
          }
        }
      }
    }

    if (newRipples.length > 0) {
      setActiveRipples(prev => [...prev, ...newRipples]);
    }
  }, [clickEvents, currentTime, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up expired ripples
  useEffect(() => {
    if (activeRipples.length === 0) return;

    const cleanup = () => {
      const now = performance.now();
      setActiveRipples(prev => 
        prev.filter(ripple => now - ripple.startTime < RIPPLE_DURATION_MS)
      );
      animFrameRef.current = requestAnimationFrame(cleanup);
    };

    animFrameRef.current = requestAnimationFrame(cleanup);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [activeRipples.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset triggered events when seeking (currentTime jumps)
  const lastTimeRef = useRef(currentTime);
  useEffect(() => {
    const timeDiff = Math.abs(currentTime - lastTimeRef.current);
    // If time jumped more than 0.5s, consider it a seek
    if (timeDiff > 0.5) {
      triggeredEventsRef.current.clear();
      setActiveRipples([]);
    }
    lastTimeRef.current = currentTime;
  }, [currentTime]);

  // Reset when paused
  useEffect(() => {
    if (!isPlaying) {
      triggeredEventsRef.current.clear();
    }
  }, [isPlaying]);

  if (activeRipples.length === 0) return null;

  const scaledSize = BASE_RIPPLE_SIZE * rippleScale;

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 50 }}
    >
      {activeRipples.map((ripple) => (
        <RippleEffect
          key={`${ripple.id}-${ripple.startTime}`}
          pixelX={ripple.pixelX}
          pixelY={ripple.pixelY}
          color={rippleColor}
          size={scaledSize}
        />
      ))}
    </div>
  );
}

/** Individual ripple effect at a specific pixel position */
function RippleEffect({
  pixelX,
  pixelY,
  color,
  size,
}: {
  pixelX: number;
  pixelY: number;
  color: string;
  size: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(performance.now());
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / RIPPLE_DURATION_MS, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const opacity = 1 - progress;

      if (outerRef.current) {
        const outerScale = 0.5 + eased * 1.5;
        outerRef.current.style.transform = `scale(${outerScale})`;
        outerRef.current.style.opacity = `${opacity * 0.3}`;
      }
      if (middleRef.current) {
        const middleScale = 0.3 + eased * 1.0;
        middleRef.current.style.transform = `scale(${middleScale})`;
        middleRef.current.style.opacity = `${opacity * 0.5}`;
      }
      if (innerRef.current) {
        const innerScale = 0.2 + eased * 0.6;
        innerRef.current.style.transform = `scale(${innerScale})`;
        innerRef.current.style.opacity = `${opacity * 0.7}`;
      }
      if (dotRef.current) {
        dotRef.current.style.opacity = `${opacity}`;
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div
      className="absolute"
      style={{
        left: pixelX,
        top: pixelY,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Outer ring */}
      <div
        ref={outerRef}
        className="absolute rounded-full"
        style={{
          width: size * 2,
          height: size * 2,
          left: -(size),
          top: -(size),
          border: `2px solid ${color}`,
          backgroundColor: `${color}10`,
        }}
      />
      {/* Middle ring */}
      <div
        ref={middleRef}
        className="absolute rounded-full"
        style={{
          width: size * 1.2,
          height: size * 1.2,
          left: -(size * 0.6),
          top: -(size * 0.6),
          backgroundColor: `${color}25`,
        }}
      />
      {/* Inner glow */}
      <div
        ref={innerRef}
        className="absolute rounded-full"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          left: -(size * 0.3),
          top: -(size * 0.3),
          backgroundColor: `${color}40`,
        }}
      />
      {/* Center dot */}
      <div
        ref={dotRef}
        className="absolute rounded-full"
        style={{
          width: 6,
          height: 6,
          left: -3,
          top: -3,
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  );
}
