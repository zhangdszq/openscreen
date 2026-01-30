/**
 * RegionSelector Component
 * 
 * Full-screen transparent overlay for selecting a screen region to record.
 * Shows a dashed border around the selected area with dimensions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function RegionSelector() {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentPoint, setCurrentPoint] = useState({ x: 0, y: 0 });
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate region from start and current points
  const getRegion = useCallback((): Region | null => {
    if (!isSelecting && !selectedRegion) return null;
    
    if (selectedRegion) return selectedRegion;
    
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    
    if (width < 10 || height < 10) return null;
    
    return { x, y, width, height };
  }, [isSelecting, startPoint, currentPoint, selectedRegion]);

  const region = getRegion();

  // Handle mouse down - start selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    // Reset selection if clicking outside the selected region
    if (selectedRegion) {
      const clickX = e.clientX;
      const clickY = e.clientY;
      const isInsideRegion = 
        clickX >= selectedRegion.x && 
        clickX <= selectedRegion.x + selectedRegion.width &&
        clickY >= selectedRegion.y && 
        clickY <= selectedRegion.y + selectedRegion.height;
      
      if (!isInsideRegion) {
        setSelectedRegion(null);
      }
    }
    
    setIsSelecting(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
    setCurrentPoint({ x: e.clientX, y: e.clientY });
  }, [selectedRegion]);

  // Handle mouse move - update selection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting) return;
    setCurrentPoint({ x: e.clientX, y: e.clientY });
  }, [isSelecting]);

  // Handle mouse up - finish selection
  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return;
    
    const finalRegion = getRegion();
    if (finalRegion && finalRegion.width >= 50 && finalRegion.height >= 50) {
      setSelectedRegion(finalRegion);
    }
    setIsSelecting(false);
  }, [isSelecting, getRegion]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel and close
        window.electronAPI?.cancelRegionSelection?.();
      } else if (e.key === 'Enter' && selectedRegion) {
        // Confirm selection
        window.electronAPI?.confirmRegionSelection?.(selectedRegion);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegion]);

  // Handle confirm button click
  const handleConfirm = useCallback(() => {
    if (selectedRegion) {
      window.electronAPI?.confirmRegionSelection?.(selectedRegion);
    }
  }, [selectedRegion]);

  // Handle cancel button click
  const handleCancel = useCallback(() => {
    window.electronAPI?.cancelRegionSelection?.();
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 cursor-crosshair select-none"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Instructions */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm">
        拖拽选择录制区域 • Enter 确认 • Esc 取消
      </div>

      {/* Selection region */}
      {region && (
        <>
          {/* Clear area (the selected region) */}
          <div
            style={{
              position: 'absolute',
              left: region.x,
              top: region.y,
              width: region.width,
              height: region.height,
              backgroundColor: 'transparent',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            }}
          />
          
          {/* Dashed border */}
          <div
            style={{
              position: 'absolute',
              left: region.x - 2,
              top: region.y - 2,
              width: region.width + 4,
              height: region.height + 4,
              border: '2px dashed #fff',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          />

          {/* Corner handles for selected region */}
          {selectedRegion && (
            <>
              {/* Top-left */}
              <div style={{ position: 'absolute', left: region.x - 4, top: region.y - 4, width: 8, height: 8, backgroundColor: '#fff', borderRadius: 2 }} />
              {/* Top-right */}
              <div style={{ position: 'absolute', left: region.x + region.width - 4, top: region.y - 4, width: 8, height: 8, backgroundColor: '#fff', borderRadius: 2 }} />
              {/* Bottom-left */}
              <div style={{ position: 'absolute', left: region.x - 4, top: region.y + region.height - 4, width: 8, height: 8, backgroundColor: '#fff', borderRadius: 2 }} />
              {/* Bottom-right */}
              <div style={{ position: 'absolute', left: region.x + region.width - 4, top: region.y + region.height - 4, width: 8, height: 8, backgroundColor: '#fff', borderRadius: 2 }} />
            </>
          )}

          {/* Dimension label */}
          <div
            style={{
              position: 'absolute',
              left: region.x + region.width / 2,
              top: region.y + region.height + 10,
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {Math.round(region.width)} × {Math.round(region.height)}
          </div>

          {/* Confirm/Cancel buttons for selected region */}
          {selectedRegion && (
            <div
              style={{
                position: 'absolute',
                left: region.x + region.width / 2,
                top: region.y + region.height + 40,
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 8,
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                确认录制
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
            </div>
          )}
        </>
      )}

      {/* Cross-hair guides */}
      {isSelecting && (
        <>
          {/* Horizontal line */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: currentPoint.y,
              height: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              pointerEvents: 'none',
            }}
          />
          {/* Vertical line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: currentPoint.x,
              width: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  );
}

export default RegionSelector;
