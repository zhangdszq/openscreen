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
};

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  enabled: false,
  deviceId: null,
  shape: "circle",
  size: 15, // 15% of screen width
  position: "bottom-right",
  borderStyle: "shadow", // Mac-style shadow by default
  shadowIntensity: 60, // Default shadow intensity (0-100)
};

const DEFAULT_MICROPHONE_SETTINGS: MicrophoneSettings = {
  enabled: false,
  deviceId: null,
};

export function useScreenRecorder(): UseScreenRecorderReturn {
  const [recording, setRecording] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [microphoneSettings, setMicrophoneSettings] = useState<MicrophoneSettings>(DEFAULT_MICROPHONE_SETTINGS);
  const [availableMicrophones, setAvailableMicrophones] = useState<MicrophoneDevice[]>([]);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const recordingTimestamp = useRef<number>(0);
  const recordingBounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

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
      
      // Stop audio stream
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
      }
      
      // Note: Mouse tracking is stopped in recorder.onstop to ensure
      // it captures all events until the very end
      
      mediaRecorder.current.stop();
      setRecording(false);

      window.electronAPI?.setRecordingState(false);
      
      // Update camera preview to hide recording indicator
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
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
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

      // Determine the actual source to record
      // If camera is enabled and source is a window, record the screen instead
      // so the camera preview window will be included in the recording
      let actualSourceId = selectedSource.id;
      const isWindowSource = selectedSource.id.startsWith('window:');
      console.log('Is window source:', isWindowSource, 'Camera enabled:', cameraSettings.enabled);
      
      if (isWindowSource && cameraSettings.enabled) {
        // Get the screen that contains this window
        const screenSourceResult = await window.electronAPI?.getScreenForWindow?.(selectedSource.name);
        console.log('Screen for window result:', screenSourceResult);
        if (screenSourceResult?.success && screenSourceResult.screenId) {
          actualSourceId = screenSourceResult.screenId;
          console.log('Camera enabled with window source, switching to screen recording:', actualSourceId);
        }
      }
      
      console.log('Actual source ID to record:', actualSourceId);

      const mediaStream = await (navigator.mediaDevices as any).getUserMedia({
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
      stream.current = mediaStream;
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
      
      // Ensure dimensions are divisible by 2 for VP9/AV1 codec compatibility
      width = Math.floor(width / 2) * 2;
      height = Math.floor(height / 2) * 2;
      
      const videoBitsPerSecond = computeBitrate(width, height);
      const mimeType = selectMimeType();

      // Use the screen stream directly (no camera compositing)
      const recordingStream = stream.current;

      // Get microphone stream if enabled
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
          
          // Add audio tracks to recording stream
          micStream.getAudioTracks().forEach(track => {
            recordingStream.addTrack(track);
          });
        } catch (error) {
          console.warn('Failed to get microphone stream, recording without audio:', error);
        }
      }

      const hasAudio = recordingStream.getAudioTracks().length > 0;
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

          if (videoResult.path) {
            await window.electronAPI.setCurrentVideoPath(videoResult.path);
          }

          await window.electronAPI.switchToEditor();
        } catch (error) {
          console.error('Error saving recording:', error);
        }
      };
      recorder.onerror = () => setRecording(false);
      recorder.start(1000);
      startTime.current = Date.now();
      recordingTimestamp.current = Date.now();
      setRecording(true);
      window.electronAPI?.setRecordingState(true);
      
      // Notify camera preview of recording state (for locking position/size)
      if (cameraSettings.enabled) {
        window.electronAPI?.updateCameraPreview?.({ recording: true });
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecording(false);
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        audioStream.current = null;
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
  };
}
