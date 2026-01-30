/**
 * KeyframePanel - UI for managing captured keyframes
 * 
 * Displays a list of keyframe thumbnails with options to:
 * - Extract keyframes from mouse clicks
 * - Add manual keyframes at current time
 * - Delete/edit keyframes
 * - Open flow graph editor
 */

import React, { useCallback, useRef } from 'react';
import { 
  Camera, 
  MousePointer2, 
  Trash2, 
  Edit2, 
  Layout,
  Download,
  Loader2,
  ImageIcon,
} from 'lucide-react';
import { useKeyframeStore } from './keyframeStore';
import { extractFrameAtTime, extractKeyframesFromClicks } from './keyframeExtractor';
import type { KeyframeCapture, MouseTrackData } from '@/components/video-editor/types';
import { cn } from '@/lib/utils';

// Generic type for objects with a video property
interface HasVideoElement {
  video: HTMLVideoElement | null;
}

interface KeyframePanelProps {
  /** Video element reference for frame extraction - can be direct HTMLVideoElement ref or any object with .video property */
  videoRef: React.RefObject<HasVideoElement | HTMLVideoElement | null>;
  /** Current playback time in ms */
  currentTimeMs: number;
  /** Mouse track data for auto-extraction */
  mouseTrackData?: MouseTrackData;
  /** Callback to seek video to time */
  onSeek?: (timeMs: number) => void;
  /** Callback to open flow editor */
  onOpenFlowEditor?: () => void;
  /** Callback to export keyframes */
  onExport?: () => void;
}

