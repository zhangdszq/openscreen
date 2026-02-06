import { useState, useRef, useEffect, useCallback } from "react";
import { fixWebmDuration } from "@fix-webm-duration/fix";

export type CameraShape = "circle" | "rectangle";
export type CameraPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CameraBorderStyle = "white" | "shadow";

export interface CameraSettings {
  enabled: boolean;
  deviceId: string | null;
  shape: CameraShape;
  size: number; // percentage of screen width (5-30%)
  position: CameraPosition;
  borderStyle: CameraBorderStyle;
  shadowIntensity: number; // 0-100, shadow strength when borderStyle is 'shadow'
}

export interface MicrophoneSettings {
  enabled: boolean;
  deviceId: string | null;
}

export interface SystemAudioSettings {
  enabled: boolean;
  volume: number; // 0-100
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

type UseScreenRecorderReturn = {
  recording: boolean;
  toggleRecording: () => void;
  cameraSettings: CameraSettings;
  setCameraSettings: React.Dispatch<React.SetStateAction<CameraSettings>>;
  availableCameras: CameraDevice[];
  refreshCameras: () => Promise<void>;
  cameraPreviewStream: MediaStream | null;
  microphoneSettings: MicrophoneSettings;
  setMicrophoneSettings: React.Dispatch<React.SetStateAction<MicrophoneSettings>>;
  availableMicrophones: MicrophoneDevice[];
  refreshMicrophones: () => Promise<void>;
  systemAudioSettings: SystemAudioSettings;
  setSystemAudioSettings: React.Dispatch<React.SetStateAction<SystemAudioSettings>>;
};

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  enabled: false,
  deviceId: null,
  shape: "circle",
  size: 15, // 15% of screen width
  position: "bottom-left",
  borderStyle: "shadow", // Mac-style shadow by default
  shadowIntensity: 60, // Default shadow intensity (0-100)
};

const DEFAULT_MICROPHONE_SETTINGS: MicrophoneSettings = {
  enabled: false, // 麦克风默认关闭，用户需手动开启
  deviceId: null,
};

// macOS 上系统声音录制需要额外权限且体验不佳，默认禁用
const isMacOS = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

const DEFAULT_SYSTEM_AUDIO_SETTINGS: SystemAudioSettings = {
  enabled: true, // 默认开启系统声音录制
  volume: 100,
};

