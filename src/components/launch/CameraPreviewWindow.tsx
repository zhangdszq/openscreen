import { useEffect, useRef, useState } from "react";

interface CameraPreviewOptions {
  shape: 'circle' | 'rectangle';
  size: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  recording?: boolean;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

export function CameraPreviewWindow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [options, setOptions] = useState<CameraPreviewOptions>(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      shape: (params.get('shape') as 'circle' | 'rectangle') || 'circle',
      size: parseInt(params.get('size') || '15', 10),
      position: (params.get('position') as CameraPreviewOptions['position']) || 'bottom-right',
      recording: false,
    };
  });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Initialize camera stream (always keep it running)
  useEffect(() => {
    let isMounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;

    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480 },
            height: { ideal: 480 },
            aspectRatio: { ideal: 1 },
          },
          audio: false,
        });
        if (isMounted) {
          setStream(mediaStream);
        } else {
          mediaStream.getTracks().forEach(t => t.stop());
        }
      } catch (error) {
        console.error('Failed to get camera stream, retrying in 1s...', error);
        if (isMounted) {
          retryTimeout = setTimeout(initCamera, 1000);
        }
      }
    };

    initCamera();

    return () => {
      isMounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [stream]);

  // Connect stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Listen for updates from main process
  useEffect(() => {
    if (window.electronAPI?.onCameraPreviewInit) {
      const cleanup1 = window.electronAPI.onCameraPreviewInit((opts: CameraPreviewOptions) => {
        setOptions(prev => ({ ...prev, ...opts }));
      });

      const cleanup2 = window.electronAPI.onCameraPreviewUpdate?.((opts: Partial<CameraPreviewOptions>) => {
        setOptions(prev => ({ ...prev, ...opts }));
      });

      return () => {
        cleanup1?.();
        cleanup2?.();
      };
    }
  }, []);

  // Handle drag to change position
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      const x = e.screenX;
      const y = e.screenY;

      const isLeft = x < screenWidth / 2;
      const isTop = y < screenHeight / 2;

      let newPosition: CameraPreviewOptions['position'];
      if (isTop && isLeft) newPosition = 'top-left';
      else if (isTop && !isLeft) newPosition = 'top-right';
      else if (!isTop && isLeft) newPosition = 'bottom-left';
      else newPosition = 'bottom-right';

      if (newPosition !== options.position) {
        setOptions(prev => ({ ...prev, position: newPosition }));
        window.electronAPI?.updateCameraPreview?.({ position: newPosition });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, options.position]);

  // Handle resize from any edge
  const handleResizeMouseDown = (direction: ResizeDirection) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeDirection(direction);
    resizeStartRef.current = {
      x: e.screenX,
      y: e.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  };

  useEffect(() => {
    if (!resizeDirection) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.screenX - resizeStartRef.current.x;
      const deltaY = e.screenY - resizeStartRef.current.y;
      
      let delta = 0;
      
      // Calculate delta based on resize direction
      switch (resizeDirection) {
        case 'e':
        case 'se':
          delta = deltaX;
          break;
        case 'w':
        case 'nw':
          delta = -deltaX;
          break;
        case 's':
        case 'sw':
          delta = deltaY;
          break;
        case 'n':
        case 'ne':
          delta = -deltaY;
          break;
      }
      
      const newSize = Math.max(80, Math.min(400, resizeStartRef.current.width + delta));
      
      // Request main process to resize window
      window.electronAPI?.resizeCameraPreview?.(newSize);
    };

    const handleMouseUp = () => {
      setResizeDirection(null);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeDirection]);

  const isResizing = resizeDirection !== null;

  return (
    <div 
      className="w-full h-full cursor-move"
      onMouseDown={handleMouseDown}
      style={{
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div
        className="overflow-hidden relative"
        style={{
          // Use min dimension to ensure perfect circle/square
          width: '100%',
          height: '100%',
          aspectRatio: '1 / 1',
          maxWidth: '100%',
          maxHeight: '100%',
          borderRadius: options.shape === 'circle' ? '50%' : '12px',
          border: options.recording ? '3px solid rgba(239, 68, 68, 0.9)' : '3px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ 
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
          }}
        />
        {/* Recording indicator overlay */}
        {options.recording && (
          <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/50 rounded-full px-1.5 py-0.5">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-[10px] font-medium">REC</span>
          </div>
        )}
      </div>
      {isDragging && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/40"
          style={{
            borderRadius: options.shape === 'circle' ? '50%' : '12px',
          }}
        >
          <span className="text-white text-xs font-medium drop-shadow-lg">拖动到角落</span>
        </div>
      )}
      
      {/* Resize handles - all edges and corners */}
      {/* Edge handles */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2 cursor-n-resize"
        onMouseDown={handleResizeMouseDown('n')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 cursor-s-resize"
        onMouseDown={handleResizeMouseDown('s')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 cursor-w-resize"
        onMouseDown={handleResizeMouseDown('w')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-8 cursor-e-resize"
        onMouseDown={handleResizeMouseDown('e')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      
      {/* Corner handles */}
      <div
        className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize"
        onMouseDown={handleResizeMouseDown('nw')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize"
        onMouseDown={handleResizeMouseDown('ne')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize"
        onMouseDown={handleResizeMouseDown('sw')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeMouseDown('se')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      
      {isResizing && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/40"
          style={{
            borderRadius: options.shape === 'circle' ? '50%' : '12px',
          }}
        >
          <span className="text-white text-xs font-medium drop-shadow-lg">调整大小</span>
        </div>
      )}
    </div>
  );
}
