/**
 * FlowRegion - A rectangular area in the flow graph
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link2 } from 'lucide-react';
import type { FlowRegion as FlowRegionType } from '@/components/video-editor/types';
import { cn } from '@/lib/utils';

interface FlowRegionProps {
  region: FlowRegionType;
  isSelected: boolean;
  isHovered: boolean;
  /** Current zoom level for Figma-style scaling */
  zoom?: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onConnectionStart: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onResize?: (id: string, width: number, height: number) => void;
}

const MIN_WIDTH = 20;
const MIN_HEIGHT = 20;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

// Predefined colors for regions
export const REGION_COLORS = [
  { name: '蓝色', value: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.5)' },
  { name: '绿色', value: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.5)' },
  { name: '紫色', value: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.5)' },
  { name: '橙色', value: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.5)' },
  { name: '粉色', value: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.5)' },
  { name: '灰色', value: 'rgba(156, 163, 175, 0.15)', border: 'rgba(156, 163, 175, 0.5)' },
];

export function FlowRegion({
  region,
  isSelected,
  isHovered,
  zoom = 1,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onConnectionStart,
  onMouseUp,
  onResize,
}: FlowRegionProps) {
  // Figma style: border/ring width stays visually constant regardless of zoom
  const borderWidth = 2 / zoom;
  const ringWidth = 2 / zoom;
  const hoverRingWidth = 1 / zoom;
  const [isResizing, setIsResizing] = useState(false);
  const [localSize, setLocalSize] = useState(region.size);
  const resizeStartRef = React.useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    setLocalSize(region.size);
  }, [region.size]);

  // Get color info
  const colorInfo = REGION_COLORS.find(c => c.value === region.color) || REGION_COLORS[0];
  const bgColor = region.color || colorInfo.value;
  const borderColor = colorInfo.border;

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: localSize.width,
      height: localSize.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current) return;
      
      const deltaX = moveEvent.clientX - resizeStartRef.current.x;
      const deltaY = moveEvent.clientY - resizeStartRef.current.y;
      
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStartRef.current.width + deltaX));
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStartRef.current.height + deltaY));
      
      setLocalSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (resizeStartRef.current && onResize) {
        onResize(region.id, localSize.width, localSize.height);
      }
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [region.id, localSize, onResize]);

  // Save size when done resizing
  useEffect(() => {
    if (!isResizing && onResize && 
        (localSize.width !== region.size.width || localSize.height !== region.size.height)) {
      onResize(region.id, localSize.width, localSize.height);
    }
  }, [isResizing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="absolute rounded-lg cursor-move transition-shadow"
      style={{
        left: region.position.x,
        top: region.position.y,
        width: localSize.width,
        height: localSize.height,
        backgroundColor: bgColor,
        borderWidth: borderWidth,
        borderStyle: region.borderStyle || 'dashed',
        borderColor: borderColor,
        boxShadow: isSelected 
          ? `0 0 0 ${ringWidth}px #34B27B` 
          : isHovered 
            ? `0 0 0 ${hoverRingWidth}px rgba(255, 255, 255, 0.3)` 
            : 'none',
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseUp={onMouseUp}
    >
      {/* Connection handles */}
      {/* Right side */}
      <button
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-5 rounded-full",
          "bg-[#34B27B] border-2 border-white flex items-center justify-center",
          "opacity-0 hover:opacity-100 transition-opacity cursor-crosshair",
          (isHovered || isSelected) && "opacity-100"
        )}
        onMouseDown={onConnectionStart}
      >
        <Link2 className="w-2.5 h-2.5 text-white" />
      </button>

      {/* Left side (target) */}
      <div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full",
          "bg-white/40 border-2 border-white/60",
          "opacity-0 transition-opacity",
          (isHovered || isSelected) && "opacity-100"
        )}
      />

      {/* Resize handle - bottom right corner */}
      <div
        className={cn(
          "absolute bottom-1 right-1 w-4 h-4 cursor-se-resize",
          "flex items-center justify-center",
          "opacity-0 hover:opacity-100 transition-opacity",
          (isSelected || isHovered) && "opacity-60"
        )}
        onMouseDown={handleResizeStart}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-slate-500">
          <path
            d="M9 1L1 9M9 5L5 9M9 9L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default FlowRegion;
