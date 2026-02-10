/**
 * CursorSettingsPanel Component
 * 
 * Settings panel for cursor/mouse visualization effects.
 * Includes mouse click ripple effect toggle and settings.
 */

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { MousePointer2, Waves } from "lucide-react";

export interface CursorSettings {
  /** Whether click ripple effect is enabled */
  clickRippleEnabled: boolean;
  /** Ripple color (CSS color string) */
  rippleColor: string;
  /** Ripple scale size (1-3) */
  rippleScale: number;
}

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = {
  clickRippleEnabled: false,
  rippleColor: '#34B27B',
  rippleScale: 1.5,
};

interface CursorSettingsPanelProps {
  settings: CursorSettings;
  onSettingsChange: (settings: CursorSettings) => void;
  clickCount?: number;
}

const COLOR_PRESETS = [
  { color: '#34B27B', label: '绿色' },
  { color: '#3B82F6', label: '蓝色' },
  { color: '#F59E0B', label: '橙色' },
  { color: '#EF4444', label: '红色' },
  { color: '#A855F7', label: '紫色' },
  { color: '#FFFFFF', label: '白色' },
];

export function CursorSettingsPanel({
  settings,
  onSettingsChange,
  clickCount = 0,
}: CursorSettingsPanelProps) {
  const updateSettings = (partial: Partial<CursorSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <MousePointer2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-white">光标设置</h3>
        </div>

        {/* 鼠标光波效果 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-white/40" />
              <span className="text-xs text-white/70">鼠标点击光波</span>
            </div>
            <Switch
              checked={settings.clickRippleEnabled}
              onCheckedChange={(checked) => updateSettings({ clickRippleEnabled: checked })}
            />
          </div>

          {settings.clickRippleEnabled && (
            <div className="space-y-4 pl-6 border-l border-white/10">
              {/* 点击次数信息 */}
              <div className="text-xs text-white/40">
                已记录 <span className="text-emerald-400 font-medium">{clickCount}</span> 次鼠标点击
              </div>

              {/* 光波颜色 */}
              <div className="space-y-2">
                <span className="text-xs text-white/50">光波颜色</span>
                <div className="flex gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => updateSettings({ rippleColor: preset.color })}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        settings.rippleColor === preset.color
                          ? 'border-white scale-110'
                          : 'border-transparent hover:border-white/30'
                      }`}
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                    />
                  ))}
                </div>
              </div>

              {/* 光波大小 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">光波大小</span>
                  <span className="text-xs text-white/30">{settings.rippleScale.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[settings.rippleScale]}
                  onValueChange={([val]) => updateSettings({ rippleScale: val })}
                  min={0.5}
                  max={3}
                  step={0.1}
                  className="w-full"
                />
              </div>

              {/* 效果预览 */}
              <div className="flex items-center justify-center py-3">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  {/* 外圈 */}
                  <div
                    className="absolute rounded-full animate-ping"
                    style={{
                      width: 40 * settings.rippleScale,
                      height: 40 * settings.rippleScale,
                      backgroundColor: `${settings.rippleColor}20`,
                      border: `2px solid ${settings.rippleColor}40`,
                    }}
                  />
                  {/* 中圈 */}
                  <div
                    className="absolute rounded-full animate-pulse"
                    style={{
                      width: 24 * settings.rippleScale,
                      height: 24 * settings.rippleScale,
                      backgroundColor: `${settings.rippleColor}30`,
                    }}
                  />
                  {/* 中心点 */}
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: settings.rippleColor }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
