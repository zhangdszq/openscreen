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
        // Request high resolution for good quality when cropped to any aspect ratio
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
      
      // For circle: uniform resize; for rectangle: independent width/height
      if (options.shape === 'circle') {
        // Circle: use single dimension (uniform resize)
        let delta = 0;
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
        window.electronAPI?.resizeCameraPreview?.(newSize);
      } else {
        // Rectangle: independent width/height resize
        let newWidth = resizeStartRef.current.width;
        let newHeight = resizeStartRef.current.height;
        
        // Horizontal resize
        if (resizeDirection === 'e' || resizeDirection === 'se' || resizeDirection === 'ne') {
          newWidth = resizeStartRef.current.width + deltaX;
        } else if (resizeDirection === 'w' || resizeDirection === 'sw' || resizeDirection === 'nw') {
          newWidth = resizeStartRef.current.width - deltaX;
        }
        
        // Vertical resize
        if (resizeDirection === 's' || resizeDirection === 'se' || resizeDirection === 'sw') {
          newHeight = resizeStartRef.current.height + deltaY;
        } else if (resizeDirection === 'n' || resizeDirection === 'ne' || resizeDirection === 'nw') {
          newHeight = resizeStartRef.current.height - deltaY;
        }
        
        // Clamp values
        newWidth = Math.max(80, Math.min(500, newWidth));
        newHeight = Math.max(60, Math.min(400, newHeight));
        
        window.electronAPI?.resizeCameraPreviewRect?.(newWidth, newHeight);
      }
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
  }, [resizeDirection, options.shape]);

  const isResizing = resizeDirection !== null;

  return (
    <div 
      className="cursor-move"
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        WebkitAppRegion: 'drag',
        background: 'transparent',
      } as React.CSSProperties}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: options.shape === 'circle' ? '50%' : '12px',
          border: options.recording ? '3px solid rgba(239, 68, 68, 0.9)' : '3px solid rgba(255, 255, 255, 0.8)',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: options.shape === 'circle' ? '50%' : '12px',
          }}
        >
          <span className="text-white text-xs font-medium drop-shadow-lg">拖动到角落</span>
        </div>
      )}
      
      {/* Resize handles - all edges and corners */}
      {/* Edge handles */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 32,
          height: 8,
          cursor: 'n-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('n')}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 32,
          height: 8,
          cursor: 's-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('s')}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 8,
          height: 32,
          cursor: 'w-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('w')}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 8,
          height: 32,
          cursor: 'e-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('e')}
      />
      
      {/* Corner handles */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 16,
          height: 16,
          cursor: 'nw-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('nw')}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 16,
          height: 16,
          cursor: 'ne-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('ne')}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 16,
          height: 16,
          cursor: 'sw-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('sw')}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 16,
          height: 16,
          cursor: 'se-resize',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('se')}
      />
      
      {isResizing && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: options.shape === 'circle' ? '50%' : '12px',
          }}
        >
          <span className="text-white text-xs font-medium drop-shadow-lg">调整大小</span>
        </div>
      )}
    </div>
  );
}
