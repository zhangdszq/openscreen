/**
 * FlowEditor - Main flow graph editor component
 * 
 * A canvas-based editor for creating and editing flow graphs
 * that visualize the relationships between captured keyframes.
 */

import { useCallback, useEffect } from 'react';
import { useKeyframeStore } from '@/pro/keyframe';
import { useFlowEditor } from './useFlowEditor';
import { FlowNode } from './FlowNode';
import { FlowEdge, FlowEdgePreview } from './FlowEdge';
import { FlowToolbar } from './FlowToolbar';

interface FlowEditorProps {
  /** Callback when editor is closed */
  onClose: () => void;
  /** Callback to export the flow graph */
  onExport?: () => void;
}

export function FlowEditor({ onClose, onExport }: FlowEditorProps) {
  const {
    flowGraph,
    selectedKeyframeIds,
    selectedConnectionIds,
    selectKeyframe,
    selectConnection,
    clearSelection,
    addConnection,
    removeKeyframe,
    removeConnection,
    updateKeyframe,
    updateKeyframePosition,
    autoLayoutKeyframes,
  } = useKeyframeStore();

  const {
    containerRef,
    viewport,
    drag,
    hoveredNodeId,
    connectionPreview,
    setHoveredNodeId,
    handleWheel,
    startCanvasDrag,
    startNodeDrag,
    startConnection,
    handleMouseMove,
    handleMouseUp,
    resetViewport,
    fitToView,
  } = useFlowEditor();

  const keyframes = flowGraph.keyframes;
  const connections = flowGraph.connections;

  // Handle node position change
  const handleNodeMove = useCallback((nodeId: string, deltaX: number, deltaY: number) => {
    const keyframe = keyframes.find(kf => kf.id === nodeId);
    if (keyframe) {
      const currentPos = keyframe.flowPosition || { x: 0, y: 0 };
      updateKeyframePosition(nodeId, currentPos.x + deltaX, currentPos.y + deltaY);
    }
  }, [keyframes, updateKeyframePosition]);

  // Handle connection creation
  const handleConnectionCreate = useCallback((from: string, to: string) => {
    addConnection(from, to);
  }, [addConnection]);

  // Handle label change from sticky note
  const handleLabelChange = useCallback((id: string, label: string) => {
    updateKeyframe(id, { label });
  }, [updateKeyframe]);

  // Handle delete selected
  const handleDeleteSelected = useCallback(() => {
    selectedKeyframeIds.forEach(id => removeKeyframe(id));
    selectedConnectionIds.forEach(id => removeConnection(id));
    clearSelection();
  }, [selectedKeyframeIds, selectedConnectionIds, removeKeyframe, removeConnection, clearSelection]);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(2, viewport.zoom * 1.2);
    // Zoom towards center
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const scaleFactor = newZoom / viewport.zoom;
      const newX = centerX - (centerX - viewport.x) * scaleFactor;
      const newY = centerY - (centerY - viewport.y) * scaleFactor;
      containerRef.current?.dispatchEvent(new CustomEvent('viewport-change', {
        detail: { x: newX, y: newY, zoom: newZoom }
      }));
    }
  }, [viewport, containerRef]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.25, viewport.zoom / 1.2);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const scaleFactor = newZoom / viewport.zoom;
      const newX = centerX - (centerX - viewport.x) * scaleFactor;
      const newY = centerY - (centerY - viewport.y) * scaleFactor;
      containerRef.current?.dispatchEvent(new CustomEvent('viewport-change', {
        detail: { x: newX, y: newY, zoom: newZoom }
      }));
    }
  }, [viewport, containerRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedKeyframeIds.length > 0 || selectedConnectionIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeyframeIds, selectedConnectionIds, handleDeleteSelected, clearSelection]);

  // Fit to view on initial render
  useEffect(() => {
    if (keyframes.length > 0) {
      setTimeout(() => fitToView(keyframes), 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSelection = selectedKeyframeIds.length > 0 || selectedConnectionIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col">
      {/* Toolbar */}
      <FlowToolbar
        zoom={viewport.zoom}
        hasSelection={hasSelection}
        keyframeCount={keyframes.length}
        connectionCount={connections.length}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToView={() => fitToView(keyframes)}
        onResetView={resetViewport}
        onAutoLayout={autoLayoutKeyframes}
        onDeleteSelected={handleDeleteSelected}
        onExport={() => {
          console.log('[FlowEditor] Export clicked');
          onExport?.();
        }}
        onClose={() => {
          console.log('[FlowEditor] Close clicked');
          onClose();
        }}
      />

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative mt-16"
        onWheel={handleWheel}
        onMouseDown={(e) => {
          // Only handle canvas background clicks
          const target = e.target as HTMLElement;
          if (target === e.currentTarget || target.closest('[data-canvas-bg]')) {
            clearSelection();
            startCanvasDrag(e);
          }
        }}
        onMouseMove={(e) => handleMouseMove(e, handleNodeMove)}
        onMouseUp={() => handleMouseUp(hoveredNodeId || undefined, handleConnectionCreate)}
        onMouseLeave={() => handleMouseUp(undefined, handleConnectionCreate)}
      >
        {/* Grid background */}
        <div
          data-canvas-bg
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
        />

        {/* Transformed content */}
        <div
          className="absolute"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Edges SVG layer */}
          <svg
            className="absolute pointer-events-none"
            style={{
              width: 10000,
              height: 10000,
              left: -5000,
              top: -5000,
              overflow: 'visible',
            }}
          >
            <g transform="translate(5000, 5000)">
              {/* Render connections */}
              {connections.map(conn => {
                const fromKf = keyframes.find(kf => kf.id === conn.from);
                const toKf = keyframes.find(kf => kf.id === conn.to);
                if (!fromKf || !toKf) return null;

                return (
                  <FlowEdge
                    key={conn.id}
                    connection={conn}
                    fromKeyframe={fromKf}
                    toKeyframe={toKf}
                    isSelected={selectedConnectionIds.includes(conn.id)}
                    onClick={() => selectConnection(conn.id)}
                  />
                );
              })}

              {/* Connection preview */}
              {connectionPreview && (
                <FlowEdgePreview
                  fromKeyframe={keyframes.find(kf => kf.id === connectionPreview.startId)!}
                  endX={connectionPreview.endX}
                  endY={connectionPreview.endY}
                />
              )}
            </g>
          </svg>

          {/* Nodes layer */}
          {keyframes.map(keyframe => (
            <FlowNode
              key={keyframe.id}
              keyframe={keyframe}
              isSelected={selectedKeyframeIds.includes(keyframe.id)}
              isHovered={hoveredNodeId === keyframe.id}
              onMouseDown={(e) => {
                selectKeyframe(keyframe.id, e.metaKey || e.ctrlKey);
                startNodeDrag(e, keyframe.id);
              }}
              onMouseEnter={() => setHoveredNodeId(keyframe.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              onConnectionStart={(e) => startConnection(e, keyframe.id)}
              onMouseUp={() => {
                if (drag.dragType === 'connection') {
                  handleMouseUp(keyframe.id, handleConnectionCreate);
                }
              }}
              onLabelChange={handleLabelChange}
            />
          ))}
        </div>

        {/* Empty state */}
        {keyframes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <p className="text-lg mb-2">暂无关键帧</p>
              <p className="text-sm">请先在视频编辑器中提取关键帧</p>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="absolute bottom-4 left-4 text-xs text-slate-500">
        <span>拖拽节点移动 • 从节点右侧拖出创建连接 • 滚轮缩放 • Delete 删除选中</span>
      </div>
    </div>
  );
}

export default FlowEditor;
