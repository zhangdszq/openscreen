/**
 * FlowToolbar - Toolbar for flow editor actions
 */

import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Trash2,
  Download,
  Layout,
  X,
  Square,
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  Group,
  Ungroup,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DrawMode } from './useFlowEditor';

interface FlowToolbarProps {
  zoom: number;
  hasSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  keyframeCount: number;
  connectionCount: number;
  regionCount: number;
  groupCount: number;
  drawMode: DrawMode;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  onResetView: () => void;
  onAutoLayout: () => void;
  onDeleteSelected: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSetDrawMode: (mode: DrawMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onClose: () => void;
}

export function FlowToolbar({
  zoom,
  hasSelection,
  canGroup,
  canUngroup,
  keyframeCount,
  connectionCount,
  regionCount,
  groupCount,
  drawMode,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onFitToView,
  onResetView,
  onAutoLayout,
  onDeleteSelected,
  onGroup,
  onUngroup,
  onSetDrawMode,
  onUndo,
  onRedo,
  onExport,
  onClose,
}: FlowToolbarProps) {
  return (
    <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50 pointer-events-auto">
      {/* Left section - title, tools and stats */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-200">流程图编辑器</h2>
        
        {/* Tool selection */}
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
          <ToolbarButton
            icon={<MousePointer2 className="w-4 h-4" />}
            onClick={() => onSetDrawMode('select')}
            title="选择工具 (V)"
            active={drawMode === 'select'}
          />
          <ToolbarButton
            icon={<Hand className="w-4 h-4" />}
            onClick={() => onSetDrawMode('hand')}
            title="抓手工具 (H)"
            active={drawMode === 'hand'}
          />
          <ToolbarButton
            icon={<Square className="w-4 h-4" />}
            onClick={() => onSetDrawMode('region')}
            title="绘制区域 (R)"
            active={drawMode === 'region'}
          />
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
          <ToolbarButton
            icon={<Undo2 className="w-4 h-4" />}
            onClick={onUndo}
            title="撤销 (⌘/Ctrl+Z)"
            disabled={!canUndo}
          />
          <ToolbarButton
            icon={<Redo2 className="w-4 h-4" />}
            onClick={onRedo}
            title="重做 (⌘/Ctrl+Shift+Z)"
            disabled={!canRedo}
          />
        </div>

        {/* Group/Ungroup */}
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
          <ToolbarButton
            icon={<Group className="w-4 h-4" />}
            onClick={onGroup}
            title="编组 (⌘/Ctrl+G)"
            disabled={!canGroup}
          />
          <ToolbarButton
            icon={<Ungroup className="w-4 h-4" />}
            onClick={onUngroup}
            title="取消编组 (⌘/Ctrl+Shift+G)"
            disabled={!canUngroup}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{keyframeCount} 关键帧</span>
          <span>•</span>
          <span>{regionCount} 区域</span>
          <span>•</span>
          <span>{groupCount} 组</span>
          <span>•</span>
          <span>{connectionCount} 连接</span>
        </div>
      </div>

      {/* Center section - zoom controls */}
      <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 pointer-events-auto">
        <ToolbarButton
          icon={<ZoomOut className="w-4 h-4" />}
          onClick={onZoomOut}
          title="缩小"
        />
        <span className="px-2 text-xs text-slate-400 min-w-[50px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton
          icon={<ZoomIn className="w-4 h-4" />}
          onClick={onZoomIn}
          title="放大"
        />
        <div className="w-px h-4 bg-white/10 mx-1" />
        <ToolbarButton
          icon={<Maximize2 className="w-4 h-4" />}
          onClick={onFitToView}
          title="适应视图"
        />
        <ToolbarButton
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={onResetView}
          title="重置视图"
        />
      </div>

      {/* Right section - actions */}
      <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 pointer-events-auto">
        <ToolbarButton
          icon={<Layout className="w-4 h-4" />}
          onClick={onAutoLayout}
          title="自动布局"
        />
        <ToolbarButton
          icon={<Trash2 className="w-4 h-4" />}
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="删除选中"
          variant="danger"
        />
        <div className="w-px h-4 bg-white/10 mx-1" />
        <ToolbarButton
          icon={<Download className="w-4 h-4" />}
          onClick={onExport}
          title="导出"
        />
        <div className="w-px h-4 bg-white/10 mx-1" />
        <ToolbarButton
          icon={<X className="w-4 h-4" />}
          onClick={onClose}
          title="关闭"
        />
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'danger';
}

function ToolbarButton({
  icon,
  onClick,
  title,
  disabled = false,
  active = false,
  variant = 'default',
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-2 rounded-md transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        active && "bg-[#34B27B] text-white",
        !active && variant === 'default' && "text-slate-300 hover:text-white hover:bg-white/10",
        !active && variant === 'danger' && "text-red-400 hover:text-red-300 hover:bg-red-500/20"
      )}
    >
      {icon}
    </button>
  );
}

export default FlowToolbar;
