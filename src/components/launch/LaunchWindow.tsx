import { useState, useEffect, useRef } from "react";
import styles from "./LaunchWindow.module.css";
import { useScreenRecorder, CameraShape, CameraPosition } from "../../hooks/useScreenRecorder";
import { Button } from "../ui/button";
import { BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { MdMonitor } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { FaFolderMinus } from "react-icons/fa6";
import { FiMinus, FiX } from "react-icons/fi";
import { BsCameraVideo, BsCameraVideoOff, BsMic, BsMicMute } from "react-icons/bs";
import { IoSettingsOutline } from "react-icons/io5";
import { ContentClamp } from "../ui/content-clamp";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Slider } from "../ui/slider";

export function LaunchWindow() {
  const { 
    recording, 
    toggleRecording, 
    cameraSettings, 
    setCameraSettings, 
    availableCameras, 
    refreshCameras,
    cameraPreviewStream,
    microphoneSettings,
    setMicrophoneSettings,
    availableMicrophones,
    refreshMicrophones,
  } = useScreenRecorder();
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  const [showMicSettings, setShowMicSettings] = useState(false);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);

  // Connect camera preview stream to video element (for settings panel)
  useEffect(() => {
    if (cameraPreviewRef.current && cameraPreviewStream) {
      cameraPreviewRef.current.srcObject = cameraPreviewStream;
    }
  }, [cameraPreviewStream]);

  // Control external camera preview window
  useEffect(() => {
    if (cameraSettings.enabled) {
      // Show external camera preview window
      window.electronAPI?.showCameraPreview?.({
        size: cameraSettings.size,
        shape: cameraSettings.shape,
        position: cameraSettings.position,
      });
    } else {
      // Hide camera preview window when disabled
      window.electronAPI?.hideCameraPreview?.();
    }
  }, [cameraSettings.enabled, cameraSettings.size, cameraSettings.shape, cameraSettings.position]);

  // Update camera preview recording state separately
  useEffect(() => {
    if (cameraSettings.enabled) {
      window.electronAPI?.updateCameraPreview?.({ recording });
    }
  }, [recording, cameraSettings.enabled]);


  // Cleanup camera preview window on unmount
  useEffect(() => {
    return () => {
      window.electronAPI?.closeCameraPreview?.();
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (recording) {
      if (!recordingStart) setRecordingStart(Date.now());
      timer = setInterval(() => {
        if (recordingStart) {
          setElapsed(Math.floor((Date.now() - recordingStart) / 1000));
        }
      }, 1000);
    } else {
      setRecordingStart(null);
      setElapsed(0);
      if (timer) clearInterval(timer);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recording, recordingStart]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const [selectedSource, setSelectedSource] = useState("Screen");
  const [hasSelectedSource, setHasSelectedSource] = useState(false);

  // Camera control functions
  const toggleCamera = () => {
    setCameraSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleShapeChange = (shape: CameraShape) => {
    setCameraSettings(prev => ({ ...prev, shape }));
  };

  const handleSizeChange = (value: number[]) => {
    setCameraSettings(prev => ({ ...prev, size: value[0] }));
  };

  const handlePositionChange = (position: CameraPosition) => {
    setCameraSettings(prev => ({ ...prev, position }));
  };

  const handleCameraDeviceChange = (deviceId: string) => {
    setCameraSettings(prev => ({ ...prev, deviceId }));
  };

  // Microphone control functions
  const toggleMicrophone = () => {
    setMicrophoneSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleMicDeviceChange = (deviceId: string) => {
    setMicrophoneSettings(prev => ({ ...prev, deviceId }));
  };

  useEffect(() => {
    const checkSelectedSource = async () => {
      if (window.electronAPI) {
        const source = await window.electronAPI.getSelectedSource();
        if (source) {
          setSelectedSource(source.name);
          setHasSelectedSource(true);
        } else {
          setSelectedSource("Screen");
          setHasSelectedSource(false);
        }
      }
    };

    checkSelectedSource();
    
    const interval = setInterval(checkSelectedSource, 500);
    return () => clearInterval(interval);
  }, []);

  const openSourceSelector = () => {
    if (window.electronAPI) {
      window.electronAPI.openSourceSelector();
    }
  };

  const openVideoFile = async () => {
    const result = await window.electronAPI.openVideoFilePicker();
    
    if (result.cancelled) {
      return;
    }
    
    if (result.success && result.path) {
      await window.electronAPI.setCurrentVideoPath(result.path);
      await window.electronAPI.switchToEditor();
    }
  };

  // IPC events for hide/close
  const sendHudOverlayHide = () => {
    if (window.electronAPI && window.electronAPI.hudOverlayHide) {
      window.electronAPI.hudOverlayHide();
    }
  };
  const sendHudOverlayClose = () => {
    if (window.electronAPI && window.electronAPI.hudOverlayClose) {
      window.electronAPI.hudOverlayClose();
    }
  };

  return (
    <div className="w-full h-screen relative bg-transparent">
      <div
        className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-full max-w-[500px] flex items-center justify-between px-4 py-2 ${styles.electronDrag}`}
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(30,30,40,0.92) 0%, rgba(20,20,30,0.85) 100%)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow: '0 4px 24px 0 rgba(0,0,0,0.28), 0 1px 3px 0 rgba(0,0,0,0.14) inset',
          border: '1px solid rgba(80,80,120,0.22)',
          minHeight: 44,
        }}
      >
        <div className={`flex items-center gap-1 ${styles.electronDrag}`}> <RxDragHandleDots2 size={18} className="text-white/40" /> </div>

        <Button
          variant="link"
          size="sm"
          className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-left text-xs ${styles.electronNoDrag}`}
          onClick={openSourceSelector}
          disabled={recording}
        >
          <MdMonitor size={14} className="text-white" />
          <ContentClamp truncateLength={6}>{selectedSource}</ContentClamp>
        </Button>

        <div className="w-px h-6 bg-white/30" />

        {/* Camera Toggle and Settings */}
        <div className={`flex items-center gap-1 ${styles.electronNoDrag}`}>
          <Button
            variant="link"
            size="sm"
            onClick={toggleCamera}
            disabled={recording || availableCameras.length === 0}
            className={`gap-1 text-white bg-transparent hover:bg-transparent px-1 text-xs`}
            title={cameraSettings.enabled ? "关闭摄像头" : "开启摄像头"}
          >
            {cameraSettings.enabled ? (
              <BsCameraVideo size={14} className="text-green-400" />
            ) : (
              <BsCameraVideoOff size={14} className="text-white/50" />
            )}
          </Button>
          
          <Popover open={showCameraSettings} onOpenChange={setShowCameraSettings}>
            <PopoverTrigger asChild>
              <Button
                variant="link"
                size="sm"
                disabled={recording}
                className={`text-white bg-transparent hover:bg-transparent px-1 text-xs`}
                title="摄像头设置"
              >
                <IoSettingsOutline size={12} className="text-white/70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-72 bg-zinc-900/95 border-zinc-700 text-white p-3 z-[9999]"
              side="top"
              align="center"
            >
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-zinc-300">摄像头设置</h4>
                
                {/* Camera Preview */}
                {cameraSettings.enabled && cameraPreviewStream && (
                  <div className="relative w-full aspect-video bg-zinc-800 rounded-lg overflow-hidden">
                    <video
                      ref={cameraPreviewRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    <div 
                      className="absolute border-2 border-dashed border-green-400/60"
                      style={{
                        ...(cameraSettings.position === 'top-left' && { top: 8, left: 8 }),
                        ...(cameraSettings.position === 'top-right' && { top: 8, right: 8 }),
                        ...(cameraSettings.position === 'bottom-left' && { bottom: 8, left: 8 }),
                        ...(cameraSettings.position === 'bottom-right' && { bottom: 8, right: 8 }),
                        width: `${cameraSettings.size * 2}%`,
                        height: `${cameraSettings.size * 2}%`,
                        borderRadius: cameraSettings.shape === 'circle' ? '50%' : '8px',
                      }}
                    />
                  </div>
                )}

                {/* Camera Device Selection */}
                {availableCameras.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">摄像头</label>
                    <select
                      value={cameraSettings.deviceId || ''}
                      onChange={(e) => handleCameraDeviceChange(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                    >
                      {availableCameras.map(camera => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Shape Selection */}
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">形状</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleShapeChange('circle')}
                      className={`flex-1 py-2 px-3 rounded text-xs flex items-center justify-center gap-2 ${
                        cameraSettings.shape === 'circle' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      <div className="w-4 h-4 border-2 rounded-full" />
                      圆形
                    </button>
                    <button
                      onClick={() => handleShapeChange('rectangle')}
                      className={`flex-1 py-2 px-3 rounded text-xs flex items-center justify-center gap-2 ${
                        cameraSettings.shape === 'rectangle' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      <div className="w-5 h-3 border-2 rounded" />
                      矩形
                    </button>
                  </div>
                </div>

                {/* Size Slider */}
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">大小: {cameraSettings.size}%</label>
                  <Slider
                    value={[cameraSettings.size]}
                    onValueChange={handleSizeChange}
                    min={5}
                    max={30}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Position Selection */}
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">位置</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'top-left', label: '左上' },
                      { value: 'top-right', label: '右上' },
                      { value: 'bottom-left', label: '左下' },
                      { value: 'bottom-right', label: '右下' },
                    ].map(pos => (
                      <button
                        key={pos.value}
                        onClick={() => handlePositionChange(pos.value as CameraPosition)}
                        className={`py-1.5 px-2 rounded text-xs ${
                          cameraSettings.position === pos.value 
                            ? 'bg-green-600 text-white' 
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {availableCameras.length === 0 && (
                  <div className="text-xs text-zinc-500 text-center py-2">
                    未检测到摄像头
                    <button
                      onClick={refreshCameras}
                      className="block mx-auto mt-2 text-green-400 hover:underline"
                    >
                      刷新
                    </button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Microphone Toggle and Settings */}
        <div className={`flex items-center gap-0.5 ${styles.electronNoDrag}`}>
          <Button
            variant="link"
            size="sm"
            onClick={toggleMicrophone}
            disabled={recording || availableMicrophones.length === 0}
            className={`text-white bg-transparent hover:bg-transparent px-1 text-xs`}
            title={microphoneSettings.enabled ? "关闭麦克风" : "开启麦克风"}
          >
            {microphoneSettings.enabled ? (
              <BsMic size={14} className="text-green-400" />
            ) : (
              <BsMicMute size={14} className="text-white/50" />
            )}
          </Button>
          
          <Popover open={showMicSettings} onOpenChange={setShowMicSettings}>
            <PopoverTrigger asChild>
              <Button
                variant="link"
                size="sm"
                disabled={recording}
                className={`text-white bg-transparent hover:bg-transparent px-0.5 text-xs`}
                title="麦克风设置"
              >
                <IoSettingsOutline size={10} className="text-white/70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-64 bg-zinc-900/95 border-zinc-700 text-white p-3 z-[9999]"
              side="top"
              align="center"
            >
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-300">麦克风设置</h4>
                
                {/* Microphone Device Selection */}
                {availableMicrophones.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">选择麦克风</label>
                    <select
                      value={microphoneSettings.deviceId || ''}
                      onChange={(e) => handleMicDeviceChange(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
                    >
                      {availableMicrophones.map(mic => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {availableMicrophones.length === 0 && (
                  <div className="text-xs text-zinc-500 text-center py-2">
                    未检测到麦克风
                    <button
                      onClick={refreshMicrophones}
                      className="block mx-auto mt-2 text-green-400 hover:underline"
                    >
                      刷新
                    </button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="w-px h-6 bg-white/30" />

        <Button
          variant="link"
          size="sm"
          onClick={hasSelectedSource ? toggleRecording : openSourceSelector}
          disabled={!hasSelectedSource && !recording}
          className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-center text-xs ${styles.electronNoDrag}`}
        >
          {recording ? (
            <>
              <FaRegStopCircle size={14} className="text-red-400" />
              <span className="text-red-400">{formatTime(elapsed)}</span>
            </>
          ) : (
            <>
              <BsRecordCircle size={14} className={hasSelectedSource ? "text-white" : "text-white/50"} />
              <span className={hasSelectedSource ? "text-white" : "text-white/50"}>Record</span>
            </>
          )}
        </Button>
        

        <div className="w-px h-6 bg-white/30" />


        <Button
          variant="link"
          size="sm"
          onClick={openVideoFile}
          className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-right text-xs ${styles.electronNoDrag} ${styles.folderButton}`}
          disabled={recording}
        >
          <FaFolderMinus size={14} className="text-white" />
          <span className={styles.folderText}>Open</span>
        </Button>

         {/* Separator before hide/close buttons */}
        <div className="w-px h-6 bg-white/30 mx-2" />
        <Button
          variant="link"
          size="icon"
          className={`ml-2 ${styles.electronNoDrag} hudOverlayButton`}
          title="Hide HUD"
          onClick={sendHudOverlayHide}
        >
          <FiMinus size={18} style={{ color: '#fff', opacity: 0.7 }} />
          
        </Button>

        <Button
          variant="link"
          size="icon"
          className={`ml-1 ${styles.electronNoDrag} hudOverlayButton`}
          title="Close App"
          onClick={sendHudOverlayClose}
        >
          <FiX size={18} style={{ color: '#fff', opacity: 0.7 }} />
        </Button>
      </div>
    </div>
  );
}
