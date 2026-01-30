/**
 * FeatureGate - Conditional rendering based on feature availability
 * 
 * Renders children only if the specified feature is enabled.
 * Optionally shows a fallback (e.g., upgrade prompt) for disabled features.
 */

import React from 'react';
import { Feature } from '@/lib/features';
import { useFeature } from '@/hooks/useFeature';

interface FeatureGateProps {
  /** The feature to check */
  feature: Feature;
  /** Content to render when feature is enabled */
  children: React.ReactNode;
  /** Content to render when feature is disabled (optional) */
  fallback?: React.ReactNode;
  /** If true, renders nothing when disabled (default: false) */
  hideWhenDisabled?: boolean;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  hideWhenDisabled = false,
}: FeatureGateProps) {
  const { enabled } = useFeature(feature);

  if (enabled) {
    return <>{children}</>;
  }

  if (hideWhenDisabled) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return null;
}

/**
 * ProFeatureGate - Shorthand for gating Pro features with default upgrade hint
 */
interface ProFeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  /** Custom fallback, or use default ProUpgradeHint */
  fallback?: React.ReactNode;
}

export function ProFeatureGate({
  feature,
  children,
  fallback,
}: ProFeatureGateProps) {
  const { enabled, name, requirePro } = useFeature(feature);

  if (enabled) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  // Default upgrade hint
  return (
    <ProUpgradeHint 
      featureName={name} 
      onUpgradeClick={requirePro} 
    />
  );
}

/**
 * ProUpgradeHint - Default UI for locked Pro features
 */
interface ProUpgradeHintProps {
  featureName: string;
  onUpgradeClick?: () => void;
  compact?: boolean;
}

export function ProUpgradeHint({
  featureName,
  onUpgradeClick,
  compact = false,
}: ProUpgradeHintProps) {
  if (compact) {
    return (
      <button
        onClick={onUpgradeClick}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 rounded transition-colors"
      >
        <ProBadge size="sm" />
        <span>{featureName}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/10">
      <ProBadge size="lg" />
      <h3 className="mt-3 text-lg font-medium text-slate-200">
        {featureName}
      </h3>
      <p className="mt-1 text-sm text-slate-400 text-center">
        此功能需要 Pro 版本
      </p>
      <button
        onClick={onUpgradeClick}
        className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
      >
        升级到 Pro
      </button>
    </div>
  );
}

/**
 * Pro badge component
 */
interface ProBadgeProps {
  size?: 'sm' | 'md' | 'lg';
}

export function ProBadge({ size = 'md' }: ProBadgeProps) {
  const sizeClasses = {
    sm: 'text-[10px] px-1 py-0.5',
    md: 'text-xs px-1.5 py-0.5',
    lg: 'text-sm px-2 py-1',
  };

  return (
    <span className={`${sizeClasses[size]} bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold rounded uppercase`}>
      Pro
    </span>
  );
}
