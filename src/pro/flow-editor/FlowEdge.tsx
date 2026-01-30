/**
 * FlowEdge - Connection line between nodes with arrow
 */

import type { FlowConnection, KeyframeCapture } from '@/components/video-editor/types';
import { NODE_WIDTH, NODE_HEIGHT } from './FlowNode';
import { cn } from '@/lib/utils';

interface FlowEdgeProps {
  connection: FlowConnection;
  fromKeyframe: KeyframeCapture;
  toKeyframe: KeyframeCapture;
  isSelected: boolean;
  onClick: () => void;
}

export function FlowEdge({
  connection,
  fromKeyframe,
  toKeyframe,
  isSelected,
  onClick,
}: FlowEdgeProps) {
  const fromPos = fromKeyframe.flowPosition || { x: 0, y: 0 };
  const toPos = toKeyframe.flowPosition || { x: 0, y: 0 };

  // Calculate connection points (from right side to left side)
  const startX = fromPos.x + NODE_WIDTH;
  const startY = fromPos.y + NODE_HEIGHT / 2;
  const endX = toPos.x;
  const endY = toPos.y + NODE_HEIGHT / 2;

  // Calculate bezier control points for smooth curve
  const dx = endX - startX;
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 100);
  
  const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

  // Arrow head
  const arrowSize = 8;
  const angle = Math.atan2(endY - (endY), endX - (endX - controlOffset));
  
  const arrowPoints = [
    { x: endX, y: endY },
    { 
      x: endX - arrowSize * Math.cos(angle - Math.PI / 6), 
      y: endY - arrowSize * Math.sin(angle - Math.PI / 6) 
    },
    { 
      x: endX - arrowSize * Math.cos(angle + Math.PI / 6), 
      y: endY - arrowSize * Math.sin(angle + Math.PI / 6) 
    },
  ];

  const color = connection.style?.color || '#34B27B';
  const strokeWidth = connection.style?.strokeWidth || 2;

  return (
    <g className="cursor-pointer" onClick={onClick}>
      {/* Hit area (invisible, wider for easier clicking) */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      
      {/* Visible line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={connection.style?.dashed ? '5,5' : undefined}
        className={cn(
          "transition-all",
          isSelected && "filter drop-shadow-[0_0_4px_rgba(52,178,123,0.5)]"
        )}
      />

      {/* Arrow head */}
      <polygon
        points={arrowPoints.map(p => `${p.x},${p.y}`).join(' ')}
        fill={color}
        className={cn(
          "transition-all",
          isSelected && "filter drop-shadow-[0_0_4px_rgba(52,178,123,0.5)]"
        )}
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
  fromKeyframe: KeyframeCapture;
  endX: number;
  endY: number;
}

export function FlowEdgePreview({
  fromKeyframe,
  endX,
  endY,
}: FlowEdgePreviewProps) {
  const fromPos = fromKeyframe.flowPosition || { x: 0, y: 0 };

  const startX = fromPos.x + NODE_WIDTH;
  const startY = fromPos.y + NODE_HEIGHT / 2;

  const dx = endX - startX;
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 100);
  
  const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

  return (
    <path
      d={path}
      fill="none"
      stroke="#34B27B"
      strokeWidth={2}
      strokeDasharray="5,5"
      className="opacity-60"
    />
  );
}

export default FlowEdge;
