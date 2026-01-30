/**
 * Feature Flag System for OpenScreen
 * 
 * This module provides a centralized way to manage feature availability,
 * designed to support future Pro tier features while keeping development simple.
 */

// Development mode - set to false for production release with Pro restrictions
const DEV_MODE = true;

/**
 * Feature identifiers
 */
export enum Feature {
  // Core features (always free)
  SCREEN_RECORDING = 'screen_recording',
  VIDEO_EDITING = 'video_editing',
  MOUSE_TRACKING = 'mouse_tracking',
  BASIC_EXPORT = 'basic_export',
  
  // Pro features
  PRO_KEYFRAME_EXTRACT = 'pro_keyframe_extract',
  PRO_FLOW_EDITOR = 'pro_flow_editor',
  PRO_FIGMA_EXPORT = 'pro_figma_export',
  PRO_MCP_BROWSER = 'pro_mcp_browser',
}

/**
 * Feature tier classification
 */
export type FeatureTier = 'free' | 'pro';

/**
 * Feature configuration
 */
export interface FeatureConfig {
  id: Feature;
  name: string;
  description: string;
  tier: FeatureTier;
  enabled: boolean;
}

/**
 * Feature configurations registry
 */
const featureConfigs: Record<Feature, FeatureConfig> = {
  // Free features
  [Feature.SCREEN_RECORDING]: {
    id: Feature.SCREEN_RECORDING,
    name: '屏幕录制',
    description: '录制屏幕、窗口或区域',
    tier: 'free',
    enabled: true,
  },
  [Feature.VIDEO_EDITING]: {
    id: Feature.VIDEO_EDITING,
    name: '视频编辑',
    description: '时间轴编辑、缩放、裁剪',
    tier: 'free',
    enabled: true,
  },
  [Feature.MOUSE_TRACKING]: {
    id: Feature.MOUSE_TRACKING,
    name: '鼠标追踪',
    description: '记录鼠标点击用于自动缩放',
    tier: 'free',
    enabled: true,
  },
  [Feature.BASIC_EXPORT]: {
    id: Feature.BASIC_EXPORT,
    name: '基础导出',
    description: '导出为 MP4 或 GIF',
    tier: 'free',
    enabled: true,
  },
  
  // Pro features
  [Feature.PRO_KEYFRAME_EXTRACT]: {
    id: Feature.PRO_KEYFRAME_EXTRACT,
    name: '关键帧提取',
    description: '从点击事件自动提取关键帧截图',
    tier: 'pro',
    enabled: true,
  },
  [Feature.PRO_FLOW_EDITOR]: {
    id: Feature.PRO_FLOW_EDITOR,
    name: '流程图编辑',
    description: '创建页面流程图，用箭头关联关键帧',
    tier: 'pro',
    enabled: true,
  },
  [Feature.PRO_FIGMA_EXPORT]: {
    id: Feature.PRO_FIGMA_EXPORT,
    name: 'Figma 导出',
    description: '导出关键帧和流程图到 Figma',
    tier: 'pro',
    enabled: true,
  },
  [Feature.PRO_MCP_BROWSER]: {
    id: Feature.PRO_MCP_BROWSER,
    name: 'MCP 浏览器集成',
    description: '通过 MCP 自动化录制浏览器操作',
    tier: 'pro',
    enabled: true,
  },
};

/**
 * Check if a feature is enabled
 * In DEV_MODE, all features are enabled for easier development
 */
export function isFeatureEnabled(feature: Feature): boolean {
  if (DEV_MODE) {
    return true;
  }
  
  const config = featureConfigs[feature];
  if (!config) {
    console.warn(`Unknown feature: ${feature}`);
    return false;
  }
  
  // Free features are always enabled
  if (config.tier === 'free') {
    return config.enabled;
  }
  
  // Pro features require license check (to be implemented)
  // For now, use the config.enabled flag
  return config.enabled && hasProLicense();
}

/**
 * Get feature configuration
 */
export function getFeatureConfig(feature: Feature): FeatureConfig | undefined {
  return featureConfigs[feature];
}

/**
 * Get all features by tier
 */
export function getFeaturesByTier(tier: FeatureTier): FeatureConfig[] {
  return Object.values(featureConfigs).filter(config => config.tier === tier);
}

/**
 * Get all Pro features
 */
export function getProFeatures(): FeatureConfig[] {
  return getFeaturesByTier('pro');
}

/**
 * Check if user has Pro license
 * This is a placeholder for future license verification
 */
export function hasProLicense(): boolean {
  // TODO: Implement actual license checking
  // For now, return true in dev mode, false otherwise
  return DEV_MODE;
}

/**
 * Check if currently in development mode
 */
export function isDevMode(): boolean {
  return DEV_MODE;
}
