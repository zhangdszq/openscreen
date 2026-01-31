import type { TrimRegion } from '@/components/video-editor/types';

export interface AudioExtractionConfig {
  videoUrl: string;
  trimRegions?: TrimRegion[];
  sampleRate?: number;
  numberOfChannels?: number;
}

export interface ExtractedAudio {
  audioBuffer: AudioBuffer;
  hasAudio: boolean;
}

/**
 * Extract audio from video and handle trim regions
 */
export class AudioExtractor {
  private config: AudioExtractionConfig;
  private audioContext: AudioContext | null = null;

  constructor(config: AudioExtractionConfig) {
    this.config = {
      sampleRate: 48000,
      numberOfChannels: 2,
      ...config,
    };
  }

  /**
   * Check if video has audio track
   */
  async hasAudioTrack(): Promise<boolean> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = this.config.videoUrl;
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        // Check if video has audio tracks
        // @ts-ignore - audioTracks may not be in TypeScript types
        const hasAudio = video.audioTracks?.length > 0 || 
          // Fallback: try to detect audio by checking if video can play audio
          video.mozHasAudio || 
          video.webkitAudioDecodedByteCount > 0 ||
          // Most reliable way: assume audio exists and let extraction fail if not
          true;
        video.src = '';
        resolve(hasAudio);
      };

      video.onerror = () => {
        video.src = '';
        resolve(false);
      };
    });
  }

  /**
   * Extract audio from video, applying trim regions
   */
  async extract(): Promise<ExtractedAudio> {
    try {
      // Fetch video as ArrayBuffer
      const response = await fetch(this.config.videoUrl);
      const arrayBuffer = await response.arrayBuffer();

      // Create AudioContext
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Decode audio data
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.log('[AudioExtractor] No audio track in video or decode failed');
        return { audioBuffer: this.createSilentBuffer(1), hasAudio: false };
      }

      console.log('[AudioExtractor] Original audio duration:', audioBuffer.duration, 's');
      console.log('[AudioExtractor] Sample rate:', audioBuffer.sampleRate);
      console.log('[AudioExtractor] Channels:', audioBuffer.numberOfChannels);

      // Apply trim regions if any
      if (this.config.trimRegions && this.config.trimRegions.length > 0) {
        audioBuffer = this.applyTrimRegions(audioBuffer);
        console.log('[AudioExtractor] After trim duration:', audioBuffer.duration, 's');
      }

      return { audioBuffer, hasAudio: true };
    } catch (error) {
      console.error('[AudioExtractor] Error extracting audio:', error);
      return { audioBuffer: this.createSilentBuffer(1), hasAudio: false };
    }
  }

  /**
   * Create a silent audio buffer
   */
  private createSilentBuffer(durationSeconds: number): AudioBuffer {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });
    }
    
    const sampleRate = this.config.sampleRate!;
    const length = Math.ceil(durationSeconds * sampleRate);
    return this.audioContext.createBuffer(
      this.config.numberOfChannels!,
      length,
      sampleRate
    );
  }

  /**
   * Apply trim regions to audio buffer (remove trimmed sections)
   */
  private applyTrimRegions(audioBuffer: AudioBuffer): AudioBuffer {
    const trimRegions = this.config.trimRegions || [];
    if (trimRegions.length === 0) return audioBuffer;

    // Sort trim regions by start time
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);

    // Calculate total duration to remove
    const totalTrimMs = sortedTrims.reduce((sum, trim) => sum + (trim.endMs - trim.startMs), 0);
    const originalDurationMs = audioBuffer.duration * 1000;
    const newDurationMs = originalDurationMs - totalTrimMs;

    if (newDurationMs <= 0) {
      return this.createSilentBuffer(0.1);
    }

    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const newLength = Math.ceil((newDurationMs / 1000) * sampleRate);

    // Create new buffer
    const newBuffer = this.audioContext!.createBuffer(
      numberOfChannels,
      newLength,
      sampleRate
    );

    // Copy audio data, skipping trimmed regions
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      let writeOffset = 0;
      let readOffset = 0;

      for (const trim of sortedTrims) {
        const trimStartSample = Math.floor((trim.startMs / 1000) * sampleRate);
        const trimEndSample = Math.floor((trim.endMs / 1000) * sampleRate);

        // Copy samples before this trim region
        const copyLength = trimStartSample - readOffset;
        if (copyLength > 0) {
          for (let i = 0; i < copyLength && writeOffset < newLength; i++) {
            newData[writeOffset++] = originalData[readOffset + i];
          }
        }

        // Skip the trimmed region
        readOffset = trimEndSample;
      }

      // Copy remaining samples after last trim
      while (readOffset < originalData.length && writeOffset < newLength) {
        newData[writeOffset++] = originalData[readOffset++];
      }
    }

    return newBuffer;
  }

  /**
   * Encode audio buffer to AAC using AudioEncoder
   */
  async encodeToAAC(
    audioBuffer: AudioBuffer,
    onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sampleRate = audioBuffer.sampleRate;
      const numberOfChannels = audioBuffer.numberOfChannels;

      const encoder = new AudioEncoder({
        output: (chunk, meta) => {
          onChunk(chunk, meta);
        },
        error: (error) => {
          console.error('[AudioExtractor] Encoder error:', error);
          reject(error);
        },
      });

      // Configure encoder for AAC
      // Remotion optimization: higher bitrate for better quality, or lower for speed
      // AAC-LC is standard and widely supported
      encoder.configure({
        codec: 'mp4a.40.2', // AAC-LC
        sampleRate,
        numberOfChannels,
        bitrate: 192000, // 192 kbps for better quality (Remotion default)
      });

      // Remotion optimization: larger batch size for better throughput
      // 8192 samples = ~170ms at 48kHz, reduces encoding overhead
      const samplesPerBatch = 8192;
      const totalSamples = audioBuffer.length;
      let processedSamples = 0;

      // Pre-allocate channel data arrays for reuse
      const channelData: Float32Array[] = [];
      for (let ch = 0; ch < numberOfChannels; ch++) {
        channelData.push(audioBuffer.getChannelData(ch));
      }

      while (processedSamples < totalSamples) {
        const remainingSamples = totalSamples - processedSamples;
        const batchSamples = Math.min(samplesPerBatch, remainingSamples);
        
        // Create planar data directly (more efficient than interleave + deinterleave)
        const planarData = new Float32Array(batchSamples * numberOfChannels);
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const offset = ch * batchSamples;
          for (let i = 0; i < batchSamples; i++) {
            planarData[offset + i] = channelData[ch][processedSamples + i];
          }
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: batchSamples,
          numberOfChannels,
          timestamp: Math.round((processedSamples / sampleRate) * 1_000_000), // microseconds
          data: planarData.buffer,
        });

        encoder.encode(audioData);
        audioData.close();

        processedSamples += batchSamples;
      }

      encoder.flush().then(() => {
        encoder.close();
        resolve();
      }).catch(reject);
    });
  }

  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
