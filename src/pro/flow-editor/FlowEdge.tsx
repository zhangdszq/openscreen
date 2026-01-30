/**
 * FlowEdge - Connection line between nodes (keyframes or regions) with arrow
 */

import type { FlowConnection, KeyframeCapture, FlowRegion } from '@/components/video-editor/types';
import { NODE_WIDTH, NODE_HEIGHT } from './FlowNode';

interface FlowEdgeProps {
  connection: FlowConnection;
  fromKeyframe?: KeyframeCapture;
  fromRegion?: FlowRegion;
  toKeyframe?: KeyframeCapture;
  toRegion?: FlowRegion;
  isSelected: boolean;
  zoom: number;
  onClick: () => void;
}

/**
 * Get the position and size of a node (keyframe or region)
 */
function getNodeBounds(keyframe?: KeyframeCapture, region?: FlowRegion): { x: number; y: number; width: number; height: number } | null {
  if (keyframe) {
    const pos = keyframe.flowPosition || { x: 0, y: 0 };
    return { x: pos.x, y: pos.y, width: NODE_WIDTH, height: NODE_HEIGHT };
  }
  if (region) {
    return { 
      x: region.position.x, 
      y: region.position.y, 
      width: region.size.width, 
      height: region.size.height 
    };
  }
  return null;
}

export function FlowEdge({
  connection,
  fromKeyframe,
  fromRegion,
  toKeyframe,
  toRegion,
  isSelected,
  zoom,
  onClick,
}: FlowEdgeProps) {
  const fromBounds = getNodeBounds(fromKeyframe, fromRegion);
  const toBounds = getNodeBounds(toKeyframe, toRegion);

  if (!fromBounds || !toBounds) return null;

  // Calculate connection points (from right side to left side)
  const startX = fromBounds.x + fromBounds.width;
  const startY = fromBounds.y + fromBounds.height / 2;
  const endX = toBounds.x;
  const endY = toBounds.y + toBounds.height / 2;

  // Calculate bezier control points for smooth curve
  const dx = endX - startX;
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 100);
  
  const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

  // Arrow head - Figma style: visual size stays constant regardless of zoom
  const arrowSize = 8 / zoom;
  const angle = Math.atan2(endY - (endY), endX - (endX - controlOffset));

  const baseColor = connection.style?.color || '#34B27B';
  const color = isSelected ? '#34B27B' : baseColor;
  
  // Figma style: stroke width stays visually constant regardless of zoom
  const baseStrokeWidth = connection.style?.strokeWidth || 2;
  const visualStrokeWidth = isSelected ? baseStrokeWidth + 1 : baseStrokeWidth;
  const strokeWidth = visualStrokeWidth / zoom;

  // Arrow size scales with selection but stays visually constant with zoom
  const selectedArrowSize = isSelected ? arrowSize * 1.2 : arrowSize;
  const selectedArrowPoints = [
    { x: endX, y: endY },
    { 
      x: endX - selectedArrowSize * Math.cos(angle - Math.PI / 6), 
      y: endY - selectedArrowSize * Math.sin(angle - Math.PI / 6) 
    },
    { 
      x: endX - selectedArrowSize * Math.cos(angle + Math.PI / 6), 
      y: endY - selectedArrowSize * Math.sin(angle + Math.PI / 6) 
    },
  ];

  // Hit area and dash pattern scale with zoom
  const hitAreaWidth = 20 / zoom;
  const dashArray = connection.style?.dashed ? `${5 / zoom},${5 / zoom}` : undefined;

  return (
    <g 
      className="cursor-pointer" 
      onClick={onClick}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Hit area (invisible, wider for easier clicking) */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={hitAreaWidth}
        style={{ pointerEvents: 'stroke' }}
      />
      
      {/* Visible line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        className="transition-all"
      />

      {/* Arrow head */}
      <polygon
        points={selectedArrowPoints.map(p => `${p.x},${p.y}`).join(' ')}
        fill={color}
        className="transition-all"
      />

      {/* Label */}
      {connection.label && (
        <text
          x={(startX + endX) / 2}
          y={(startY + endY) / 2 - 8}
          textAnchor="middle"
          className="text-[10px] fill-slate-400 pointer-events-none"
        >
          {connection.label}
        </text>
      )}
    </g>
  );
}

/**
 * Preview edge while creating connection
 */
interface FlowEdgePreviewProps {
  fromKeyframe?: KeyframeCapture;
  fromRegion?: FlowRegion;
  endX: number;
  endY: number;
  zoom: number;
}

export function FlowEdgePreview({
  fromKeyframe,
  fromRegion,
  endX,
  endY,
  zoom,
}: FlowEdgePreviewProps) {
  const fromBounds = getNodeBounds(fromKeyframe, fromRegion);
  if (!fromBounds) return null;

  const startX = fromBounds.x + fromBounds.width;
  const startY = fromBounds.y + fromBounds.height / 2;

  const dx = endX - startX;
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 100);
  
  const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

  // Figma style: visual stroke width stays constant
  const strokeWidth = 2 / zoom;
  const dashArray = `${5 / zoom},${5 / zoom}`;

  return (
    <path
      d={path}
      fill="none"
      stroke="#34B27B"
      strokeWidth={strokeWidth}
      strokeDasharray={dashArray}
      className="opacity-60"
    />
  );
}

export default FlowEdge;
