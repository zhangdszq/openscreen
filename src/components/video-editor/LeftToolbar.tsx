/**
 * LeftToolbar Component
 * 
 * A vertical toolbar on the left side of the video editor with FocuSee-style UI.
 * Contains tool buttons that expand into settings panels.
 * The panel pushes the canvas instead of overlaying it.
 */

import { cn } from "@/lib/utils";
import { 
  Camera, 
  Mic, 
  MousePointer2, 
  Shapes, 
  Type, 
  Wand2,
  ChevronLeft
} from "lucide-react";
import { CameraSettingsPanel } from "./CameraSettingsPanel";
import type { CameraOverlay } from "./types";

interface LeftToolbarProps {
  cameraOverlay: CameraOverlay;
  onCameraOverlayChange: (overlay: CameraOverlay) => void;
  cameraVideoPath: string | null;
}

export type ActivePanel = 'camera' | 'microphone' | 'cursor' | 'shapes' | 'text' | 'effects' | null;

// 工具按钮配置
const TOOLS: { id: ActivePanel; icon: React.ReactNode; label: string; available: boolean }[] = [
  { id: 'camera', icon: <Camera className="w-5 h-5" />, label: '摄像头', available: true },
  { id: 'microphone', icon: <Mic className="w-5 h-5" />, label: '麦克风', available: false },
  { id: 'cursor', icon: <MousePointer2 className="w-5 h-5" />, label: '光标', available: false },
  { id: 'shapes', icon: <Shapes className="w-5 h-5" />, label: '形状', available: false },
  { id: 'text', icon: <Type className="w-5 h-5" />, label: '文字', available: false },
  { id: 'effects', icon: <Wand2 className="w-5 h-5" />, label: '效果', available: false },
];

export function LeftToolbar({
  cameraOverlay,
  onCameraOverlayChange,
  cameraVideoPath,
  activePanel,
  onActivePanelChange,
}: LeftToolbarProps & {
  activePanel: ActivePanel;
  onActivePanelChange: (panel: ActivePanel) => void;
}) {
  const handleToolClick = (toolId: ActivePanel) => {
    if (activePanel === toolId) {
      onActivePanelChange(null);
    } else {
      onActivePanelChange(toolId);
    }
  };

  const isPanelOpen = activePanel !== null;

  return (
    <div className="flex h-full flex-shrink-0">
      {/* 工具栏 */}
      <div 
        data-toolbar="left"
        className="w-14 flex-shrink-0 bg-[#0d0d0f]/80 backdrop-blur-xl border-r border-white/5 flex flex-col items-center py-3 gap-1"
      >
        {TOOLS.map((tool) => {
          const isActive = activePanel === tool.id;
          const isEnabled = tool.available;
          
          return (
            <button
              key={tool.id}
              onClick={() => isEnabled && handleToolClick(tool.id)}
              disabled={!isEnabled}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                isActive && isEnabled
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                  : isEnabled
                    ? "text-white/40 hover:text-white/80 hover:bg-white/10"
                    : "text-white/20 cursor-not-allowed"
              )}
              title={tool.label}
            >
              {tool.icon}
              
              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-black/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {tool.label}
                {!isEnabled && <span className="text-white/40 ml-1">(即将推出)</span>}
              </div>
              
              {/* 激活指示器 */}
              {isActive && (
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-4 bg-emerald-400 rounded-l" />
              )}
            </button>
          );
        })}
      </div>

      {/* 展开的设置面板 - 使用正常流布局挤压画布 */}
      <div
        className={cn(
          "h-full bg-[#0d0d0f]/95 backdrop-blur-xl border-r border-white/5 transition-all duration-300 ease-out overflow-hidden flex-shrink-0",
          isPanelOpen 
            ? "w-64 opacity-100" 
            : "w-0 opacity-0"
        )}
      >
        <div className="w-64 h-full relative">
          {/* 面板头部关闭按钮 */}
          <button
            onClick={() => onActivePanelChange(null)}
            className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-all z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* 摄像头设置面板 */}
          {activePanel === 'camera' && (
            <CameraSettingsPanel
              overlay={cameraOverlay}
              onOverlayChange={onCameraOverlayChange}
              cameraVideoPath={cameraVideoPath}
            />
          )}

          {/* 其他面板占位 */}
          {activePanel && activePanel !== 'camera' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-6">
                <Wand2 className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-sm text-white/40">即将推出</p>
                <p className="text-xs text-white/20 mt-1">此功能正在开发中</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeftToolbar;
