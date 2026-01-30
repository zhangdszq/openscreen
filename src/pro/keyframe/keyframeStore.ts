/**
 * Keyframe Store
 * 
 * Zustand store for managing keyframe captures and flow graph state.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { 
  KeyframeCapture, 
  FlowGraph, 
  FlowConnection,
  FlowRegion,
  FlowEndpointType,
} from '@/components/video-editor/types';
import { createEmptyFlowGraph as createGraph } from '@/components/video-editor/types';

// Helper to safely update metadata with required fields
function updateMetadata(existingMetadata: FlowGraph['metadata']): NonNullable<FlowGraph['metadata']> {
  const now = Date.now();
  return {
    createdAt: existingMetadata?.createdAt ?? now,
    updatedAt: now,
    videoPath: existingMetadata?.videoPath,
    projectName: existingMetadata?.projectName,
    description: existingMetadata?.description,
  };
}

const MAX_HISTORY = 50;

interface KeyframeState {
  // Current flow graph
  flowGraph: FlowGraph;
  
  // History for undo/redo
  history: FlowGraph[];
  historyIndex: number;
  
  // Selection state
  selectedKeyframeIds: string[];
  selectedRegionIds: string[];
  selectedConnectionIds: string[];
  
  // UI state
  isExtracting: boolean;
  extractionProgress: { current: number; total: number } | null;
  
  // Actions
  setFlowGraph: (graph: FlowGraph) => void;
  resetFlowGraph: (name?: string) => void;
  
  // Keyframe actions
  addKeyframe: (keyframe: KeyframeCapture) => void;
  addKeyframes: (keyframes: KeyframeCapture[]) => void;
  updateKeyframe: (id: string, updates: Partial<KeyframeCapture>) => void;
  removeKeyframe: (id: string) => void;
  removeKeyframes: (ids: string[]) => void;
  
  // Region actions
  addRegion: (region: FlowRegion) => void;
  updateRegion: (id: string, updates: Partial<FlowRegion>) => void;
  removeRegion: (id: string) => void;
  updateRegionPosition: (id: string, x: number, y: number) => void;
  updateRegionSize: (id: string, width: number, height: number) => void;
  
  // Connection actions
  addConnection: (from: string, to: string, label?: string, fromType?: FlowEndpointType, toType?: FlowEndpointType) => void;
  updateConnection: (id: string, updates: Partial<FlowConnection>) => void;
  removeConnection: (id: string) => void;
  
  // Selection actions
  selectKeyframe: (id: string, multi?: boolean) => void;
  selectRegion: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  
  // Extraction state
  setExtracting: (isExtracting: boolean) => void;
  setExtractionProgress: (progress: { current: number; total: number } | null) => void;
  
  // Flow position helpers
  updateKeyframePosition: (id: string, x: number, y: number) => void;
  autoLayoutKeyframes: () => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (graph: FlowGraph) => void;
}

export const useKeyframeStore = create<KeyframeState>((set, get) => ({
  flowGraph: createGraph(),
  history: [],
  historyIndex: -1,
  selectedKeyframeIds: [],
  selectedRegionIds: [],
  selectedConnectionIds: [],
  isExtracting: false,
  extractionProgress: null,

  // Push current state to history before making changes
  pushHistory: (graph) => set((state) => {
    // Remove any future history if we're not at the end
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(graph)));
    
    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  undo: () => set((state) => {
    if (state.historyIndex <= 0) return state;
    
    const newIndex = state.historyIndex - 1;
    const previousGraph = state.history[newIndex];
    
    return {
      flowGraph: JSON.parse(JSON.stringify(previousGraph)),
      historyIndex: newIndex,
    };
  }),

  redo: () => set((state) => {
    if (state.historyIndex >= state.history.length - 1) return state;
    
    const newIndex = state.historyIndex + 1;
    const nextGraph = state.history[newIndex];
    
    return {
      flowGraph: JSON.parse(JSON.stringify(nextGraph)),
      historyIndex: newIndex,
    };
  }),

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  setFlowGraph: (graph) => set({ flowGraph: graph }),
  
  resetFlowGraph: (name) => set({ 
    flowGraph: createGraph(name),
    history: [],
    historyIndex: -1,
    selectedKeyframeIds: [],
    selectedRegionIds: [],
    selectedConnectionIds: [],
  }),

  addKeyframe: (keyframe) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: [...state.flowGraph.keyframes, keyframe],
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  addKeyframes: (keyframes) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: [...state.flowGraph.keyframes, ...keyframes],
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  updateKeyframe: (id, updates) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: state.flowGraph.keyframes.map((kf) =>
        kf.id === id ? { ...kf, ...updates } : kf
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  removeKeyframe: (id) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: state.flowGraph.keyframes.filter((kf) => kf.id !== id),
      // Also remove connections involving this keyframe
      connections: state.flowGraph.connections.filter(
        (conn) => conn.from !== id && conn.to !== id
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
    selectedKeyframeIds: state.selectedKeyframeIds.filter((kid) => kid !== id),
  })),

  removeKeyframes: (ids) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: state.flowGraph.keyframes.filter((kf) => !ids.includes(kf.id)),
      connections: state.flowGraph.connections.filter(
        (conn) => !ids.includes(conn.from) && !ids.includes(conn.to)
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
    selectedKeyframeIds: state.selectedKeyframeIds.filter((kid) => !ids.includes(kid)),
  })),

  // Region actions
  addRegion: (region) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      regions: [...(state.flowGraph.regions || []), region],
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  updateRegion: (id, updates) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      regions: (state.flowGraph.regions || []).map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  removeRegion: (id) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      regions: (state.flowGraph.regions || []).filter((r) => r.id !== id),
      // Also remove connections involving this region
      connections: state.flowGraph.connections.filter(
        (conn) => conn.from !== id && conn.to !== id
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
    selectedRegionIds: state.selectedRegionIds.filter((rid) => rid !== id),
  })),

  updateRegionPosition: (id, x, y) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      regions: (state.flowGraph.regions || []).map((r) =>
        r.id === id ? { ...r, position: { x, y } } : r
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  updateRegionSize: (id, width, height) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      regions: (state.flowGraph.regions || []).map((r) =>
        r.id === id ? { ...r, size: { width, height } } : r
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  addConnection: (from, to, label, fromType = 'keyframe', toType = 'keyframe') => set((state) => {
    // Check if connection already exists
    const exists = state.flowGraph.connections.some(
      (conn) => conn.from === from && conn.to === to
    );
    if (exists) return state;

    const newConnection: FlowConnection = {
      id: uuidv4(),
      from,
      fromType,
      to,
      toType,
      label,
    };

    return {
      flowGraph: {
        ...state.flowGraph,
        connections: [...state.flowGraph.connections, newConnection],
        metadata: updateMetadata(state.flowGraph.metadata),
      },
    };
  }),

  updateConnection: (id, updates) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      connections: state.flowGraph.connections.map((conn) =>
        conn.id === id ? { ...conn, ...updates } : conn
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  removeConnection: (id) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      connections: state.flowGraph.connections.filter((conn) => conn.id !== id),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
    selectedConnectionIds: state.selectedConnectionIds.filter((cid) => cid !== id),
  })),

  selectKeyframe: (id, multi = false) => set((state) => ({
    selectedKeyframeIds: multi
      ? state.selectedKeyframeIds.includes(id)
        ? state.selectedKeyframeIds.filter((kid) => kid !== id)
        : [...state.selectedKeyframeIds, id]
      : [id],
    selectedRegionIds: multi ? state.selectedRegionIds : [],
    selectedConnectionIds: multi ? state.selectedConnectionIds : [],
  })),

  selectRegion: (id, multi = false) => set((state) => ({
    selectedRegionIds: multi
      ? state.selectedRegionIds.includes(id)
        ? state.selectedRegionIds.filter((rid) => rid !== id)
        : [...state.selectedRegionIds, id]
      : [id],
    selectedKeyframeIds: multi ? state.selectedKeyframeIds : [],
    selectedConnectionIds: multi ? state.selectedConnectionIds : [],
  })),

  selectConnection: (id, multi = false) => set((state) => ({
    selectedConnectionIds: multi
      ? state.selectedConnectionIds.includes(id)
        ? state.selectedConnectionIds.filter((cid) => cid !== id)
        : [...state.selectedConnectionIds, id]
      : [id],
    selectedKeyframeIds: multi ? state.selectedKeyframeIds : [],
    selectedRegionIds: multi ? state.selectedRegionIds : [],
  })),

  clearSelection: () => set({
    selectedKeyframeIds: [],
    selectedRegionIds: [],
    selectedConnectionIds: [],
  }),

  setExtracting: (isExtracting) => set({ isExtracting }),
  
  setExtractionProgress: (extractionProgress) => set({ extractionProgress }),

  updateKeyframePosition: (id, x, y) => set((state) => ({
    flowGraph: {
      ...state.flowGraph,
      keyframes: state.flowGraph.keyframes.map((kf) =>
        kf.id === id ? { ...kf, flowPosition: { x, y } } : kf
      ),
      metadata: updateMetadata(state.flowGraph.metadata),
    },
  })),

  autoLayoutKeyframes: () => set((state) => {
    const keyframes = [...state.flowGraph.keyframes];
    const sortedKeyframes = keyframes.sort((a, b) => a.timestampMs - b.timestampMs);
    
    // Horizontal flow layout (left to right, wrap to next row)
    const nodeWidth = 200;
    const nodeHeight = 150;
    const gapX = 80;
    const gapY = 100;
    const maxCols = 4; // Max nodes per row

    const updatedKeyframes = sortedKeyframes.map((kf, index) => {
      const col = index % maxCols;
      const row = Math.floor(index / maxCols);
      return {
        ...kf,
        flowPosition: {
          x: col * (nodeWidth + gapX) + 50,
          y: row * (nodeHeight + gapY) + 80,
        },
      };
    });

    // Auto-create connections in sequence (by timestamp order)
    const existingConnectionSet = new Set(
      state.flowGraph.connections.map(c => `${c.from}->${c.to}`)
    );
    
    const newConnections: FlowConnection[] = [...state.flowGraph.connections];
    
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const fromId = sortedKeyframes[i].id;
      const toId = sortedKeyframes[i + 1].id;
      const connectionKey = `${fromId}->${toId}`;
      
      // Only add if not already exists
      if (!existingConnectionSet.has(connectionKey)) {
        newConnections.push({
          id: uuidv4(),
          from: fromId,
          to: toId,
        });
        existingConnectionSet.add(connectionKey);
      }
    }

    return {
      flowGraph: {
        ...state.flowGraph,
        keyframes: updatedKeyframes,
        connections: newConnections,
        metadata: updateMetadata(state.flowGraph.metadata),
      },
    };
  }),
}));

/**
 * Get keyframe by ID
 */
export function getKeyframeById(id: string): KeyframeCapture | undefined {
  return useKeyframeStore.getState().flowGraph.keyframes.find((kf) => kf.id === id);
}

/**
 * Get connection by ID
 */
export function getConnectionById(id: string): FlowConnection | undefined {
  return useKeyframeStore.getState().flowGraph.connections.find((conn) => conn.id === id);
}