export function useScreenRecorder(): UseScreenRecorderReturn {
  const [recording, setRecording] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [microphoneSettings, setMicrophoneSettings] = useState<MicrophoneSettings>(DEFAULT_MICROPHONE_SETTINGS);
  const [availableMicrophones, setAvailableMicrophones] = useState<MicrophoneDevice[]>([]);
  const [systemAudioSettings, setSystemAudioSettings] = useState<SystemAudioSettings>(DEFAULT_SYSTEM_AUDIO_SETTINGS);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioStream = useRef<MediaStream | null>(null); // 麦克风音频流
  const systemAudioStream = useRef<MediaStream | null>(null); // 系统声音流
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const recordingTimestamp = useRef<number>(0);
  const recordingBounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const systemAudioPermissionPrompted = useRef(false);
  const loopbackEnabledRef = useRef(false);
  const systemAudioContextRef = useRef<AudioContext | null>(null);
  
  // Camera separate recording
  const cameraRecorder = useRef<MediaRecorder | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraChunks = useRef<Blob[]>([]);

  // Target visually lossless 4K @ 60fps; fall back gracefully when hardware cannot keep up
  const TARGET_FRAME_RATE = 60;
  const TARGET_WIDTH = 3840;
  const TARGET_HEIGHT = 2160;
  const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
  const selectMimeType = () => {
    const preferred = [
      "video/webm;codecs=av1",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    return preferred.find(type => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
  };

  const computeBitrate = (width: number, height: number) => {
    const pixels = width * height;
    const highFrameRateBoost = TARGET_FRAME_RATE >= 60 ? 1.7 : 1;

    if (pixels >= FOUR_K_PIXELS) {
      return Math.round(45_000_000 * highFrameRateBoost);
    }

    if (pixels >= 2560 * 1440) {
      return Math.round(28_000_000 * highFrameRateBoost);
    }

    return Math.round(18_000_000 * highFrameRateBoost);
  };

  // Refresh available cameras list
  const refreshCameras = useCallback(async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
        s.getTracks().forEach(t => t.stop());
      }).catch(() => {});
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
        }));
      setAvailableCameras(cameras);
      
      // Auto-select first camera if none selected
      if (cameras.length > 0 && !cameraSettings.deviceId) {
        setCameraSettings(prev => ({ ...prev, deviceId: cameras[0].deviceId }));
      }
    } catch (error) {
      console.error('Failed to enumerate cameras:', error);
    }
  }, [cameraSettings.deviceId]);

  // Refresh available microphones list
  const refreshMicrophones = useCallback(async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
        s.getTracks().forEach(t => t.stop());
      }).catch(() => {});
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
        }));
      setAvailableMicrophones(microphones);
      
      // Auto-select first microphone if none selected
      if (microphones.length > 0 && !microphoneSettings.deviceId) {
        setMicrophoneSettings(prev => ({ ...prev, deviceId: microphones[0].deviceId }));
      }
    } catch (error) {
      console.error('Failed to enumerate microphones:', error);
    }
  }, [microphoneSettings.deviceId]);

  // Initialize cameras and microphones on mount
  useEffect(() => {
    refreshCameras();
    refreshMicrophones();
  }, []);

  // Manage camera preview stream (no longer stops when recording)
  useEffect(() => {
    let isMounted = true;
    
    const startPreview = async () => {
      // Stop existing preview
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(t => t.stop());
        setCameraPreviewStream(null);
      }
      
      if (cameraSettings.enabled && cameraSettings.deviceId) {
        try {
          const previewStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: cameraSettings.deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
          
          if (isMounted) {
            setCameraPreviewStream(previewStream);
          } else {
            previewStream.getTracks().forEach(t => t.stop());
          }
        } catch (error) {
          console.error('Failed to start camera preview:', error);
        }
      }
    };
    
    startPreview();
    
    return () => {
      isMounted = false;
    };
  }, [cameraSettings.enabled, cameraSettings.deviceId]);

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const stopRecording = useRef(() => {
    if (mediaRecorder.current?.state === "recording") {
      // Stop screen stream
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      
      // Stop microphone audio stream
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
      }
      
      // Stop system audio stream
      if (systemAudioStream.current) {
        systemAudioStream.current.getTracks().forEach(track => track.stop());
        systemAudioStream.current = null;
      }

      // Stop native audio capture if it was enabled
      if (loopbackEnabledRef.current) {
        window.electronAPI?.stopSystemAudioCapture?.();
        loopbackEnabledRef.current = false;
      }
      // Close audio context used for system audio
      if (systemAudioContextRef.current) {
        try {
          const ctx = systemAudioContextRef.current as any;
          if (ctx.__cleanup) ctx.__cleanup();
          if (ctx.__oscillator) ctx.__oscillator.stop();
          ctx.close();
        } catch {}
        systemAudioContextRef.current = null;
      }
      
      // Stop camera recording
      if (cameraRecorder.current?.state === "recording") {
        cameraRecorder.current.stop();
      }
      if (cameraStream.current) {
        cameraStream.current.getTracks().forEach(track => track.stop());
        cameraStream.current = null;
      }
      
      // Note: Mouse tracking is stopped in recorder.onstop to ensure
      // it captures all events until the very end
      
      // Close region indicator overlay if it was shown
      window.electronAPI?.closeRegionIndicator?.();
      
      mediaRecorder.current.stop();
      setRecording(false);

      window.electronAPI?.setRecordingState(false);
      
      // Update camera preview to unlock position/size
      window.electronAPI?.updateCameraPreview?.({ recording: false });
    }
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    if (window.electronAPI?.onStopRecordingFromTray) {
      cleanup = window.electronAPI.onStopRecordingFromTray(() => {
        stopRecording.current();
      });
    }

    return () => {
      if (cleanup) cleanup();
      
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      if (cameraRecorder.current?.state === "recording") {
        cameraRecorder.current.stop();
      }
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
      }
      if (systemAudioStream.current) {
        systemAudioStream.current.getTracks().forEach(track => track.stop());
        systemAudioStream.current = null;
      }
      if (loopbackEnabledRef.current) {
        window.electronAPI?.stopSystemAudioCapture?.();
        loopbackEnabledRef.current = false;
      }
      if (systemAudioContextRef.current) {
        try {
          const ctx = systemAudioContextRef.current as any;
          if (ctx.__cleanup) ctx.__cleanup();
          if (ctx.__oscillator) ctx.__oscillator.stop();
          ctx.close();
        } catch {}
        systemAudioContextRef.current = null;
      }
      if (cameraStream.current) {
        cameraStream.current.getTracks().forEach(track => track.stop());
        cameraStream.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const selectedSource = await window.electronAPI.getSelectedSource();
      console.log('Starting recording with source:', selectedSource);
      if (!selectedSource) {
        alert("Please select a source to record");
        return;
      }

      // Check if this is a region selection
      const isRegionSource = selectedSource.id.startsWith('region:');
      const isWindowSource = selectedSource.id.startsWith('window:');
      
      let actualSourceId = selectedSource.id;
      let regionCrop: { x: number; y: number; width: number; height: number } | null = null;
      let absoluteRegion: { x: number; y: number; width: number; height: number } | null = null;
      let regionDisplayBounds: { x: number; y: number; width: number; height: number } | null = null;
      
      if (isRegionSource) {
        // Parse region coordinates from ID: region:x,y,width,height
        const coords = selectedSource.id.replace('region:', '').split(',').map(Number);
        if (coords.length === 4) {
          absoluteRegion = { x: coords[0], y: coords[1], width: coords[2], height: coords[3] };
          console.log('Region recording (absolute):', absoluteRegion);
          
          // Get the screen that contains this region
          const screenResult = await window.electronAPI?.getScreenForRegion?.(absoluteRegion);
          if (screenResult?.success && screenResult.screenId) {
            actualSourceId = screenResult.screenId;
            console.log('Recording screen for region:', actualSourceId);
            regionDisplayBounds = screenResult.displayBounds ?? null;
          } else {
            // Fallback to primary screen (no scale info)
            const sources = await window.electronAPI.getSources({ types: ['screen'] });
            if (sources.length > 0) {
              actualSourceId = sources[0].id;
            }
          }
        }
      }
      
      console.log('Recording source ID:', actualSourceId, 'isWindow:', isWindowSource, 'isRegion:', isRegionSource);

      // 判断是否需要系统声音 - 只有开启且有可用的 sourceId 时才捕获
      const captureSystemAudio = systemAudioSettings.enabled && actualSourceId;
      console.log('System audio requested:', captureSystemAudio);

      // Get video stream using getUserMedia (more reliable for source selection)
      const getVideoStream = async () => {
        return await (navigator.mediaDevices as any).getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: actualSourceId,
              maxWidth: TARGET_WIDTH,
              maxHeight: TARGET_HEIGHT,
              maxFrameRate: TARGET_FRAME_RATE,
              minFrameRate: 30,
            },
          },
        });
      };

      // Get system audio via native AudioTee (Core Audio Taps)
      // Flow: start AudioTee → receive PCM chunks via IPC → pipe into AudioWorklet → MediaStream
      const getSystemAudioStream = async (): Promise<MediaStream | null> => {
        try {
          const SAMPLE_RATE = 48000;
          console.log('[SystemAudio] Starting native AudioTee capture...');
          
          // Step A: Start native audio capture in main process
          const result = await window.electronAPI?.startSystemAudioCapture?.({ sampleRate: SAMPLE_RATE });
          console.log('[SystemAudio] startSystemAudioCapture result:', JSON.stringify(result));
          
          if (!result?.success) {
            console.error('[SystemAudio] Failed to start AudioTee:', result?.error);
            return null;
          }
          
          loopbackEnabledRef.current = true; // track that we need to stop it later
          
          // Step B: Create AudioContext and a ScriptProcessor to inject PCM data
          const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
          
          // Create a MediaStream destination (this is what we'll record from)
          const dest = audioContext.createMediaStreamDestination();
          
          // Create an oscillator as a dummy source (required to keep ScriptProcessor alive)
          const oscillator = audioContext.createOscillator();
          const inputGain = audioContext.createGain();
          inputGain.gain.value = 0; // mute the oscillator — it's just a clock signal
          oscillator.connect(inputGain);
          
          // ScriptProcessor to inject PCM data from AudioTee
          // Buffer size 4096 at 48kHz = ~85ms per callback
          const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
          const pcmQueue: Float32Array[] = [];
          let queueOffset = 0;
          
          scriptNode.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            let written = 0;
            
            while (written < output.length && pcmQueue.length > 0) {
              const chunk = pcmQueue[0];
              const available = chunk.length - queueOffset;
              const needed = output.length - written;
              const toCopy = Math.min(available, needed);
              
              output.set(chunk.subarray(queueOffset, queueOffset + toCopy), written);
              written += toCopy;
              queueOffset += toCopy;
              
              if (queueOffset >= chunk.length) {
                pcmQueue.shift();
                queueOffset = 0;
              }
            }
            
            // Fill remaining with silence
            if (written < output.length) {
              output.fill(0, written);
            }
          };
          
          // Connect: oscillator → inputGain(muted) → scriptProcessor → dest (recording only)
          inputGain.connect(scriptNode);
          scriptNode.connect(dest);
          
          // IMPORTANT: Also connect to destination via a MUTED gain node
          // ScriptProcessor won't fire onaudioprocess unless connected to destination
          const muteGain = audioContext.createGain();
          muteGain.gain.value = 0; // completely silent — prevents feedback loop
          scriptNode.connect(muteGain);
          muteGain.connect(audioContext.destination);
          
          oscillator.start();
          
          // Step C: Listen for PCM data from main process
          let rendererChunkCount = 0;
          const cleanup = window.electronAPI?.onSystemAudioData?.((data: any) => {
            rendererChunkCount++;
            
            // Convert IPC data to proper typed array
            let int16: Int16Array;
            if (data instanceof ArrayBuffer) {
              int16 = new Int16Array(data);
            } else if (data?.buffer) {
              int16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
            } else if (ArrayBuffer.isView(data)) {
              int16 = new Int16Array((data as any).buffer);
            } else {
              // Fallback: try to create from raw data
              const uint8 = new Uint8Array(data);
              int16 = new Int16Array(uint8.buffer);
            }
            
            if (rendererChunkCount <= 3 || rendererChunkCount % 50 === 0) {
              let maxVal = 0;
              for (let i = 0; i < Math.min(int16.length, 100); i++) {
                maxVal = Math.max(maxVal, Math.abs(int16[i]));
              }
              console.log(`[SystemAudio] Renderer chunk #${rendererChunkCount}: ${int16.length} samples, maxAmp=${maxVal}, dataType=${typeof data}, isArrayBuffer=${data instanceof ArrayBuffer}`);
            }
            
            // Convert Int16 to Float32 for Web Audio
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
              float32[i] = int16[i] / 32768;
            }
            pcmQueue.push(float32);
            
            // Keep queue bounded (max ~1 second of audio)
            while (pcmQueue.length > 10) {
              pcmQueue.shift();
              queueOffset = 0;
            }
          });
          
          // Store cleanup refs for later
          (audioContext as any).__cleanup = cleanup;
          (audioContext as any).__oscillator = oscillator;
          (audioContext as any).__scriptNode = scriptNode;
          
          // Wait a bit for first chunks to arrive
          await new Promise(r => setTimeout(r, 300));
          
          const audioTrack = dest.stream.getAudioTracks()[0];
          console.log('[SystemAudio] Native audio track:', audioTrack?.label, 'state:', audioTrack?.readyState);
          
          if (audioTrack && audioTrack.readyState === 'live') {
            console.log('[SystemAudio] ✓ Got LIVE native audio track!');
            // Store audioContext ref so we can clean up later
            systemAudioContextRef.current = audioContext;
            return dest.stream;
          }
          
          console.warn('[SystemAudio] ✗ Native audio track not live');
          audioContext.close();
          if (cleanup) cleanup();
          await window.electronAPI?.stopSystemAudioCapture?.();
          loopbackEnabledRef.current = false;
          return null;
        } catch (error) {
          console.error('[SystemAudio] ✗ Native audio capture error:', error);
          if (loopbackEnabledRef.current) {
            await window.electronAPI?.stopSystemAudioCapture?.();
            loopbackEnabledRef.current = false;
          }
          return null;
        }
      };

      // Fallback for non-macOS: try getUserMedia with desktop audio
      const getDesktopAudioStream = async (): Promise<MediaStream | null> => {
        try {
          console.log('[SystemAudio] Trying getUserMedia desktop audio (non-macOS)');
          const stream = await (navigator.mediaDevices as any).getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: actualSourceId,
              },
            },
            video: false,
          });
          
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
            console.log('[SystemAudio] Got desktop audio via getUserMedia');
            return stream;
          }
          return null;
        } catch (error) {
          console.warn('[SystemAudio] getUserMedia desktop audio failed:', error);
          return null;
        }
      };

      let mediaStream: MediaStream;
      let systemAudioTrack: MediaStreamTrack | null = null;
      let pendingSystemAudioStream: MediaStream | null = null;
      const shouldPromptSystemAudioPermission = async () => {
        try {
          const statusResult = await window.electronAPI?.getScreenCaptureStatus?.();
          const status = statusResult?.status;
          console.log('[SystemAudio] Screen capture permission status:', status);
          if (status === 'granted') {
            return false;
          }
          // Only prompt for explicit non-granted states
          if (status === 'denied' || status === 'not-determined' || status === 'restricted') {
            return true;
          }
          // Unknown or missing status: avoid prompting to reduce false positives
          return false;
        } catch (error) {
          console.warn('[SystemAudio] Failed to get screen capture status:', error);
          return false;
        }
      };
      
      try {
        // Step 1: Get system audio first on macOS (avoid parallel capture sessions)
        if (captureSystemAudio && isMacOS) {
          console.log('[SystemAudio] Attempting to capture system audio (macOS, first)...');
          pendingSystemAudioStream = await getSystemAudioStream();
          if (!pendingSystemAudioStream) {
            console.warn('[SystemAudio] Could not get system audio (macOS)');
            if (!systemAudioPermissionPrompted.current) {
              const shouldPrompt = await shouldPromptSystemAudioPermission();
              if (shouldPrompt) {
                systemAudioPermissionPrompted.current = true;
                const shouldOpen = confirm(
                  '无法捕获系统声音。这可能是因为：\n' +
                  '1. 需要授予"屏幕与系统录音"权限\n' +
                  '2. 授权后需要完全重启应用\n\n' +
                  '是否打开系统设置？'
                );
                if (shouldOpen) {
                  await window.electronAPI?.openScreenRecordingSettings?.();
                }
              } else {
                console.warn('[SystemAudio] Permission is granted but audio not available.');
              }
            }
          }
        }

        // Step 2: Get video stream
        console.log('[SystemAudio] Getting video stream...');
        mediaStream = await getVideoStream();
        console.log('[SystemAudio] Video stream obtained');
        
        // Step 3: Try to get system audio if requested (non-macOS or if not already attempted)
        if (captureSystemAudio && !isMacOS) {
          console.log('[SystemAudio] Attempting to capture system audio (non-macOS)...');
          
          // Try getDisplayMedia first (macOS loopback)
          let audioStream = await getSystemAudioStream();
          
          // If that failed, try getUserMedia (Windows/Linux)
          if (!audioStream) {
            audioStream = await getDesktopAudioStream();
          }
          pendingSystemAudioStream = audioStream;
        }

        if (captureSystemAudio && pendingSystemAudioStream) {
          const audioTrack = pendingSystemAudioStream.getAudioTracks()[0];
          if (audioTrack && audioTrack.readyState === 'live') {
            mediaStream.addTrack(audioTrack);
            systemAudioTrack = audioTrack;
            console.log('[SystemAudio] System audio track added to stream');
          } else {
            console.warn('[SystemAudio] Pending audio track not live:', audioTrack?.readyState);
          }
        }
      } catch (error: any) {
        console.error('[SystemAudio] Error getting streams:', error);
        throw error;
      }
      stream.current = mediaStream;

      if (captureSystemAudio) {
        const audioTracks = mediaStream.getAudioTracks();
        const hasSystemAudio = audioTracks.length > 0;
        // Check if audio track is actually live (not ended)
        const hasLiveAudio = hasSystemAudio && audioTracks.some(track => track.readyState === 'live');
        
        console.log('[SystemAudio] Audio track check:');
        audioTracks.forEach((track, i) => {
          console.log(`[SystemAudio]   Track ${i}:`, {
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings?.(),
          });
        });
        console.log('[SystemAudio] Has audio tracks:', hasSystemAudio);
        console.log('[SystemAudio] Has LIVE audio tracks:', hasLiveAudio);
        
        if (!hasLiveAudio) {
          console.warn('[SystemAudio] No live audio tracks available!');
          if (!systemAudioPermissionPrompted.current) {
            const shouldPrompt = await shouldPromptSystemAudioPermission();
            if (shouldPrompt) {
              systemAudioPermissionPrompted.current = true;
              const shouldOpen = confirm(
                '系统声音未授权或被系统拒绝，已改为仅录屏。\n是否现在打开系统设置进行授权？'
              );
              if (shouldOpen) {
                await window.electronAPI?.openScreenRecordingSettings?.();
              }
            } else {
              console.warn('[SystemAudio] Permission is granted but audio track not live.');
            }
          }
          setSystemAudioSettings(prev => ({ ...prev, enabled: false }));
          // Remove dead audio tracks
          audioTracks.forEach(track => {
            if (track.readyState === 'ended') {
              mediaStream.removeTrack(track);
            }
          });
        }
      }
      
      // 如果成功捕获了系统声音，保存引用（用于后续调节音量）
      if (captureSystemAudio && mediaStream.getAudioTracks().length > 0) {
        // 创建一个只包含系统音频轨道的流用于引用管理
        systemAudioStream.current = new MediaStream(mediaStream.getAudioTracks());
        console.log('系统声音捕获成功');
        
        // 应用音量设置
        if (systemAudioSettings.volume < 100) {
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(systemAudioStream.current);
          const gainNode = audioContext.createGain();
          gainNode.gain.value = systemAudioSettings.volume / 100;
          const destination = audioContext.createMediaStreamDestination();
          source.connect(gainNode);
          gainNode.connect(destination);
          
          // 替换原始音轨为调节后的音轨
          const originalAudioTracks = mediaStream.getAudioTracks();
          originalAudioTracks.forEach(track => mediaStream.removeTrack(track));
          destination.stream.getAudioTracks().forEach(track => mediaStream.addTrack(track));
        }
      }
      if (!stream.current) {
        throw new Error("Media stream is not available.");
      }
      const videoTrack = stream.current.getVideoTracks()[0];
      try {
        await videoTrack.applyConstraints({
          frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
          width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
        });
      } catch (error) {
        console.warn("Unable to lock 4K/60fps constraints, using best available track settings.", error);
      }

      let { width = 1920, height = 1080, frameRate = TARGET_FRAME_RATE } = videoTrack.getSettings();
      const videoPixelWidth = width || 1920;
      const videoPixelHeight = height || 1080;

      // Get source bounds for camera positioning and mouse tracking
      let sourceBounds: { x: number; y: number; width: number; height: number } | null = null;
      try {
        const boundsResult = await window.electronAPI.getSourceBounds?.(
          selectedSource.id, 
          selectedSource.name,
          { width, height }
        );
        if (boundsResult?.success && boundsResult.bounds) {
          sourceBounds = boundsResult.bounds;
        }
      } catch (error) {
        console.warn('Failed to get source bounds:', error);
      }

      // Camera preview position is no longer adjusted when recording starts
      // The user controls the camera position before recording begins

      // Start mouse tracking for auto-zoom feature
      if (sourceBounds && window.electronAPI?.startMouseTracking) {
        try {
          recordingBounds.current = sourceBounds;
          await window.electronAPI.startMouseTracking(sourceBounds);
          console.log('Mouse tracking started with bounds:', sourceBounds);
        } catch (error) {
          console.warn('Failed to start mouse tracking:', error);
        }
      }
      
      // Compute region crop in video pixel space after we know actual video size
      if (absoluteRegion) {
        if (regionDisplayBounds) {
          const ratioX = videoPixelWidth / regionDisplayBounds.width;
          const ratioY = videoPixelHeight / regionDisplayBounds.height;
          regionCrop = {
            x: Math.round((absoluteRegion.x - regionDisplayBounds.x) * ratioX),
            y: Math.round((absoluteRegion.y - regionDisplayBounds.y) * ratioY),
            width: Math.round(absoluteRegion.width * ratioX),
            height: Math.round(absoluteRegion.height * ratioY),
          };
          console.log('Region relative to display (video scaled):', regionCrop);
        } else {
          regionCrop = absoluteRegion;
        }
      }

      // Ensure dimensions are divisible by 2 for VP9/AV1 codec compatibility
      width = Math.floor(width / 2) * 2;
      height = Math.floor(height / 2) * 2;
      
      const videoBitsPerSecond = computeBitrate(width, height);
      const mimeType = selectMimeType();

      // Use the screen stream directly (no camera compositing)
      const recordingStream = stream.current;

      // 获取麦克风流并混音
      if (microphoneSettings.enabled && microphoneSettings.deviceId) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: microphoneSettings.deviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          audioStream.current = micStream;
          
          // 检查是否需要混音（同时有系统声音和麦克风）
          const hasSystemAudio = recordingStream.getAudioTracks().length > 0;
          
          if (hasSystemAudio) {
            // 需要混音：使用 AudioContext 合并系统声音和麦克风
            try {
              const audioContext = new AudioContext();
              const systemSource = audioContext.createMediaStreamSource(
                new MediaStream(recordingStream.getAudioTracks())
              );
              const micSource = audioContext.createMediaStreamSource(micStream);
              const destination = audioContext.createMediaStreamDestination();
              
              // 创建增益节点来控制各自的音量
              const systemGain = audioContext.createGain();
              const micGain = audioContext.createGain();
              
              systemGain.gain.value = systemAudioSettings.volume / 100;
              micGain.gain.value = 1.0; // 麦克风音量可以后续添加控制
              
              // 连接音频节点
              systemSource.connect(systemGain);
              micSource.connect(micGain);
              systemGain.connect(destination);
              micGain.connect(destination);
              
              // 移除原有的系统声音轨道，添加混音后的轨道
              recordingStream.getAudioTracks().forEach(track => {
                recordingStream.removeTrack(track);
              });
              destination.stream.getAudioTracks().forEach(track => {
                recordingStream.addTrack(track);
              });
              
              console.log('系统声音与麦克风混音成功');
            } catch (mixError) {
              console.warn('混音失败，将单独添加麦克风音轨:', mixError);
              // 混音失败时，直接添加麦克风音轨
              micStream.getAudioTracks().forEach(track => {
                recordingStream.addTrack(track);
              });
            }
          } else {
            // 没有系统声音，直接添加麦克风音轨
            micStream.getAudioTracks().forEach(track => {
              recordingStream.addTrack(track);
            });
          }
        } catch (error) {
          console.warn('获取麦克风流失败，录制将不包含麦克风音频:', error);
        }
      }

      const hasAudio = recordingStream.getAudioTracks().length > 0;
      console.log('[SystemAudio] Final recording stream before MediaRecorder:');
      console.log('[SystemAudio]   - Video tracks:', recordingStream.getVideoTracks().length);
      console.log('[SystemAudio]   - Audio tracks:', recordingStream.getAudioTracks().length);
      if (hasAudio) {
        recordingStream.getAudioTracks().forEach((track, i) => {
          console.log(`[SystemAudio]   - Audio track ${i}:`, {
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          });
        });
      }
      console.log(
        `Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
          videoBitsPerSecond / 1_000_000
        )} Mbps${hasAudio ? ' (with audio)' : ''}`
      );
      
      chunks.current = [];
      const recorder = new MediaRecorder(recordingStream, {
        mimeType,
        videoBitsPerSecond,
        audioBitsPerSecond: hasAudio ? 128000 : undefined, // 128kbps audio
      });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        console.log('[SystemAudio] MediaRecorder stopped');
        console.log('[SystemAudio] Chunks collected:', chunks.current.length);
        console.log('[SystemAudio] Total size:', chunks.current.reduce((acc, chunk) => acc + chunk.size, 0), 'bytes');
        
        stream.current = null;
        
        // Stop mouse tracking and get the data
        let mouseTrackData = null;
        if (window.electronAPI?.stopMouseTracking) {
          try {
            const result = await window.electronAPI.stopMouseTracking();
            if (result.success && result.data) {
              mouseTrackData = result.data;
              console.log(`Mouse tracking stopped, captured ${mouseTrackData.events?.length || 0} events`);
            }
          } catch (error) {
            console.warn('Failed to stop mouse tracking:', error);
          }
        }
        
        if (chunks.current.length === 0) return;
        const duration = Date.now() - startTime.current;
        const recordedChunks = chunks.current;
        const buggyBlob = new Blob(recordedChunks, { type: mimeType });
        // Clear chunks early to free memory immediately after blob creation
        chunks.current = [];
        const timestamp = recordingTimestamp.current || Date.now();
        const videoFileName = `recording-${timestamp}.webm`;

        try {
          const videoBlob = await fixWebmDuration(buggyBlob, duration);
          const arrayBuffer = await videoBlob.arrayBuffer();
          const videoResult = await window.electronAPI.storeRecordedVideo(arrayBuffer, videoFileName);
          if (!videoResult.success) {
            console.error('Failed to store video:', videoResult.message);
            return;
          }

          // Save mouse events data
          if (mouseTrackData && window.electronAPI?.saveMouseEvents) {
            const mouseFileName = `recording-${timestamp}.mouse.json`;
            try {
              await window.electronAPI.saveMouseEvents(mouseTrackData, mouseFileName);
              console.log('Mouse events saved:', mouseFileName);
            } catch (error) {
              console.warn('Failed to save mouse events:', error);
            }
          }
          
          // Save region crop info if this was a region recording
          if (regionCrop && window.electronAPI?.saveRegionInfo) {
            const regionFileName = `recording-${timestamp}.region.json`;
            try {
              await window.electronAPI.saveRegionInfo(regionCrop, regionFileName);
              console.log('Region info saved:', regionFileName);
            } catch (error) {
              console.warn('Failed to save region info:', error);
            }
          }

          if (videoResult.path) {
            await window.electronAPI.setCurrentVideoPath(videoResult.path);
          }

          await window.electronAPI.switchToEditor();
        } catch (error) {
          console.error('Error saving recording:', error);
        }
      };
      recorder.onerror = () => setRecording(false);
      
      // Start camera recording separately if camera is enabled
      if (cameraSettings.enabled && cameraSettings.deviceId) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: cameraSettings.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
          cameraStream.current = camStream;
          
          cameraChunks.current = [];
          const camRecorder = new MediaRecorder(camStream, {
            mimeType,
            videoBitsPerSecond: 5_000_000, // 5 Mbps for camera
          });
          cameraRecorder.current = camRecorder;
          
          camRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) cameraChunks.current.push(e.data);
          };
          
          camRecorder.onstop = async () => {
            if (cameraChunks.current.length === 0) return;
            const duration = Date.now() - startTime.current;
            const recordedChunks = cameraChunks.current;
            const buggyBlob = new Blob(recordedChunks, { type: mimeType });
            cameraChunks.current = [];
            const timestamp = recordingTimestamp.current || Date.now();
            const cameraFileName = `recording-${timestamp}.camera.webm`;
            
            try {
              const cameraBlob = await fixWebmDuration(buggyBlob, duration);
              const arrayBuffer = await cameraBlob.arrayBuffer();
              const result = await window.electronAPI.storeRecordedVideo(arrayBuffer, cameraFileName);
              if (result.success) {
                console.log('Camera video saved:', cameraFileName);
              } else {
                console.error('Failed to store camera video:', result.message);
              }
            } catch (error) {
              console.error('Error saving camera recording:', error);
            }
          };
          
          camRecorder.start(1000);
          console.log('Camera recording started separately');
        } catch (error) {
          console.warn('Failed to start camera recording:', error);
        }
      }
      
      recorder.start(1000);
      startTime.current = Date.now();
      recordingTimestamp.current = Date.now();
      setRecording(true);
      window.electronAPI?.setRecordingState(true);
      
      // Update region indicator to recording state (indicator is already shown from selection)
      if (isRegionSource) {
        window.electronAPI?.updateRegionIndicator?.({ isRecording: true });
        console.log('Region indicator updated to recording state');
      }
      
      // Notify camera preview of recording state
      // Camera window uses setContentProtection(true) so it won't be captured
      // even during full screen recording (Windows 10 2004+ and macOS)
      if (cameraSettings.enabled) {
        window.electronAPI?.updateCameraPreview?.({ recording: true });
        console.log('Camera preview will not be captured (content protection enabled)');
      }
    } catch (error) {
      console.error('录制启动失败:', error);
      setRecording(false);
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
      }
      if (systemAudioStream.current) {
        systemAudioStream.current.getTracks().forEach(track => track.stop());
        systemAudioStream.current = null;
      }
    }
  };

  const toggleRecording = () => {
    recording ? stopRecording.current() : startRecording();
  };

  return { 
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
    systemAudioSettings,
    setSystemAudioSettings,
  };
}
