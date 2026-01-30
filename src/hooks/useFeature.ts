/**
 * React hook for feature flag checking
 */

import { useCallback, useMemo } from 'react';
import { Feature, isFeatureEnabled, getFeatureConfig, hasProLicense } from '@/lib/features';

export interface UseFeatureResult {
  /** Whether the feature is currently enabled */
  enabled: boolean;
  /** The tier this feature belongs to */
  tier: 'free' | 'pro';
  /** Feature display name */
  name: string;
  /** Feature description */
  description: string;
  /** Whether user has Pro license */
  hasPro: boolean;
  /** Call this to show upgrade prompt (for disabled Pro features) */
  requirePro: () => void;
}

/**
 * Hook to check feature availability and get feature info
 */
export function useFeature(feature: Feature): UseFeatureResult {
  const config = useMemo(() => getFeatureConfig(feature), [feature]);
  const enabled = useMemo(() => isFeatureEnabled(feature), [feature]);
  const hasPro = useMemo(() => hasProLicense(), []);

  const requirePro = useCallback(() => {
    if (!hasPro) {
      // TODO: Show upgrade dialog or redirect to pricing page
      console.log(`Feature "${config?.name}" requires Pro. Showing upgrade prompt...`);
      // Could dispatch an event or call a global function here
      window.dispatchEvent(new CustomEvent('openscreen:require-pro', {
        detail: { feature, featureName: config?.name }
      }));
    }
  }, [feature, config?.name, hasPro]);

  return {
    enabled,
    tier: config?.tier ?? 'free',
    name: config?.name ?? feature,
    description: config?.description ?? '',
    hasPro,
    requirePro,
  };
}

/**
 * Hook to get all Pro features status
 */
export function useProFeatures() {
  const hasPro = useMemo(() => hasProLicense(), []);
  
  const keyframeExtract = useFeature(Feature.PRO_KEYFRAME_EXTRACT);
  const flowEditor = useFeature(Feature.PRO_FLOW_EDITOR);
  const figmaExport = useFeature(Feature.PRO_FIGMA_EXPORT);
  const mcpBrowser = useFeature(Feature.PRO_MCP_BROWSER);

  return {
    hasPro,
    features: {
      keyframeExtract,
      flowEditor,
      figmaExport,
      mcpBrowser,
    },
  };
}
