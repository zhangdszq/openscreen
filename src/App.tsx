import { useEffect, useState } from "react";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { CameraPreviewWindow } from "./components/launch/CameraPreviewWindow";
import { RegionSelector } from "./components/launch/RegionSelector";
import RegionIndicator from "./components/launch/RegionIndicator";
import { WindowPicker } from "./components/launch/WindowPicker";
import { TeleprompterWindow } from "./components/launch/TeleprompterWindow";
import VideoEditor from "./components/video-editor/VideoEditor";

export default function App() {
  const [windowType, setWindowType] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('windowType') || '';
    setWindowType(type);
    if (type === 'hud-overlay' || type === 'source-selector' || type === 'camera-preview' || type === 'region-selector' || type === 'region-indicator' || type === 'window-picker' || type === 'teleprompter') {
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      document.getElementById('root')?.style.setProperty('background', 'transparent');
    }
    // Add special class for camera preview to ensure full transparency and no scrollbars
    if (type === 'camera-preview') {
      document.body.classList.add('camera-preview-window');
      document.documentElement.classList.add('camera-preview-window');
    }
  }, []);

  switch (windowType) {
    case 'hud-overlay':
      return <LaunchWindow />;
    case 'source-selector':
      return <SourceSelector />;
    case 'camera-preview':
      return <CameraPreviewWindow />;
    case 'region-selector':
      return <RegionSelector />;
    case 'region-indicator':
      return <RegionIndicator isRecording={true} />;
    case 'window-picker':
      return <WindowPicker />;
    case 'teleprompter':
      return <TeleprompterWindow />;
    case 'editor':
      return <VideoEditor />;
    default:
      return (
        <div className="w-full h-full bg-background text-foreground">
          <h1>Openscreen</h1>
        </div>
      );
  }
}
