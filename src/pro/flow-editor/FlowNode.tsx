/**
 * FlowNode - Individual keyframe node in the flow graph
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImageIcon, GripVertical, Link2 } from 'lucide-react';
import type { KeyframeCapture } from '@/components/video-editor/types';
import { cn } from '@/lib/utils';

interface FlowNodeProps {
  keyframe: KeyframeCapture;
  isSelected: boolean;
  isHovered: boolean;
  /** When true, node won't capture mouse events (for marquee selection through nodes) */
  pointerEventsNone?: boolean;
  /** Current zoom level for Figma-style scaling */
  zoom?: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onConnectionStart: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onLabelChange?: (id: string, label: string) => void;
  onStickyResize?: (id: string, width: number, height: number) => void;
}

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 100;
const DEFAULT_STICKY_WIDTH = 180;
const DEFAULT_STICKY_HEIGHT = 40;
const MIN_STICKY_WIDTH = 120;
const MIN_STICKY_HEIGHT = 32;
const MAX_STICKY_WIDTH = 400;
const MAX_STICKY_HEIGHT = 200;
const STICKY_OFFSET = 8;

export function FlowNode({
  keyframe,
  isSelected,
  isHovered,
  pointerEventsNone = false,
  zoom = 1,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onConnectionStart,
  onMouseUp,
  onLabelChange,
  onStickyResize,
}: FlowNodeProps) {
  // Figma style: border/ring width stays visually constant regardless of zoom
  const ringWidth = 2 / zoom;
  const hoverRingWidth = 1 / zoom;
  const position = keyframe.flowPosition || { x: 0, y: 0 };
  const stickySize = keyframe.stickySize || { width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT };
  
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(keyframe.label || '');
  const [isResizing, setIsResizing] = useState(false);
  const [localSize, setLocalSize] = useState(stickySize);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    setEditText(keyframe.label || '');
  }, [keyframe.label]);

  useEffect(() => {
    setLocalSize(keyframe.stickySize || { width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT });
  }, [keyframe.stickySize]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleTextareaBlur = () => {
    setIsEditing(false);
    if (onLabelChange && editText !== keyframe.label) {
      onLabelChange(keyframe.id, editText);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditText(keyframe.label || '');
      setIsEditing(false);
    }
    // Allow Enter for new lines, use Cmd/Ctrl+Enter to save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleTextareaBlur();
    }
  };

  // Resize handlers
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
      
      const newWidth = Math.min(MAX_STICKY_WIDTH, Math.max(MIN_STICKY_WIDTH, resizeStartRef.current.width + deltaX));
      const newHeight = Math.min(MAX_STICKY_HEIGHT, Math.max(MIN_STICKY_HEIGHT, resizeStartRef.current.height + deltaY));
      
      setLocalSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (resizeStartRef.current && onStickyResize) {
        onStickyResize(keyframe.id, localSize.width, localSize.height);
      }
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [keyframe.id, localSize, onStickyResize]);

  // Save size when local size changes and not resizing
  useEffect(() => {
    if (!isResizing && onStickyResize && 
        (localSize.width !== stickySize.width || localSize.height !== stickySize.height)) {
      onStickyResize(keyframe.id, localSize.width, localSize.height);
    }
  }, [isResizing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStickyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        pointerEvents: pointerEventsNone ? 'none' : 'auto',
      }}
    >
      {/* Sticky Note - Positioned above the node, expands upward */}
      <div
        className={cn(
          "absolute px-2 py-1.5 rounded-md transition-all",
          "bg-[#FEF3C7] shadow-sm",
          isEditing ? "cursor-text" : "cursor-pointer"
        )}
        style={{
          width: localSize.width,
          height: localSize.height,
          bottom: NODE_HEIGHT + STICKY_OFFSET,
          left: 0,
          border: `${1 / zoom}px solid rgba(245, 158, 11, 0.3)`,
          boxShadow: isSelected ? `0 0 0 ${1 / zoom}px #34B27B` : 'none',
        }}
        onClick={handleStickyClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleTextareaBlur}
            onKeyDown={handleTextareaKeyDown}
            className="w-full h-full bg-transparent text-[11px] text-amber-900 font-medium outline-none resize-none leading-relaxed"
            placeholder="添加备注..."
          />
        ) : (
          <p 
            className="text-[11px] text-amber-900 font-medium leading-relaxed whitespace-pre-wrap break-words overflow-hidden"
            style={{ 
              display: '-webkit-box',
              WebkitLineClamp: Math.floor((localSize.height - 12) / 16),
              WebkitBoxOrient: 'vertical',
            }}
          >
            {keyframe.label || '点击添加备注...'}
          </p>
        )}

        {/* Resize handle - bottom right corner */}
        <div
          className={cn(
            "absolute bottom-0 right-0 w-4 h-4 cursor-se-resize",
            "flex items-center justify-center",
            "opacity-0 hover:opacity-100 transition-opacity",
            (isSelected || isHovered) && "opacity-60"
          )}
          onMouseDown={handleResizeStart}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" className="text-amber-700">
            <path
              d="M7 1L1 7M7 4L4 7M7 7L7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Node Container - Fixed position */}
      <div
        className="bg-[#1a1a1c] rounded-lg overflow-hidden cursor-move transition-shadow"
        style={{
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
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
        {/* Thumbnail - Full height */}
        <div className="relative h-full bg-black/50">
          {keyframe.imageData ? (
            <img
              src={keyframe.imageData}
              alt={keyframe.label || 'Keyframe'}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ImageIcon className="w-8 h-8 text-slate-600" />
            </div>
          )}

          {/* Source badge */}
          <div className="absolute top-1 left-1">
            <span className={cn(
              "px-1 py-0.5 text-[9px] font-medium rounded",
              keyframe.source === 'click' 
                ? "bg-blue-500/80 text-white" 
                : "bg-slate-500/80 text-white"
            )}>
              {keyframe.source === 'click' ? '点击' : '手动'}
            </span>
          </div>

          {/* Drag handle */}
          <div className="absolute top-1 right-1 p-0.5 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3 text-white/70" />
          </div>

          {/* Connection handle - right side */}
          <button
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-5 rounded-full",
              "bg-[#34B27B] border-2 border-[#1a1a1c] flex items-center justify-center",
              "opacity-0 hover:opacity-100 transition-opacity cursor-crosshair",
              isHovered && "opacity-100"
            )}
            onMouseDown={onConnectionStart}
          >
            <Link2 className="w-2.5 h-2.5 text-white" />
          </button>

          {/* Connection handle - left side (target) */}
          <div
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full",
              "bg-white/20 border-2 border-[#1a1a1c]",
              "opacity-0 transition-opacity",
              isHovered && "opacity-100"
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default FlowNode;
