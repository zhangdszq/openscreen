import { useState, useEffect, useRef } from "react";
import styles from "./LaunchWindow.module.css";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { MdMonitor, MdCropFree, MdWindow } from "react-icons/md";
import { FiMinus, FiX, FiFolder, FiChevronDown, FiMonitor, FiMic, FiVolume2, FiSettings, FiFileText } from "react-icons/fi";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { AISettingsDialog } from "./AISettingsDialog";

type RecordingMode = 'fullscreen' | 'region' | 'window';

export function LaunchWindow() {
  const { 
    recording, 
    toggleRecording, 
    cameraSettings, 
    setCameraSettings, 
    availableCameras, 
    cameraPreviewStream,
    microphoneSettings,
    setMicrophoneSettings,
    availableMicrophones,
    refreshCameras,
    refreshMicrophones,
    systemAudioSettings,
    setSystemAudioSettings,
  } = useScreenRecorder();
  
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectedMode, setSelectedMode] = useState<RecordingMode>('fullscreen');
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  const [showSystemAudioSettings, setShowSystemAudioSettings] = useState(false);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);

  // Connect camera preview stream
  useEffect(() => {
    if (cameraPreviewRef.current && cameraPreviewStream) {
      cameraPreviewRef.current.srcObject = cameraPreviewStream;
    }
  }, [cameraPreviewStream]);

  // Camera preview window management
  useEffect(() => {
    if (cameraSettings.enabled) {
      window.electronAPI?.showCameraPreview?.({
        size: cameraSettings.size,
        shape: cameraSettings.shape,
        position: cameraSettings.position,
        borderStyle: cameraSettings.borderStyle,
        shadowIntensity: cameraSettings.shadowIntensity,
      });
    } else {
      window.electronAPI?.hideCameraPreview?.();
    }
  }, [cameraSettings.enabled]);

  // Sync camera settings
  useEffect(() => {
    if (cameraSettings.enabled) {
      window.electronAPI?.updateCameraPreview?.({
        borderStyle: cameraSettings.borderStyle,
        shadowIntensity: cameraSettings.shadowIntensity,
        size: cameraSettings.size,
        shape: cameraSettings.shape,
        position: cameraSettings.position,
        recording
      });
    }
  }, [cameraSettings, recording]);

  // Cleanup
  useEffect(() => {
    return () => {
      window.electronAPI?.closeCameraPreview?.();
    };
  }, []);

  // Timer
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

  // 当开始录制时隐藏主控窗口
  useEffect(() => {
    if (recording) {
      window.electronAPI?.hudOverlayHide?.();
    }
  }, [recording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Handlers
  const toggleCamera = () => setCameraSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  const toggleMicrophone = () => setMicrophoneSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  const toggleSystemAudio = () => setSystemAudioSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  
  const handleModeSelect = async (mode: RecordingMode) => {
    setSelectedMode(mode);
    if (mode === 'fullscreen') {
      const sources = await window.electronAPI?.getSources({ types: ['screen'] });
      if (sources && sources.length > 0) await window.electronAPI?.selectSource(sources[0]);
    } else if (mode === 'window') {
      // 打开全屏窗口选择器
      // @ts-ignore
      const windowInfo = await window.electronAPI?.openWindowPicker?.();
      if (windowInfo) {
        const windowSource = {
          id: windowInfo.id,
          name: windowInfo.name,
          display_id: '',
          thumbnail: null,
          appIcon: null,
        };
        await window.electronAPI?.selectSource(windowSource);
      }
    } else if (mode === 'region') {
      // 直接打开区域选择器进行框选，不显示菜单
      const region = await window.electronAPI?.openRegionSelector?.();
      if (region) {
        // 设置区域 source，格式：region:x,y,width,height
        const regionSource = {
          id: `region:${region.x},${region.y},${region.width},${region.height}`,
          name: `区域 ${region.width}×${region.height}`,
          display_id: '',
          thumbnail: null,
          appIcon: null,
        };
        await window.electronAPI?.selectSource(regionSource);
      }
    }
  };

  const handleStartRecording = async () => {
    if (selectedMode === 'fullscreen') {
      const sources = await window.electronAPI?.getSources({ types: ['screen'] });
      if (sources && sources.length > 0) await window.electronAPI?.selectSource(sources[0]);
    }
    toggleRecording();
  };

  const openVideoFile = async () => {
    const result = await window.electronAPI.openVideoFilePicker();
    if (result.success && result.path) {
      await window.electronAPI.setCurrentVideoPath(result.path);
      await window.electronAPI.switchToEditor();
    }
  };

  const recordingModes = [
    { id: 'fullscreen' as RecordingMode, label: '全屏', icon: MdMonitor },
    { id: 'region' as RecordingMode, label: '自定义区域', icon: MdCropFree },
    { id: 'window' as RecordingMode, label: '窗口', icon: MdWindow },
  ];

  const selectedCameraLabel = availableCameras.find(c => c.deviceId === cameraSettings.deviceId)?.label || '选择摄像头';
  const selectedMicLabel = availableMicrophones.find(m => m.deviceId === microphoneSettings.deviceId)?.label || '选择麦克风';

  // Mouse event handling for transparent window
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if mouse is over any interactive element
      const target = e.target as HTMLElement;
      
      // Elements that should capture mouse events:
      // 1. The main UI card (with glassContainer class)
      // 2. Popover content (usually portalled to body)
      // 3. Buttons, inputs, etc.
      
      // Use data attribute for more robust selection
      const mainUI = document.querySelector('[data-main-ui="true"]');
      const isOverMainUI = mainUI && (mainUI === target || mainUI.contains(target));
      // 检测 Popover 内容（使用 data-popover 或 role="dialog"）
      const isOverPopover = target.closest('[data-popover="true"]') || target.closest('[role="dialog"]');
      
      if (isOverMainUI || isOverPopover) {
        window.electronAPI?.setIgnoreMouseEvents?.(false);
      } else {
        window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="w-full h-full flex flex-col justify-end select-none font-sans">
      {/* Main UI Card - macOS Glass Style */}
      <div data-main-ui="true" className={`w-full text-white flex flex-col h-[400px] rounded-t-2xl overflow-hidden ${styles.glassContainer}`}>
        {/* Title Bar */}
        <div className={`h-12 flex items-center justify-between px-5 flex-shrink-0 ${styles.electronDrag} ${styles.titleBar}`}>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-[10px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <div className="w-2.5 h-2.5 bg-white rounded-full" />
              </div>
              <span className="text-[14px] font-semibold text-white/90 tracking-tight">InsightView</span>
            </div>
            <div className={`h-4 w-px ${styles.divider}`} />
            <button 
              onClick={openVideoFile}
              className={`text-[13px] text-white/50 hover:text-white/90 flex items-center gap-2 transition-all duration-200 ${styles.electronNoDrag} px-3 py-1.5 rounded-lg hover:bg-white/8`}
            >
              <FiFolder size={14} />
              文件
            </button>
          </div>
          <div className={`flex items-center gap-1 ${styles.electronNoDrag}`}>
            <AISettingsDialog 
              trigger={
                <button className="w-8 h-8 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group">
                  <FiSettings size={15} className="text-white/40 group-hover:text-white/80" />
                </button>
              }
            />
            <button onClick={() => window.electronAPI?.hudOverlayHide?.()} className="w-8 h-8 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group">
              <FiMinus size={15} className="text-white/40 group-hover:text-white/80" />
            </button>
            <button onClick={() => window.electronAPI?.hudOverlayClose?.()} className="w-8 h-8 flex items-center justify-center hover:bg-red-500/15 rounded-lg transition-all duration-200 group">
              <FiX size={15} className="text-white/40 group-hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 flex px-5 py-5 gap-6 min-h-0 ${styles.macScrollbar}`}>
          
          {/* Left Section: Modes */}
          <div className="flex-1 flex flex-col min-w-0">
            <h2 className="text-[12px] text-white/35 mb-4 font-medium tracking-wide uppercase">录制方式</h2>
            
            <div className="grid grid-cols-3 gap-3 mb-5">
              {recordingModes.map((mode) => {
                const isSelected = selectedMode === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleModeSelect(mode.id)}
                    disabled={recording}
                    className={`
                      group relative flex flex-col items-center p-0 rounded-xl overflow-hidden transition-all duration-200
                      ${isSelected 
                        ? styles.glassCardSelected
                        : styles.glassCard
                      }
                      ${recording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {/* Preview Area */}
                    <div className={`
                      w-full aspect-[16/10] flex items-center justify-center
                      ${isSelected 
                        ? 'bg-gradient-to-b from-emerald-500/8 to-transparent' 
                        : 'bg-gradient-to-b from-white/3 to-transparent'
                      }
                    `}>
                      <Icon size={28} className={`transition-all duration-200 ${isSelected ? 'text-emerald-400' : 'text-white/25 group-hover:text-white/45'}`} />
                      {mode.id === 'region' && (
                        <div className={`absolute inset-x-8 inset-y-6 border-2 border-dashed rounded-lg transition-colors duration-200 ${isSelected ? 'border-emerald-500/25' : 'border-white/8'}`} />
                      )}
                    </div>
                    
                    {/* Label */}
                    <div className="w-full py-3 flex flex-col items-center justify-center border-t border-white/5">
                      <span className={`text-[12px] font-medium transition-colors duration-200 ${isSelected ? 'text-white' : 'text-white/45 group-hover:text-white/65'}`}>
                        {mode.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Start Button (Bottom of Left) */}
            <div className="mt-auto">
              <button
                onClick={recording ? toggleRecording : handleStartRecording}
                className={`
                  w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[14px]
                  transition-all duration-200 
                  ${recording 
                    ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-lg shadow-red-500/25' 
                    : 'bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  }
                `}
              >
                {recording ? (
                  <>
                    <FaRegStopCircle size={16} />
                    <span>停止录制 ({formatTime(elapsed)})</span>
                  </>
                ) : (
                  <>
                    <BsRecordCircle size={16} />
                    <span>开始录制</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Section: Devices & Tools */}
          <div className="w-[280px] flex flex-col flex-shrink-0 border-l border-white/[0.06] pl-6">
            <h2 className="text-[12px] text-white/35 mb-4 font-medium tracking-wide uppercase">设备 & 工具</h2>
            
            <div className={`flex flex-col gap-3 flex-1 overflow-y-auto ${styles.macScrollbar}`}>
              
              {/* Camera Row */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleCamera}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 flex-shrink-0
                    ${cameraSettings.enabled 
                      ? 'bg-emerald-500/90 text-white shadow-md shadow-emerald-500/20' 
                      : `${styles.glassCard} text-white/35 hover:text-white/55`
                    }
                  `}
                >
                  <FiMonitor size={16} />
                </button>
                
                <Popover open={showCameraSettings} onOpenChange={setShowCameraSettings}>
                  <PopoverTrigger asChild>
                    <button className={`flex-1 h-10 px-3.5 rounded-xl flex items-center justify-between transition-all duration-200 group ${styles.glassCard}`}>
                      <span className={`text-[12px] truncate max-w-[130px] transition-colors ${cameraSettings.enabled ? 'text-white/80' : 'text-white/40'}`}>
                        {cameraSettings.enabled ? selectedCameraLabel : '摄像头已关闭'}
                      </span>
                      <FiChevronDown size={14} className="text-white/25 group-hover:text-white/45 transition-colors" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[260px] text-white p-4 rounded-2xl ${styles.glassPopover}`} side="top" align="end" sideOffset={8}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">摄像头设置</h4>
                        {availableCameras.length === 0 && (
                          <button onClick={refreshCameras} className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors">刷新</button>
                        )}
                      </div>
                      
                      {cameraSettings.enabled && cameraPreviewStream && (
                        <div className="relative w-full aspect-video bg-black/40 rounded-lg overflow-hidden ring-1 ring-white/10 hidden">
                          <video ref={cameraPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-[11px] text-white/45 font-medium">设备</label>
                        <select
                          value={cameraSettings.deviceId || ''}
                          onChange={(e) => setCameraSettings(prev => ({ ...prev, deviceId: e.target.value }))}
                          className={`w-full rounded-xl px-3 py-2.5 text-[12px] text-white ${styles.glassInput}`}
                        >
                          {availableCameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label}</option>)}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] text-white/45 font-medium">形状</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setCameraSettings(p => ({...p, shape: 'circle'}))} className={`py-2.5 text-[11px] rounded-xl transition-all ${cameraSettings.shape === 'circle' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : `${styles.glassCard} text-white/50`}`}>圆形</button>
                          <button onClick={() => setCameraSettings(p => ({...p, shape: 'rectangle'}))} className={`py-2.5 text-[11px] rounded-xl transition-all ${cameraSettings.shape === 'rectangle' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : `${styles.glassCard} text-white/50`}`}>矩形</button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Microphone Row */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleMicrophone}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 flex-shrink-0
                    ${microphoneSettings.enabled 
                      ? 'bg-emerald-500/90 text-white shadow-md shadow-emerald-500/20' 
                      : `${styles.glassCard} text-white/35 hover:text-white/55`
                    }
                  `}
                >
                  <FiMic size={16} />
                </button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`flex-1 h-10 px-3.5 rounded-xl flex items-center justify-between transition-all duration-200 group ${styles.glassCard}`}>
                      <span className={`text-[12px] truncate max-w-[130px] transition-colors ${microphoneSettings.enabled ? 'text-white/80' : 'text-white/40'}`}>
                        {microphoneSettings.enabled ? selectedMicLabel : '麦克风已关闭'}
                      </span>
                      <FiChevronDown size={14} className="text-white/25 group-hover:text-white/45 transition-colors" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[260px] text-white p-4 rounded-2xl ${styles.glassPopover}`} side="top" align="end" sideOffset={8}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">麦克风设置</h4>
                        {availableMicrophones.length === 0 && (
                          <button onClick={refreshMicrophones} className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors">刷新</button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] text-white/45 font-medium">设备</label>
                        <select
                          value={microphoneSettings.deviceId || ''}
                          onChange={(e) => setMicrophoneSettings(prev => ({ ...prev, deviceId: e.target.value }))}
                          className={`w-full rounded-xl px-3 py-2.5 text-[12px] text-white ${styles.glassInput}`}
                        >
                          {availableMicrophones.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* System Audio Row */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleSystemAudio}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 flex-shrink-0
                    ${systemAudioSettings.enabled 
                      ? 'bg-emerald-500/90 text-white shadow-md shadow-emerald-500/20' 
                      : `${styles.glassCard} text-white/35 hover:text-white/55`
                    }
                  `}
                >
                  <FiVolume2 size={16} />
                </button>
                
                <Popover open={showSystemAudioSettings} onOpenChange={setShowSystemAudioSettings}>
                  <PopoverTrigger asChild>
                    <button className={`flex-1 h-10 px-3.5 rounded-xl flex items-center justify-between transition-all duration-200 group ${styles.glassCard}`}>
                      <span className={`text-[12px] truncate max-w-[130px] transition-colors ${systemAudioSettings.enabled ? 'text-white/80' : 'text-white/40'}`}>
                        {systemAudioSettings.enabled ? `系统声音 (${systemAudioSettings.volume}%)` : '系统声音已关闭'}
                      </span>
                      <FiChevronDown size={14} className="text-white/25 group-hover:text-white/45 transition-colors" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[260px] text-white p-4 rounded-2xl ${styles.glassPopover}`} side="top" align="end" sideOffset={8}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">系统声音设置</h4>
                      </div>
                      
                      <div className="space-y-2.5">
                        <label className="text-[11px] text-white/45 font-medium">音量</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={systemAudioSettings.volume}
                            onChange={(e) => setSystemAudioSettings(prev => ({ ...prev, volume: parseInt(e.target.value) }))}
                            className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500"
                          />
                          <span className="text-[11px] text-white/50 w-9 text-right">{systemAudioSettings.volume}%</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/8">
                        <p className="text-[10px] text-white/35 leading-relaxed">
                          录制电脑播放的所有声音（如视频、音乐、系统提示音等）。
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Teleprompter Button */}
              <div className="mt-auto pt-3 border-t border-white/[0.06]">
                <button 
                  onClick={() => window.electronAPI?.showTeleprompter?.()}
                  className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 text-[12px] text-white/50 hover:text-white/70 transition-all duration-200 group ${styles.glassCard}`}
                >
                  <FiFileText size={14} className="text-white/35 group-hover:text-white/55" />
                  提词器
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
