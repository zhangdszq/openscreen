/**
 * Features module - exports all feature-related functionality
 */

export {
  Feature,
  type FeatureTier,
  type FeatureConfig,
  isFeatureEnabled,
  getFeatureConfig,
  getFeaturesByTier,
  getProFeatures,
  hasProLicense,
  isDevMode,
} from './featureFlags';

export {
  type TimelineMarkerExtension,
  type ExportFormatExtension,
  type ExportData,
  type KeyframeCaptureData,
  type FlowGraphData,
  type SidebarPanelExtension,
  type SidebarPanelProps,
  type MouseEventSubscriber,
  extensionRegistry,
} from './extensionPoints';
