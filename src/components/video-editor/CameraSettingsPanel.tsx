/**
 * CameraSettingsPanel Component
 * 
 * A settings panel for camera overlay (picture-in-picture) with FocuSee-style UI.
 * Includes layout selection, background removal, border radius, and mirror options.
 */

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Camera, FlipHorizontal, User, Sparkles, Circle, Square } from "lucide-react";
import type { 
  CameraOverlay, 
  CameraOverlayShape,
  CameraBackgroundMode,
  CameraLayoutMode 
} from "./types";
import { CAMERA_LAYOUT_CONFIGS, getLayoutConfig } from "./types";

interface CameraSettingsPanelProps {
  overlay: CameraOverlay;
  onOverlayChange: (overlay: CameraOverlay) => void;
  cameraVideoPath: string | null;
}

// 背景模式选项
const BACKGROUND_MODES: { id: CameraBackgroundMode; label: string; icon: React.ReactNode }[] = [
  { id: 'original', label: '原始', icon: <Circle className="w-4 h-4" /> },
  { id: 'remove', label: '移除', icon: <User className="w-4 h-4" /> },
  { id: 'blur', label: '模糊', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'custom', label: '自定义', icon: <Square className="w-4 h-4" /> },
];

// 画中画布局图标组件
function PipLayoutIcon({ mode }: { mode: CameraLayoutMode }) {
  const positionStyles: Record<string, string> = {
    'pip-top-left': 'top-0.5 left-0.5',
    'pip-top-center': 'top-0.5 left-1/2 -translate-x-1/2',
    'pip-top-right': 'top-0.5 right-0.5',
    'pip-bottom-left': 'bottom-0.5 left-0.5',
    'pip-bottom-center': 'bottom-0.5 left-1/2 -translate-x-1/2',
    'pip-bottom-right': 'bottom-0.5 right-0.5',
  };

  return (
    <div className="relative w-10 h-6 bg-slate-600 rounded-sm border border-white/20 overflow-hidden">
      {/* 屏幕区域 */}
      <div className="absolute inset-0.5 bg-blue-500/30 rounded-[1px]" />
      {/* 摄像头位置 */}
      <div className={cn(
        "absolute w-2.5 h-2.5 bg-emerald-400 rounded-full border border-emerald-300",
        positionStyles[mode]
      )} />
    </div>
  );
}

// 分屏布局图标组件
function SplitLayoutIcon({ mode }: { mode: CameraLayoutMode }) {
  const isHorizontal = mode === 'split-left' || mode === 'split-right';
  const cameraFirst = mode === 'split-left' || mode === 'split-top';

  // 左右分屏 - 宽矩形图标
  if (isHorizontal) {
    return (
      <div className="relative w-10 h-6 bg-slate-700 rounded-sm border border-white/20 overflow-hidden flex">
        <div className={cn(
          "h-full rounded-[1px]",
          cameraFirst ? "w-[35%] bg-emerald-400/60" : "w-[65%] bg-blue-500/30"
        )} />
        <div className={cn(
          "h-full rounded-[1px]",
          cameraFirst ? "w-[65%] bg-blue-500/30" : "w-[35%] bg-emerald-400/60"
        )} />
      </div>
    );
  }

  // 上下分屏 - 长矩形图标（高 > 宽）
  return (
    <div className="relative w-6 h-10 bg-slate-700 rounded-sm border border-white/20 overflow-hidden flex flex-col">
      <div className={cn(
        "w-full rounded-[1px]",
        cameraFirst ? "h-[35%] bg-emerald-400/60" : "h-[65%] bg-blue-500/30"
      )} />
      <div className={cn(
        "w-full rounded-[1px]",
        cameraFirst ? "h-[65%] bg-blue-500/30" : "h-[35%] bg-emerald-400/60"
      )} />
    </div>
  );
}

