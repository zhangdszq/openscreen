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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowToolbarProps {
  zoom: number;
  hasSelection: boolean;
  keyframeCount: number;
  connectionCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  onResetView: () => void;
  onAutoLayout: () => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  onClose: () => void;
}

export function FlowToolbar({
  zoom,
  hasSelection,
  keyframeCount,
  connectionCount,
  onZoomIn,
  onZoomOut,
  onFitToView,
  onResetView,
  onAutoLayout,
  onDeleteSelected,
  onExport,
  onClose,
}: FlowToolbarProps) {
  return (
    <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50 pointer-events-auto">
      {/* Left section - title and stats */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-200">流程图编辑器</h2>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{keyframeCount} 关键帧</span>
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
  variant?: 'default' | 'danger';
}

function ToolbarButton({
  icon,
  onClick,
  title,
  disabled = false,
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
        variant === 'default' && "text-slate-300 hover:text-white hover:bg-white/10",
        variant === 'danger' && "text-red-400 hover:text-red-300 hover:bg-red-500/20"
      )}
    >
      {icon}
    </button>
  );
}

export default FlowToolbar;