export function KeyframePanel({
  videoRef,
  currentTimeMs,
  mouseTrackData,
  onSeek,
  onOpenFlowEditor,
  onExport,
}: KeyframePanelProps) {
  const {
    flowGraph,
    isExtracting,
    extractionProgress,
    addKeyframe,
    addKeyframes,
    removeKeyframe,
    updateKeyframe,
    selectKeyframe,
    selectedKeyframeIds,
    setExtracting,
    setExtractionProgress,
    autoLayoutKeyframes,
  } = useKeyframeStore();

  const keyframes = flowGraph.keyframes;
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Helper to get video element from ref (handles both direct HTMLVideoElement and objects with .video property)
  const getVideoElement = useCallback((): HTMLVideoElement | null => {
    if (!videoRef.current) return null;
    
    // Check if it's an object with .video property (like VideoPlaybackRef)
    if (typeof videoRef.current === 'object' && 'video' in videoRef.current) {
      const video = (videoRef.current as HasVideoElement).video;
      if (video instanceof HTMLVideoElement) {
        return video;
      }
    }
    
    // Check if it's a direct HTMLVideoElement
    if (videoRef.current instanceof HTMLVideoElement) {
      return videoRef.current;
    }
    
    return null;
  }, [videoRef]);

  // Extract single keyframe at current time
  const handleExtractCurrent = useCallback(async () => {
    const video = getVideoElement();
    if (!video) return;

    setExtracting(true);
    try {
      const result = await extractFrameAtTime(video, currentTimeMs);
      if (result.success && result.keyframe) {
        addKeyframe({
          ...result.keyframe,
          source: 'manual',
          label: `手动截取 @ ${formatTime(currentTimeMs)}`,
        });
      }
    } finally {
      setExtracting(false);
    }
  }, [getVideoElement, currentTimeMs, addKeyframe, setExtracting]);

  // Extract all keyframes from mouse clicks
  const handleExtractFromClicks = useCallback(async () => {
    const video = getVideoElement();
    if (!video || !mouseTrackData) return;

    const clickCount = mouseTrackData.events.filter(e => e.type === 'click').length;
    if (clickCount === 0) {
      alert('没有检测到鼠标点击事件');
      return;
    }

    setExtracting(true);
    try {
      const result = await extractKeyframesFromClicks(
        video,
        mouseTrackData,
        {},
        (current, total) => setExtractionProgress({ current, total })
      );
      
      if (result.keyframes.length > 0) {
        addKeyframes(result.keyframes);
        autoLayoutKeyframes();
      }

      if (result.failed > 0) {
        console.warn(`${result.failed} keyframes failed to extract`);
      }
    } finally {
      setExtracting(false);
      setExtractionProgress(null);
    }
  }, [getVideoElement, mouseTrackData, addKeyframes, autoLayoutKeyframes, setExtracting, setExtractionProgress]);

  // Handle keyframe click
  const handleKeyframeClick = useCallback((keyframe: KeyframeCapture, event: React.MouseEvent) => {
    selectKeyframe(keyframe.id, event.metaKey || event.ctrlKey);
    onSeek?.(keyframe.timestampMs);
  }, [selectKeyframe, onSeek]);

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    removeKeyframe(id);
  }, [removeKeyframe]);

  // Handle edit label
  const handleEditLabel = useCallback((id: string) => {
    setEditingId(id);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const handleSaveLabel = useCallback((id: string, label: string) => {
    updateKeyframe(id, { label });
    setEditingId(null);
  }, [updateKeyframe]);

  const clickCount = mouseTrackData?.events.filter(e => e.type === 'click').length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-slate-200">关键帧</h3>
        <span className="text-xs text-slate-400">{keyframes.length} 帧</span>
      </div>

      {/* Actions */}
      <div className="p-3 space-y-2 border-b border-white/10">
        <button
          onClick={handleExtractCurrent}
          disabled={isExtracting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#34B27B] hover:bg-[#2ea36d] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isExtracting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          截取当前帧
        </button>

        <button
          onClick={handleExtractFromClicks}
          disabled={isExtracting || clickCount === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-medium rounded-lg transition-colors"
        >
          {isExtracting && extractionProgress ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {extractionProgress.current} / {extractionProgress.total}
            </>
          ) : (
            <>
              <MousePointer2 className="w-4 h-4" />
              从点击提取 ({clickCount})
            </>
          )}
        </button>
      </div>

      {/* Keyframe List */}
      <div className="flex-1 overflow-y-auto p-3">
        {keyframes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">暂无关键帧</p>
            <p className="text-xs mt-1">点击上方按钮开始截取</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keyframes
              .sort((a, b) => a.timestampMs - b.timestampMs)
              .map((keyframe) => (
                <KeyframeThumbnail
                  key={keyframe.id}
                  keyframe={keyframe}
                  isSelected={selectedKeyframeIds.includes(keyframe.id)}
                  isEditing={editingId === keyframe.id}
                  editInputRef={editInputRef}
                  onClick={handleKeyframeClick}
                  onDelete={handleDelete}
                  onEditLabel={handleEditLabel}
                  onSaveLabel={handleSaveLabel}
                />
              ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {keyframes.length > 0 && (
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={onOpenFlowEditor}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            <Layout className="w-4 h-4" />
            打开流程图
          </button>
          <button
            onClick={onExport}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出关键帧
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Individual keyframe thumbnail component
 */
interface KeyframeThumbnailProps {
  keyframe: KeyframeCapture;
  isSelected: boolean;
  isEditing: boolean;
  editInputRef: React.RefObject<HTMLInputElement>;
  onClick: (keyframe: KeyframeCapture, event: React.MouseEvent) => void;
  onDelete: (id: string) => void;
  onEditLabel: (id: string) => void;
  onSaveLabel: (id: string, label: string) => void;
}

function KeyframeThumbnail({
  keyframe,
  isSelected,
  isEditing,
  editInputRef,
  onClick,
  onDelete,
  onEditLabel,
  onSaveLabel,
}: KeyframeThumbnailProps) {
  const [labelValue, setLabelValue] = React.useState(keyframe.label || '');

  React.useEffect(() => {
    setLabelValue(keyframe.label || '');
  }, [keyframe.label]);

  return (
    <div
      onClick={(e) => onClick(keyframe, e)}
      className={cn(
        "group relative bg-white/5 rounded-lg overflow-hidden cursor-pointer transition-all",
        isSelected 
          ? "ring-2 ring-[#34B27B] bg-[#34B27B]/10" 
          : "hover:bg-white/10"
      )}
    >
      {/* Thumbnail Image */}
      <div className="aspect-video bg-black/50 relative">
        {keyframe.imageData ? (
          <img
            src={keyframe.imageData}
            alt={keyframe.label || 'Keyframe'}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="w-8 h-8 text-slate-600" />
          </div>
        )}
        
        {/* Source badge */}
        <div className="absolute top-1 left-1">
          <span className={cn(
            "px-1.5 py-0.5 text-[10px] font-medium rounded",
            keyframe.source === 'click' 
              ? "bg-blue-500/80 text-white" 
              : "bg-slate-500/80 text-white"
          )}>
            {keyframe.source === 'click' ? '点击' : '手动'}
          </span>
        </div>

        {/* Time badge */}
        <div className="absolute bottom-1 right-1">
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-black/70 text-white rounded">
            {formatTime(keyframe.timestampMs)}
          </span>
        </div>

        {/* Hover actions */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditLabel(keyframe.id);
            }}
            className="p-1 bg-black/70 hover:bg-black/90 rounded transition-colors"
          >
            <Edit2 className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(keyframe.id);
            }}
            className="p-1 bg-red-500/70 hover:bg-red-500/90 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>

      {/* Label */}
      <div className="p-2">
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={() => onSaveLabel(keyframe.id, labelValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSaveLabel(keyframe.id, labelValue);
              }
              if (e.key === 'Escape') {
                setLabelValue(keyframe.label || '');
                onSaveLabel(keyframe.id, keyframe.label || '');
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-slate-200 focus:outline-none focus:border-[#34B27B]"
          />
        ) : (
          <p className="text-xs text-slate-300 truncate">
            {keyframe.label || `关键帧 @ ${formatTime(keyframe.timestampMs)}`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Format milliseconds to mm:ss.ms
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

export default KeyframePanel;
