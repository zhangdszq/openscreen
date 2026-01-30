import { ipcMain, desktopCapturer, BrowserWindow, shell, app, dialog } from 'electron'

import fs from 'node:fs/promises'
import path from 'node:path'
import { RECORDINGS_DIR } from '../main'
import { startTracking, stopTracking, isCurrentlyTracking, recordClick, checkAccessibilityPermission, requestAccessibilityPermission, type RecordingBounds, type MouseTrackData } from '../mouseTracker'

let selectedSource: any = null

export function registerIpcHandlers(
  createEditorWindow: () => void,
  createSourceSelectorWindow: () => BrowserWindow,
  getMainWindow: () => BrowserWindow | null,
  getSourceSelectorWindow: () => BrowserWindow | null,
  onRecordingStateChange?: (recording: boolean, sourceName: string) => void
) {
  ipcMain.handle('get-sources', async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts)
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  })

  ipcMain.handle('select-source', (_, source) => {
    selectedSource = source
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin) {
      sourceSelectorWin.close()
    }
    return selectedSource
  })

  ipcMain.handle('get-selected-source', () => {
    return selectedSource
  })

  ipcMain.handle('open-source-selector', () => {
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin) {
      sourceSelectorWin.focus()
      return
    }
    createSourceSelectorWindow()
  })

  ipcMain.handle('switch-to-editor', () => {
    const mainWin = getMainWindow()
    if (mainWin) {
      mainWin.close()
    }
    createEditorWindow()
  })



  ipcMain.handle('store-recorded-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName)
      await fs.writeFile(videoPath, Buffer.from(videoData))
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: 'Video stored successfully'
      }
    } catch (error) {
      console.error('Failed to store video:', error)
      return {
        success: false,
        message: 'Failed to store video',
        error: String(error)
      }
    }
  })



  ipcMain.handle('get-recorded-video-path', async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR)
      const videoFiles = files.filter(file => file.endsWith('.webm'))
      
      if (videoFiles.length === 0) {
        return { success: false, message: 'No recorded video found' }
      }
      
      const latestVideo = videoFiles.sort().reverse()[0]
      const videoPath = path.join(RECORDINGS_DIR, latestVideo)
      
      return { success: true, path: videoPath }
    } catch (error) {
      console.error('Failed to get video path:', error)
      return { success: false, message: 'Failed to get video path', error: String(error) }
    }
  })

  ipcMain.handle('set-recording-state', (_, recording: boolean) => {
    const source = selectedSource || { name: 'Screen' }
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name)
    }
  })


  ipcMain.handle('open-external-url', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Failed to open URL:', error)
      return { success: false, error: String(error) }
    }
  })

  // Return base path for assets so renderer can resolve file:// paths in production
  ipcMain.handle('get-asset-base-path', () => {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'assets')
      }
      return path.join(app.getAppPath(), 'public', 'assets')
    } catch (err) {
      console.error('Failed to resolve asset base path:', err)
      return null
    }
  })

  ipcMain.handle('save-exported-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      // Determine file type from extension
      const isGif = fileName.toLowerCase().endsWith('.gif');
      const filters = isGif 
        ? [{ name: 'GIF Image', extensions: ['gif'] }]
        : [{ name: 'MP4 Video', extensions: ['mp4'] }];

      const result = await dialog.showSaveDialog({
        title: isGif ? 'Save Exported GIF' : 'Save Exported Video',
        defaultPath: path.join(app.getPath('downloads'), fileName),
        filters,
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });

      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: 'Export cancelled'
        };
      }

      await fs.writeFile(result.filePath, Buffer.from(videoData));

      return {
        success: true,
        path: result.filePath,
        message: 'Video exported successfully'
      };
    } catch (error) {
      console.error('Failed to save exported video:', error)
      return {
        success: false,
        message: 'Failed to save exported video',
        error: String(error)
      }
    }
  })

  ipcMain.handle('open-video-file-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Video File',
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: 'Video Files', extensions: ['webm', 'mp4', 'mov', 'avi', 'mkv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error('Failed to open file picker:', error);
      return {
        success: false,
        message: 'Failed to open file picker',
        error: String(error)
      };
    }
  });

  let currentVideoPath: string | null = null;

  ipcMain.handle('set-current-video-path', (_, path: string) => {
    currentVideoPath = path;
    return { success: true };
  });

  ipcMain.handle('get-current-video-path', () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });

  ipcMain.handle('clear-current-video-path', () => {
    currentVideoPath = null;
    return { success: true };
  });

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

  // Mouse tracking handlers
  ipcMain.handle('start-mouse-tracking', async (_, bounds: RecordingBounds) => {
    try {
      const result = await startTracking(bounds);
      return result;
    } catch (error) {
      console.error('Failed to start mouse tracking:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('check-accessibility-permission', async () => {
    return await checkAccessibilityPermission();
  });

  ipcMain.handle('request-accessibility-permission', async () => {
    return await requestAccessibilityPermission();
  });

  ipcMain.handle('stop-mouse-tracking', () => {
    try {
      const data = stopTracking();
      return { success: true, data };
    } catch (error) {
      console.error('Failed to stop mouse tracking:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('is-mouse-tracking', () => {
    return isCurrentlyTracking();
  });

  ipcMain.handle('record-mouse-click', (_, button: 'left' | 'right' | 'middle' = 'left') => {
    try {
      recordClick(button);
      return { success: true };
    } catch (error) {
      console.error('Failed to record mouse click:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('save-mouse-events', async (_, mouseData: MouseTrackData, fileName: string) => {
    try {
      const filePath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(filePath, JSON.stringify(mouseData, null, 2));
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save mouse events:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('load-mouse-events', async (_, videoPath: string) => {
    try {
      // Try to find mouse events file matching the video
      const mouseFilePath = videoPath.replace(/\.[^.]+$/, '.mouse.json');
      const data = await fs.readFile(mouseFilePath, 'utf-8');
      const mouseData: MouseTrackData = JSON.parse(data);
      return { success: true, data: mouseData };
    } catch (error) {
      // It's normal for mouse events file to not exist
      console.log('No mouse events file found for video');
      return { success: false, error: 'No mouse events file found' };
    }
  });

  // ============================================================================
  // Pro Feature Handlers - Keyframes and Flow Graph
  // ============================================================================

  // Save a single keyframe image
  ipcMain.handle('save-keyframe-image', async (_, imageData: string, fileName: string) => {
    try {
      // Create keyframes directory if it doesn't exist
      const keyframesDir = path.join(RECORDINGS_DIR, 'keyframes');
      await fs.mkdir(keyframesDir, { recursive: true });

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const filePath = path.join(keyframesDir, fileName);
      await fs.writeFile(filePath, buffer);

      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save keyframe image:', error);
      return { success: false, error: String(error) };
    }
  });

  // Save flow graph data
  ipcMain.handle('save-flow-graph', async (_, flowGraphJson: string, fileName: string) => {
    try {
      const flowGraphsDir = path.join(RECORDINGS_DIR, 'flowgraphs');
      await fs.mkdir(flowGraphsDir, { recursive: true });

      const filePath = path.join(flowGraphsDir, fileName);
      await fs.writeFile(filePath, flowGraphJson, 'utf-8');

      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save flow graph:', error);
      return { success: false, error: String(error) };
    }
  });

  // Load flow graph data
  ipcMain.handle('load-flow-graph', async (_, filePath: string) => {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    } catch (error) {
      console.error('Failed to load flow graph:', error);
      return { success: false, error: String(error) };
    }
  });

  // List available flow graphs
  ipcMain.handle('list-flow-graphs', async () => {
    try {
      const flowGraphsDir = path.join(RECORDINGS_DIR, 'flowgraphs');
      
      try {
        await fs.access(flowGraphsDir);
      } catch {
        return { success: true, files: [] };
      }

      const files = await fs.readdir(flowGraphsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const flowGraphs = await Promise.all(
        jsonFiles.map(async (fileName) => {
          const filePath = path.join(flowGraphsDir, fileName);
          const stat = await fs.stat(filePath);
          
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            return {
              fileName,
              path: filePath,
              name: data.name || fileName.replace('.json', ''),
              keyframeCount: data.keyframes?.length || 0,
              connectionCount: data.connections?.length || 0,
              createdAt: data.metadata?.createdAt || stat.birthtime.getTime(),
              updatedAt: data.metadata?.updatedAt || stat.mtime.getTime(),
            };
          } catch {
            return {
              fileName,
              path: filePath,
              name: fileName.replace('.json', ''),
              keyframeCount: 0,
              connectionCount: 0,
              createdAt: stat.birthtime.getTime(),
              updatedAt: stat.mtime.getTime(),
            };
          }
        })
      );

      return { success: true, files: flowGraphs };
    } catch (error) {
      console.error('Failed to list flow graphs:', error);
      return { success: false, error: String(error) };
    }
  });

  // Export flow graph as ZIP (Figma package)
  ipcMain.handle('export-flow-graph-zip', async (_, zipData: ArrayBuffer, fileName: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: '导出流程图',
        defaultPath: path.join(app.getPath('downloads'), fileName),
        filters: [
          { name: 'ZIP Archive', extensions: ['zip'] }
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });

      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true, message: 'Export cancelled' };
      }

      await fs.writeFile(result.filePath, Buffer.from(zipData));

      return {
        success: true,
        path: result.filePath,
        message: 'Flow graph exported successfully'
      };
    } catch (error) {
      console.error('Failed to export flow graph ZIP:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete a flow graph
  ipcMain.handle('delete-flow-graph', async (_, filePath: string) => {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete flow graph:', error);
      return { success: false, error: String(error) };
    }
  });
}