export function CameraSettingsPanel({
  overlay,
  onOverlayChange,
  cameraVideoPath,
}: CameraSettingsPanelProps) {
  const hasCameraVideo = Boolean(cameraVideoPath);

  const handleToggleEnabled = (enabled: boolean) => {
    onOverlayChange({
      ...overlay,
      enabled,
      videoPath: enabled ? (cameraVideoPath || '') : overlay.videoPath,
    });
  };

  const handleLayoutModeChange = (mode: CameraLayoutMode) => {
    const config = getLayoutConfig(mode);
    const updates: Partial<CameraOverlay> = {
      layoutMode: mode,
    };
    
    // Update position for PiP modes
    if (config.pipPosition) {
      updates.position = config.pipPosition;
    }
    
    // Update split ratio for split modes
    if (config.splitRatio !== undefined) {
      updates.splitRatio = config.splitRatio;
    }
    
    // 分屏模式必须使用矩形形状
    if (mode.startsWith('split-')) {
      updates.shape = 'rectangle';
    }
    
    onOverlayChange({
      ...overlay,
      ...updates,
    });
  };

  const handleShapeChange = (shape: CameraOverlayShape) => {
    onOverlayChange({
      ...overlay,
      shape,
    });
  };

  const handleBackgroundModeChange = (mode: CameraBackgroundMode) => {
    onOverlayChange({
      ...overlay,
      backgroundMode: mode,
    });
  };

  const handleBorderRadiusChange = (value: number[]) => {
    onOverlayChange({
      ...overlay,
      borderRadius: value[0],
    });
  };

  const handleMirrorChange = (mirror: boolean) => {
    onOverlayChange({
      ...overlay,
      mirror,
    });
  };

  const handleSizeChange = (value: number[]) => {
    onOverlayChange({
      ...overlay,
      size: value[0],
    });
  };

  const handleSplitRatioChange = (value: number[]) => {
    onOverlayChange({
      ...overlay,
      splitRatio: value[0],
    });
  };

  const handleCameraScaleChange = (value: number[]) => {
    onOverlayChange({
      ...overlay,
      cameraScale: value[0],
    });
  };

  const handleScreenScaleChange = (value: number[]) => {
    onOverlayChange({
      ...overlay,
      screenScale: value[0],
    });
  };

  const currentLayoutConfig = getLayoutConfig(overlay.layoutMode);
  const isPipMode = !currentLayoutConfig.isSplit;
  const pipLayouts = CAMERA_LAYOUT_CONFIGS.filter(c => !c.isSplit);
  const splitLayouts = CAMERA_LAYOUT_CONFIGS.filter(c => c.isSplit);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]/95 backdrop-blur-xl">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white/90">摄像头</span>
          </div>
          <Switch
            checked={overlay.enabled && hasCameraVideo}
            onCheckedChange={handleToggleEnabled}
            disabled={!hasCameraVideo}
            className="data-[state=checked]:bg-emerald-500"
          />
        </div>
        {!hasCameraVideo && (
          <p className="text-[10px] text-white/40 mt-1.5">
            没有找到摄像头录制文件
          </p>
        )}
      </div>

      {/* 设置内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {/* 形象选择 */}
        <div>
          <h3 className="text-xs text-white/50 mb-2 font-medium">选择形象</h3>
          <div className="flex gap-3">
            {/* 真实头像 */}
            <button
              onClick={() => handleShapeChange('circle')}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-all border-2",
                overlay.shape === 'circle'
                  ? "border-emerald-400 bg-emerald-500/20"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <User className="w-6 h-6 text-white/70" />
            </button>
            {/* AI 形象（占位） */}
            <button
              className="w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 border-2 border-white/10 bg-white/5 hover:border-white/20 transition-all"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-[9px] text-purple-400">AI 形象</span>
            </button>
          </div>
        </div>

        {/* 摄像头布局 */}
        <div>
          <h3 className="text-xs text-white/50 mb-2 font-medium">摄像头布局</h3>
          
          {/* 画中画布局 */}
          <p className="text-[10px] text-white/30 mb-1.5">画中画</p>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {pipLayouts.map((config) => (
              <button
                key={config.mode}
                onClick={() => handleLayoutModeChange(config.mode)}
                disabled={!overlay.enabled}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg transition-all border",
                  overlay.layoutMode === config.mode && overlay.enabled
                    ? "border-emerald-400/50 bg-emerald-500/10"
                    : "border-white/5 bg-white/5 hover:bg-white/10",
                  !overlay.enabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <PipLayoutIcon mode={config.mode} />
              </button>
            ))}
          </div>

          {/* 分屏布局 */}
          <p className="text-[10px] text-white/30 mb-1.5">分屏</p>
          <div className="grid grid-cols-4 gap-1.5">
            {splitLayouts.map((config) => (
              <button
                key={config.mode}
                onClick={() => handleLayoutModeChange(config.mode)}
                disabled={!overlay.enabled}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg transition-all border",
                  overlay.layoutMode === config.mode && overlay.enabled
                    ? "border-emerald-400/50 bg-emerald-500/10"
                    : "border-white/5 bg-white/5 hover:bg-white/10",
                  !overlay.enabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <SplitLayoutIcon mode={config.mode} />
              </button>
            ))}
          </div>
          
          {/* 水平翻转按钮 */}
          <button
            onClick={() => handleMirrorChange(!overlay.mirror)}
            disabled={!overlay.enabled}
            className={cn(
              "w-full mt-3 py-2.5 rounded-lg transition-all border text-xs flex items-center justify-center gap-2",
              overlay.mirror && overlay.enabled
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                : "border-white/5 bg-white/5 text-white/60 hover:bg-white/10",
              !overlay.enabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <FlipHorizontal className="w-4 h-4" />
            水平翻转
          </button>
        </div>

        {/* 形状选择 */}
        <div>
          <h3 className="text-xs text-white/50 mb-2 font-medium">形状</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleShapeChange('circle')}
              disabled={!overlay.enabled}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all border text-xs",
                overlay.shape === 'circle' && overlay.enabled
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 bg-white/5 text-white/60 hover:bg-white/10",
                !overlay.enabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Circle className="w-3.5 h-3.5" />
              圆形
            </button>
            <button
              onClick={() => handleShapeChange('rectangle')}
              disabled={!overlay.enabled}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all border text-xs",
                overlay.shape === 'rectangle' && overlay.enabled
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 bg-white/5 text-white/60 hover:bg-white/10",
                !overlay.enabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Square className="w-3.5 h-3.5" />
              矩形
            </button>
          </div>
        </div>

        {/* 移除背景 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="text-xs text-white/50 font-medium">移除背景</h3>
            <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-400 rounded font-medium">
              AI
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BACKGROUND_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleBackgroundModeChange(mode.id)}
                disabled={!overlay.enabled}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 rounded-lg transition-all border text-[10px]",
                  overlay.backgroundMode === mode.id && overlay.enabled
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                    : "border-white/5 bg-white/5 text-white/50 hover:bg-white/10",
                  !overlay.enabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            为获得最佳效果，建议使用纯色、简洁的背景，并确保人像与背景对比清晰。
          </p>
        </div>

        {/* 大小控制 - 仅画中画模式显示滑块 */}
        {isPipMode && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs text-white/50 font-medium">大小</h3>
              <span className="text-[10px] text-white/40 font-mono">{overlay.size}%</span>
            </div>
            <Slider
              value={[overlay.size]}
              onValueChange={handleSizeChange}
              min={5}
              max={40}
              step={1}
              disabled={!overlay.enabled}
              className={cn(
                "w-full [&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-400 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3",
                !overlay.enabled && "opacity-50"
              )}
            />
          </div>
        )}
        
        {/* 分屏模式提示 */}
        {!isPipMode && (
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-white/40 leading-relaxed">
              拖拽右下角手柄可调整摄像头和录屏的大小，拖拽画面可移动位置。
            </p>
          </div>
        )}

        {/* 圆角 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs text-white/50 font-medium">圆角</h3>
            <span className="text-[10px] text-white/40 font-mono">{overlay.borderRadius}</span>
          </div>
          <Slider
            value={[overlay.borderRadius]}
            onValueChange={handleBorderRadiusChange}
            min={0}
            max={50}
            step={1}
            disabled={!overlay.enabled || overlay.shape === 'circle'}
            className={cn(
              "w-full [&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-400 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3",
              (!overlay.enabled || overlay.shape === 'circle') && "opacity-50"
            )}
          />
        </div>

        {/* 边框样式 */}
        <div>
          <h3 className="text-xs text-white/50 mb-2 font-medium">边框样式</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onOverlayChange({ ...overlay, borderStyle: 'none' })}
              disabled={!overlay.enabled}
              className={cn(
                "py-2 rounded-lg transition-all border text-[10px]",
                overlay.borderStyle === 'none' && overlay.enabled
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 bg-white/5 text-white/50 hover:bg-white/10",
                !overlay.enabled && "opacity-50 cursor-not-allowed"
              )}
            >
              无边框
            </button>
            <button
              onClick={() => onOverlayChange({ ...overlay, borderStyle: 'white' })}
              disabled={!overlay.enabled}
              className={cn(
                "py-2 rounded-lg transition-all border text-[10px]",
                overlay.borderStyle === 'white' && overlay.enabled
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 bg-white/5 text-white/50 hover:bg-white/10",
                !overlay.enabled && "opacity-50 cursor-not-allowed"
              )}
            >
              白色边框
            </button>
            <button
              onClick={() => onOverlayChange({ ...overlay, borderStyle: 'shadow' })}
              disabled={!overlay.enabled}
              className={cn(
                "py-2 rounded-lg transition-all border text-[10px]",
                overlay.borderStyle === 'shadow' && overlay.enabled
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 bg-white/5 text-white/50 hover:bg-white/10",
                !overlay.enabled && "opacity-50 cursor-not-allowed"
              )}
            >
              阴影
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CameraSettingsPanel;
