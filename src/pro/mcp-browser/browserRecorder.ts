/**
 * MCP Browser Recorder
 * 
 * Records browser actions performed through the cursor-ide-browser MCP.
 * This module provides utilities to track and organize browser interactions
 * for competitive analysis workflows.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Types of browser actions that can be recorded
 */
export type BrowserActionType = 
  | 'navigate'
  | 'click'
  | 'type'
  | 'fill'
  | 'scroll'
  | 'snapshot'
  | 'wait';

/**
 * A recorded browser action
 */
export interface BrowserAction {
  id: string;
  type: BrowserActionType;
  timestamp: number;
  /** Element reference (if applicable) */
  elementRef?: string;
  /** Page URL at time of action */
  pageUrl: string;
  /** Page title at time of action */
  pageTitle?: string;
  /** Additional action-specific data */
  data?: Record<string, unknown>;
  /** Description of the action */
  description?: string;
}

/**
 * A recording session containing multiple browser actions
 */
export interface BrowserRecordingSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  actions: BrowserAction[];
  metadata?: {
    targetUrl?: string;
    projectName?: string;
    notes?: string;
  };
}

/**
 * State for the browser recorder
 */
interface RecorderState {
  isRecording: boolean;
  currentSession: BrowserRecordingSession | null;
  sessions: BrowserRecordingSession[];
}

/**
 * Browser Recorder class for managing recording sessions
 */
class BrowserRecorder {
  private state: RecorderState = {
    isRecording: false,
    currentSession: null,
    sessions: [],
  };

  private listeners: Set<(state: RecorderState) => void> = new Set();

  /**
   * Start a new recording session
   */
  startSession(name: string = '新建录制', metadata?: BrowserRecordingSession['metadata']): string {
    const sessionId = uuidv4();
    
    this.state.currentSession = {
      id: sessionId,
      name,
      startTime: Date.now(),
      actions: [],
      metadata,
    };
    this.state.isRecording = true;
    
    this.notifyListeners();
    return sessionId;
  }

  /**
   * Stop the current recording session
   */
  stopSession(): BrowserRecordingSession | null {
    if (!this.state.currentSession) return null;

    const session = {
      ...this.state.currentSession,
      endTime: Date.now(),
    };

    this.state.sessions.push(session);
    this.state.currentSession = null;
    this.state.isRecording = false;

    this.notifyListeners();
    return session;
  }

  /**
   * Record a browser action
   */
  recordAction(
    type: BrowserActionType,
    pageUrl: string,
    options: {
      pageTitle?: string;
      elementRef?: string;
      data?: Record<string, unknown>;
      description?: string;
    } = {}
  ): BrowserAction | null {
    if (!this.state.isRecording || !this.state.currentSession) {
      console.warn('Cannot record action: no active recording session');
      return null;
    }

    const action: BrowserAction = {
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      pageUrl,
      pageTitle: options.pageTitle,
      elementRef: options.elementRef,
      data: options.data,
      description: options.description,
    };

    this.state.currentSession.actions.push(action);
    this.notifyListeners();

    return action;
  }

  /**
   * Record a navigation action
   */
  recordNavigation(url: string, title?: string): BrowserAction | null {
    return this.recordAction('navigate', url, {
      pageTitle: title,
      description: `导航到 ${url}`,
    });
  }

  /**
   * Record a click action
   */
  recordClick(
    pageUrl: string,
    elementRef: string,
    elementDescription?: string
  ): BrowserAction | null {
    return this.recordAction('click', pageUrl, {
      elementRef,
      description: elementDescription 
        ? `点击 ${elementDescription}`
        : `点击元素 ${elementRef}`,
    });
  }

  /**
   * Record a type/input action
   */
  recordType(
    pageUrl: string,
    elementRef: string,
    text: string
  ): BrowserAction | null {
    return this.recordAction('type', pageUrl, {
      elementRef,
      data: { text },
      description: `输入文本到 ${elementRef}`,
    });
  }

  /**
   * Record a scroll action
   */
  recordScroll(
    pageUrl: string,
    direction: 'up' | 'down',
    amount?: number
  ): BrowserAction | null {
    return this.recordAction('scroll', pageUrl, {
      data: { direction, amount },
      description: `滚动 ${direction === 'up' ? '向上' : '向下'}`,
    });
  }

  /**
   * Record a snapshot/screenshot action
   */
  recordSnapshot(pageUrl: string, pageTitle?: string): BrowserAction | null {
    return this.recordAction('snapshot', pageUrl, {
      pageTitle,
      description: '页面快照',
    });
  }

  /**
   * Get current recorder state
   */
  getState(): RecorderState {
    return { ...this.state };
  }

  /**
   * Get current session
   */
  getCurrentSession(): BrowserRecordingSession | null {
    return this.state.currentSession;
  }

  /**
   * Get all recorded sessions
   */
  getSessions(): BrowserRecordingSession[] {
    return [...this.state.sessions];
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): BrowserRecordingSession | undefined {
    if (this.state.currentSession?.id === id) {
      return this.state.currentSession;
    }
    return this.state.sessions.find(s => s.id === id);
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    const index = this.state.sessions.findIndex(s => s.id === id);
    if (index === -1) return false;

    this.state.sessions.splice(index, 1);
    this.notifyListeners();
    return true;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: RecorderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.state = {
      isRecording: false,
      currentSession: null,
      sessions: [],
    };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }
}

// Singleton instance
export const browserRecorder = new BrowserRecorder();

/**
 * Hook to use browser recorder in React components
 */
export function useBrowserRecorder() {
  const [state, setState] = React.useState(browserRecorder.getState());

  React.useEffect(() => {
    return browserRecorder.subscribe(setState);
  }, []);

  return {
    ...state,
    startSession: browserRecorder.startSession.bind(browserRecorder),
    stopSession: browserRecorder.stopSession.bind(browserRecorder),
    recordAction: browserRecorder.recordAction.bind(browserRecorder),
    recordNavigation: browserRecorder.recordNavigation.bind(browserRecorder),
    recordClick: browserRecorder.recordClick.bind(browserRecorder),
    recordType: browserRecorder.recordType.bind(browserRecorder),
    recordScroll: browserRecorder.recordScroll.bind(browserRecorder),
    recordSnapshot: browserRecorder.recordSnapshot.bind(browserRecorder),
    getSessions: browserRecorder.getSessions.bind(browserRecorder),
    getSession: browserRecorder.getSession.bind(browserRecorder),
    deleteSession: browserRecorder.deleteSession.bind(browserRecorder),
    clear: browserRecorder.clear.bind(browserRecorder),
  };
}

// Import React for the hook
import React from 'react';
