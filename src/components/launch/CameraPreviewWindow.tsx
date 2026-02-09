import { useEffect, useRef, useState } from "react";

interface CameraPreviewOptions {
  shape: 'circle' | 'rectangle';
  size: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  borderStyle: 'white' | 'shadow';
  shadowIntensity: number; // 0-100
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
      borderStyle: (params.get('borderStyle') as 'white' | 'shadow') || 'shadow',
      shadowIntensity: parseInt(params.get('shadowIntensity') || '60', 10),
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

  // Handle drag to change position (disabled during recording)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (options.recording) return; // Lock position during recording
    // Only start drag if not clicking on resize handles
    if ((e.target as HTMLElement).dataset.resize) return;
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

  // Handle resize from any edge (disabled during recording)
  const handleResizeMouseDown = (direction: ResizeDirection) => (e: React.MouseEvent) => {
    if (options.recording) return; // Lock size during recording
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
      
      // For circle/square: uniform resize; for rectangle: independent width/height
      if (options.shape === 'circle' || options.shape === 'square') {
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

  // For circle shape, use clip-path to ensure everything outside is clipped
  const isCircle = options.shape === 'circle';
  
  // Show resize handles when not recording
  const showResizeHandles = !options.recording;
  
  // Calculate drop-shadow filter for shadow border style
  // Apply to outer container so it's not clipped
  const getShadowFilter = () => {
    if (options.borderStyle !== 'shadow') return 'none';
    const intensity = options.shadowIntensity / 100;
    // Tight shadow effect (fits within 5px padding)
    return `
      drop-shadow(0 1px 1px rgba(0, 0, 0, ${0.5 * intensity}))
      drop-shadow(0 2px 3px rgba(0, 0, 0, ${0.4 * intensity}))
      drop-shadow(0 3px 5px rgba(0, 0, 0, ${0.3 * intensity}))
    `;
  };

  // Padding to accommodate shadow (shadow renders outside element bounds)
  // Minimal padding - matches SHADOW_PADDING in electron/windows.ts
  const shadowPadding = options.borderStyle === 'shadow' ? 5 : 0;

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        overflow: 'visible',
      }}
    >
      {/* Shadow wrapper - NOT clipped, contains the shadow filter */}
      <div
        style={{
          position: 'absolute',
          top: shadowPadding,
          left: shadowPadding,
          right: shadowPadding,
          bottom: shadowPadding,
          filter: getShadowFilter(),
          WebkitFilter: getShadowFilter(),
        } as React.CSSProperties}
      >
        {/* Main content area with clipping */}
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
            // Clip everything outside the circle/rectangle
            WebkitClipPath: isCircle ? 'circle(50% at center)' : 'inset(0 round 12px)',
            clipPath: isCircle ? 'circle(50% at center)' : 'inset(0 round 12px)',
          } as React.CSSProperties}
        >
          {/* Video container */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: isCircle ? '50%' : '12px',
              overflow: 'hidden',
              // No background color - fully transparent until video loads
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
          </div>
          
          {/* Border overlay - inside the clip area (only for white border style) */}
          {options.borderStyle === 'white' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: isCircle ? '50%' : '12px',
                border: '3px solid rgba(255, 255, 255, 0.8)',
                pointerEvents: 'none',
              }}
            />
          )}
          
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
                borderRadius: isCircle ? '50%' : '12px',
              }}
            >
              <span className="text-white text-xs font-medium drop-shadow-lg">拖动到角落</span>
            </div>
          )}
          
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
                borderRadius: isCircle ? '50%' : '12px',
              }}
            >
              <span className="text-white text-xs font-medium drop-shadow-lg">调整大小</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Resize handles - positioned at edges of the actual content area */}
      {showResizeHandles && (
        <>
          {/* Corner handles */}
          <div
            data-resize="nw"
            style={{
              position: 'absolute',
              top: shadowPadding,
              left: shadowPadding,
              width: 20,
              height: 20,
              cursor: 'nw-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('nw')}
          />
          <div
            data-resize="ne"
            style={{
              position: 'absolute',
              top: shadowPadding,
              right: shadowPadding,
              width: 20,
              height: 20,
              cursor: 'ne-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('ne')}
          />
          <div
            data-resize="sw"
            style={{
              position: 'absolute',
              bottom: shadowPadding,
              left: shadowPadding,
              width: 20,
              height: 20,
              cursor: 'sw-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('sw')}
          />
          <div
            data-resize="se"
            style={{
              position: 'absolute',
              bottom: shadowPadding,
              right: shadowPadding,
              width: 20,
              height: 20,
              cursor: 'se-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('se')}
          />
          
          {/* Edge handles */}
          <div
            data-resize="n"
            style={{
              position: 'absolute',
              top: shadowPadding,
              left: shadowPadding + 20,
              right: shadowPadding + 20,
              height: 10,
              cursor: 'n-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('n')}
          />
          <div
            data-resize="s"
            style={{
              position: 'absolute',
              bottom: shadowPadding,
              left: shadowPadding + 20,
              right: shadowPadding + 20,
              height: 10,
              cursor: 's-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('s')}
          />
          <div
            data-resize="w"
            style={{
              position: 'absolute',
              left: shadowPadding,
              top: shadowPadding + 20,
              bottom: shadowPadding + 20,
              width: 10,
              cursor: 'w-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('w')}
          />
          <div
            data-resize="e"
            style={{
              position: 'absolute',
              right: shadowPadding,
              top: shadowPadding + 20,
              bottom: shadowPadding + 20,
              width: 10,
              cursor: 'e-resize',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseDown={handleResizeMouseDown('e')}
          />
        </>
      )}
    </div>
  );
}
