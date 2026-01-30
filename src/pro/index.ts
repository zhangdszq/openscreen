/**
 * Pro Modules Entry Point
 * 
 * This is the main entry point for all Pro features.
 * Pro modules are registered here and can be conditionally loaded.
 */

import { Feature, isFeatureEnabled } from '@/lib/features';

// Re-export all pro modules
export * from './keyframe';
export * from './flow-editor';
export * from './figma-export';
export * from './mcp-browser';

/**
 * Register all enabled Pro modules with the extension system
 */
export function registerProModules(): void {
  console.log('[Pro] Registering Pro modules...');

  // Register keyframe module extensions
  if (isFeatureEnabled(Feature.PRO_KEYFRAME_EXTRACT)) {
    console.log('[Pro] Keyframe extraction enabled');
    // Could register additional extension points here
  }

  // Register flow editor extensions
  if (isFeatureEnabled(Feature.PRO_FLOW_EDITOR)) {
    console.log('[Pro] Flow editor enabled');
  }

  // Register Figma export extensions
  if (isFeatureEnabled(Feature.PRO_FIGMA_EXPORT)) {
    console.log('[Pro] Figma export enabled');
  }

  // Register MCP browser extensions
  if (isFeatureEnabled(Feature.PRO_MCP_BROWSER)) {
    console.log('[Pro] MCP browser integration enabled');
  }

  console.log('[Pro] Pro modules registered successfully');
}

/**
 * Check if any Pro features are enabled
 */
export function hasAnyProFeature(): boolean {
  return (
    isFeatureEnabled(Feature.PRO_KEYFRAME_EXTRACT) ||
    isFeatureEnabled(Feature.PRO_FLOW_EDITOR) ||
    isFeatureEnabled(Feature.PRO_FIGMA_EXPORT) ||
    isFeatureEnabled(Feature.PRO_MCP_BROWSER)
  );
}
