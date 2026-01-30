/**
 * Extension Points System
 * 
 * Allows Pro modules to register themselves into the core application
 * without creating hard dependencies from core code to Pro code.
 */

import type { RecordedMouseEvent } from '../../../electron/mouseTracker';

/**
 * Timeline marker extension interface
 */
export interface TimelineMarkerExtension {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  onMarkerClick?: (markerId: string, timeMs: number) => void;
  renderMarker?: (timeMs: number, isSelected: boolean) => React.ReactNode;
}

/**
 * Export format extension interface
 */
export interface ExportFormatExtension {
  id: string;
  name: string;
  description: string;
  fileExtension: string;
  mimeType: string;
  export: (data: ExportData) => Promise<Blob | ArrayBuffer>;
}

export interface ExportData {
  videoPath: string;
  keyframes?: KeyframeCaptureData[];
  flowGraph?: FlowGraphData;
  metadata?: Record<string, unknown>;
}

export interface KeyframeCaptureData {
  id: string;
  timestampMs: number;
  imageData?: string;
  label?: string;
}

export interface FlowGraphData {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
  connections: Array<{ from: string; to: string; label?: string }>;
}

/**
 * Sidebar panel extension interface
 */
export interface SidebarPanelExtension {
  id: string;
  name: string;
  icon: string;
  order: number;
  component: React.ComponentType<SidebarPanelProps>;
}

export interface SidebarPanelProps {
  videoPath?: string;
  currentTime: number;
  duration: number;
  onSeek?: (timeMs: number) => void;
}

/**
 * Mouse event subscriber interface
 */
export interface MouseEventSubscriber {
  id: string;
  onMouseEvent: (event: RecordedMouseEvent) => void;
  onTrackingStart?: () => void;
  onTrackingStop?: () => void;
}

/**
 * Extension registry - central storage for all extensions
 */
class ExtensionRegistry {
  private timelineMarkers: Map<string, TimelineMarkerExtension> = new Map();
  private exportFormats: Map<string, ExportFormatExtension> = new Map();
  private sidebarPanels: Map<string, SidebarPanelExtension> = new Map();
  private mouseEventSubscribers: Map<string, MouseEventSubscriber> = new Map();

  // Timeline Markers
  registerTimelineMarker(extension: TimelineMarkerExtension): void {
    this.timelineMarkers.set(extension.id, extension);
  }

  unregisterTimelineMarker(id: string): void {
    this.timelineMarkers.delete(id);
  }

  getTimelineMarkers(): TimelineMarkerExtension[] {
    return Array.from(this.timelineMarkers.values());
  }

  // Export Formats
  registerExportFormat(extension: ExportFormatExtension): void {
    this.exportFormats.set(extension.id, extension);
  }

  unregisterExportFormat(id: string): void {
    this.exportFormats.delete(id);
  }

  getExportFormats(): ExportFormatExtension[] {
    return Array.from(this.exportFormats.values());
  }

  getExportFormat(id: string): ExportFormatExtension | undefined {
    return this.exportFormats.get(id);
  }

  // Sidebar Panels
  registerSidebarPanel(extension: SidebarPanelExtension): void {
    this.sidebarPanels.set(extension.id, extension);
  }

  unregisterSidebarPanel(id: string): void {
    this.sidebarPanels.delete(id);
  }

  getSidebarPanels(): SidebarPanelExtension[] {
    return Array.from(this.sidebarPanels.values()).sort((a, b) => a.order - b.order);
  }

  // Mouse Event Subscribers
  registerMouseEventSubscriber(subscriber: MouseEventSubscriber): void {
    this.mouseEventSubscribers.set(subscriber.id, subscriber);
  }

  unregisterMouseEventSubscriber(id: string): void {
    this.mouseEventSubscribers.delete(id);
  }

  getMouseEventSubscribers(): MouseEventSubscriber[] {
    return Array.from(this.mouseEventSubscribers.values());
  }

  notifyMouseEvent(event: RecordedMouseEvent): void {
    for (const subscriber of this.mouseEventSubscribers.values()) {
      try {
        subscriber.onMouseEvent(event);
      } catch (error) {
        console.error(`Error in mouse event subscriber ${subscriber.id}:`, error);
      }
    }
  }

  notifyTrackingStart(): void {
    for (const subscriber of this.mouseEventSubscribers.values()) {
      try {
        subscriber.onTrackingStart?.();
      } catch (error) {
        console.error(`Error in tracking start subscriber ${subscriber.id}:`, error);
      }
    }
  }

  notifyTrackingStop(): void {
    for (const subscriber of this.mouseEventSubscribers.values()) {
      try {
        subscriber.onTrackingStop?.();
      } catch (error) {
        console.error(`Error in tracking stop subscriber ${subscriber.id}:`, error);
      }
    }
  }

  // Clear all extensions (useful for testing)
  clear(): void {
    this.timelineMarkers.clear();
    this.exportFormats.clear();
    this.sidebarPanels.clear();
    this.mouseEventSubscribers.clear();
  }
}

// Singleton instance
export const extensionRegistry = new ExtensionRegistry();
