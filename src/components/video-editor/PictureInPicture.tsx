/**
 * PictureInPicture Component
 * 
 * Renders the camera overlay on top of the main video with drag and resize support.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import type { CameraOverlay } from './types';

interface PictureInPictureProps {
  /** Camera overlay settings */
  overlay: CameraOverlay;
  /** Callback when overlay settings change */
  onOverlayChange: (overlay: CameraOverlay) => void;
  /** Container dimensions */
  containerWidth: number;
  containerHeight: number;
  /** Current playback time in ms */
  currentTimeMs: number;
  /** Whether the video is playing */
  isPlaying: boolean;
  /** Main video duration in ms */
  videoDurationMs: number;
}

export function PictureInPicture({
  overlay,
  onOverlayChange,
  containerWidth,
  containerHeight,
  currentTimeMs,
  isPlaying,
  videoDurationMs,
}: PictureInPictureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Calculate pixel dimensions from percentage
  const pipWidth = (overlay.size / 100) * containerWidth;
  const pipHeight = overlay.shape === 'circle' ? pipWidth : pipWidth * 0.75;
  
  // Calculate pixel position (position is where the center should be)
  const pipX = overlay.position.x * containerWidth - pipWidth / 2;
  const pipY = overlay.position.y * containerHeight - pipHeight / 2;

  // Sync camera video with main video
  useEffect(() => {
    if (!videoRef.current || !overlay.enabled || !overlay.videoPath) return;
    
    const video = videoRef.current;
    const targetTime = currentTimeMs / 1000;
    
    // Sync time if difference is more than 0.1 seconds
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime;
    }
    
    // Sync play/pause state
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTimeMs, isPlaying, overlay.enabled, overlay.videoPath]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pipX,
      y: e.clientY - pipY,
    });
  }, [pipX, pipY]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Handle mouse move for drag and resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x + pipWidth / 2;
        const newY = e.clientY - dragStart.y + pipHeight / 2;
        
        // Clamp to container bounds
        const clampedX = Math.max(pipWidth / 2, Math.min(containerWidth - pipWidth / 2, newX));
        const clampedY = Math.max(pipHeight / 2, Math.min(containerHeight - pipHeight / 2, newY));
        
        onOverlayChange({
          ...overlay,
          position: {
            x: clampedX / containerWidth,
            y: clampedY / containerHeight,
          },
        });
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.x;
        const deltaSize = (deltaX / containerWidth) * 100;
        const newSize = Math.max(5, Math.min(50, overlay.size + deltaSize));
        
        setDragStart({ x: e.clientX, y: e.clientY });
        
        onOverlayChange({
          ...overlay,
          size: newSize,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, overlay, onOverlayChange, containerWidth, containerHeight, pipWidth, pipHeight]);

  // Don't render if disabled, no video path, or container has no size
  if (!overlay.enabled || !overlay.videoPath || containerWidth <= 0 || containerHeight <= 0) {
    return null;
  }
  
  // Don't render if calculated size is too small
  if (pipWidth < 10 || pipHeight < 10) {
    return null;
  }

  const isCircle = overlay.shape === 'circle';
  const borderRadius = isCircle ? '50%' : '12px';

  // Shadow/border styles
  const getBorderStyle = () => {
    switch (overlay.borderStyle) {
      case 'white':
        return '3px solid rgba(255, 255, 255, 0.8)';
      case 'shadow':
        return 'none';
      case 'none':
      default:
        return 'none';
    }
  };

  const getShadowStyle = () => {
    if (overlay.borderStyle === 'shadow') {
      return `
        0 2px 4px rgba(0, 0, 0, 0.3),
        0 4px 8px rgba(0, 0, 0, 0.25),
        0 8px 16px rgba(0, 0, 0, 0.2)
      `;
    }
    return 'none';
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: pipX,
        top: pipY,
        width: pipWidth,
        height: pipHeight,
        borderRadius,
        overflow: 'hidden',
        opacity: overlay.opacity,
        cursor: isDragging ? 'grabbing' : 'grab',
        border: getBorderStyle(),
        boxShadow: getShadowStyle(),
        zIndex: 100,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Camera video */}
      <video
        ref={videoRef}
        src={`file://${overlay.videoPath}`}
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)', // Mirror the camera
        }}
      />
      
      {/* Resize handle (bottom-right corner) */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 20,
            height: 20,
            cursor: 'se-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.8) 50%)',
            borderRadius: isCircle ? '0 0 50% 0' : '0 0 8px 0',
          }}
          onMouseDown={handleResizeStart}
        />
      )}
      
      {/* Hover overlay with controls hint */}
      {isHovered && !isDragging && !isResizing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius,
          }}
        >
          <span className="text-white text-xs font-medium drop-shadow-lg">
            拖动调整位置
          </span>
        </div>
      )}
    </div>
  );
}

export default PictureInPicture;
