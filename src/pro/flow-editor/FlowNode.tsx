/**
 * FlowNode - Individual keyframe node in the flow graph
 */

import React, { useState, useRef, useEffect } from 'react';
import { ImageIcon, GripVertical, Link2 } from 'lucide-react';
import type { KeyframeCapture } from '@/components/video-editor/types';
import { cn } from '@/lib/utils';

interface FlowNodeProps {
  keyframe: KeyframeCapture;
  isSelected: boolean;
  isHovered: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onConnectionStart: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onLabelChange?: (id: string, label: string) => void;
}

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 100;
const STICKY_HEIGHT = 32;
const STICKY_OFFSET = 8;

export function FlowNode({
  keyframe,
  isSelected,
  isHovered,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onConnectionStart,
  onMouseUp,
  onLabelChange,
}: FlowNodeProps) {
  const position = keyframe.flowPosition || { x: 0, y: 0 };
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(keyframe.label || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditText(keyframe.label || '');
  }, [keyframe.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStickyDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    if (onLabelChange && editText !== keyframe.label) {
      onLabelChange(keyframe.id, editText);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'Escape') {
      setEditText(keyframe.label || '');
      setIsEditing(false);
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: position.x,
        top: position.y - STICKY_HEIGHT - STICKY_OFFSET,
      }}
    >
      {/* Sticky Note - Above the node */}
      <div
        className={cn(
          "mb-2 px-2 py-1.5 rounded-md cursor-text transition-all",
          "bg-[#FEF3C7] shadow-sm border border-[#F59E0B]/30",
          isSelected && "ring-1 ring-[#34B27B]"
        )}
        style={{
          width: NODE_WIDTH,
          minHeight: STICKY_HEIGHT,
        }}
        onDoubleClick={handleStickyDoubleClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-full bg-transparent text-[11px] text-amber-900 font-medium outline-none"
            placeholder="添加备注..."
          />
        ) : (
          <p className="text-[11px] text-amber-900 font-medium truncate">
            {keyframe.label || '双击添加备注...'}
          </p>
        )}
      </div>

      {/* Node Container */}
      <div
        className={cn(
          "bg-[#1a1a1c] rounded-lg overflow-hidden cursor-move transition-shadow",
          isSelected && "ring-2 ring-[#34B27B]",
          isHovered && !isSelected && "ring-1 ring-white/30"
        )}
        style={{
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
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
