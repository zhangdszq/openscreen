/**
 * Region Indicator Component
 * Displays a dashed border overlay on screen to indicate the recording region
 * - Green: Region selected, ready to record
 * - Red: Recording in progress
 */

import { useEffect, useState, useCallback } from "react";

interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegionIndicatorProps {
  region?: RegionBounds;
  isRecording?: boolean;
  label?: string;
}

export default function RegionIndicator({ 
  region, 
  isRecording: initialRecording = false,
  label = "录制区域"
}: RegionIndicatorProps) {
  const [bounds, setBounds] = useState<RegionBounds | null>(null);
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Listen for region updates from main process
  useEffect(() => {
    const handleRegionUpdate = (_event: any, data: { 
      region: RegionBounds; 
      isRecording?: boolean; 
      isPaused?: boolean 
    }) => {
      if (data.region) {
        setBounds(data.region);
      }
      if (data.isRecording !== undefined) {
        setIsRecording(data.isRecording);
        // Reset timer when recording starts
        if (data.isRecording) {
          setRecordingTime(0);
        }
      }
      if (data.isPaused !== undefined) {
        setIsPaused(data.isPaused);
      }
    };

    // @ts-ignore - electronAPI types
    if (window.electronAPI?.onRegionIndicatorUpdate) {
      window.electronAPI.onRegionIndicatorUpdate(handleRegionUpdate);
    }

    return () => {
      // @ts-ignore
      if (window.electronAPI?.removeRegionIndicatorListener) {
        window.electronAPI.removeRegionIndicatorListener();
      }
    };
  }, []);

  // Recording timer
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const currentBounds = region || bounds;

  if (!currentBounds) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{
        // Window itself handles positioning, we just fill it
        width: '100%',
        height: '100%',
      }}
    >
      {/* Dashed border frame - always green */}
      <div 
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          border: '2px dashed #22c55e', // Green color
          borderRadius: '4px',
          boxSizing: 'border-box',
          animation: isRecording ? 'pulse-border 2s ease-in-out infinite' : 'marching-ants 1s linear infinite',
        }}
      />

      {/* Corner markers - always green */}
      <CornerMarker position="top-left" color="#22c55e" />
      <CornerMarker position="top-right" color="#22c55e" />
      <CornerMarker position="bottom-left" color="#22c55e" />
      <CornerMarker position="bottom-right" color="#22c55e" />

      {/* Top label bar - always green */}
      <div 
        className="absolute flex items-center gap-2 px-3 py-1.5 rounded-b-lg"
        style={{
          left: '50%',
          top: 0,
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(34, 197, 94, 0.95)', // Green background
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Recording indicator dot */}
        {isRecording && (
          <div 
            className="w-2.5 h-2.5 rounded-full bg-white"
            style={{
              animation: isPaused ? 'none' : 'recording-pulse 1s ease-in-out infinite',
            }}
          />
        )}
        
        {/* Label text */}
        <span className="text-white text-xs font-medium whitespace-nowrap">
          {isRecording ? (isPaused ? '已暂停' : '录制中') : label}
        </span>

        {/* Timer when recording */}
        {isRecording && (
          <span className="text-white/90 text-xs font-mono">
            {formatTime(recordingTime)}
          </span>
        )}

        {/* Dimensions */}
        <span className="text-white/70 text-xs">
          {currentBounds.width} × {currentBounds.height}
        </span>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes marching-ants {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: 16;
          }
        }

        @keyframes pulse-border {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        @keyframes recording-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.8);
          }
        }
      `}</style>
    </div>
  );
}

// Corner marker component
function CornerMarker({ 
  position, 
  color 
}: { 
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  color: string;
}) {
  const size = 12;
  const thickness = 3;

  const styles: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
  };

  // Position the corner
  switch (position) {
    case 'top-left':
      styles.top = -1;
      styles.left = -1;
      styles.borderTop = `${thickness}px solid ${color}`;
      styles.borderLeft = `${thickness}px solid ${color}`;
      break;
    case 'top-right':
      styles.top = -1;
      styles.right = -1;
      styles.borderTop = `${thickness}px solid ${color}`;
      styles.borderRight = `${thickness}px solid ${color}`;
      break;
    case 'bottom-left':
      styles.bottom = -1;
      styles.left = -1;
      styles.borderBottom = `${thickness}px solid ${color}`;
      styles.borderLeft = `${thickness}px solid ${color}`;
      break;
    case 'bottom-right':
      styles.bottom = -1;
      styles.right = -1;
      styles.borderBottom = `${thickness}px solid ${color}`;
      styles.borderRight = `${thickness}px solid ${color}`;
      break;
  }

  return <div style={styles} />;
}
