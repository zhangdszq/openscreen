/**
 * WebCodecs-based Video Decoder using Mediabunny for demuxing
 * 
 * Uses Mediabunny's EncodedPacketSink for demuxing and WebCodecs VideoDecoder
 * for hardware-accelerated decoding. Supports MP4, WebM, and fragmented MP4.
 */

import { 
  Input, 
  ALL_FORMATS, 
  BlobSource,
  EncodedPacketSink,
  type InputVideoTrack,
  type EncodedPacket,
} from 'mediabunny';

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number; // in seconds
  frameCount: number;
  frameRate: number;
  codec: string;
}

export interface WebCodecsDecoderConfig {
  /** Called on decode progress */
  onProgress?: (progress: number) => void;
  /** Called on decode error */
  onError?: (error: Error) => void;
}

/**
 * High-performance video decoder using Mediabunny demuxer + WebCodecs decoder
 */
export class WebCodecsVideoDecoder {
  private input: Input | null = null;
  private videoTrack: InputVideoTrack | null = null;
  private packetSink: EncodedPacketSink | null = null;
  private decoder: VideoDecoder | null = null;
  private metadata: VideoMetadata | null = null;
  private config: WebCodecsDecoderConfig;
  private videoBlob: Blob | null = null;
  private decoderConfig: VideoDecoderConfig | null = null;
  
  // Frame queue for decoded frames
  private frameQueue: VideoFrame[] = [];
  private totalPackets = 0;
  private decodedCount = 0;
  
  constructor(config: WebCodecsDecoderConfig = {}) {
    this.config = config;
  }

  /**
   * Check if WebCodecs decoding is supported
   */
  static async isSupported(): Promise<boolean> {
    if (typeof VideoDecoder === 'undefined') {
      return false;
    }
    
    try {
      const support = await VideoDecoder.isConfigSupported({
        codec: 'avc1.42E01E',
      });
      return support.supported === true;
    } catch {
      return false;
    }
  }

  /**
   * Load and parse video file, extract metadata
   */
  async loadVideo(videoUrl: string): Promise<VideoMetadata> {
    console.log('[WebCodecsDecoder] Loading video:', videoUrl);
    
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`);
    }
    
    // Determine MIME type
    let mimeType = response.headers.get('content-type') || '';
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (videoUrl.endsWith('.mp4')) mimeType = 'video/mp4';
      else if (videoUrl.endsWith('.webm')) mimeType = 'video/webm';
      else if (videoUrl.endsWith('.mov')) mimeType = 'video/quicktime';
    }
    
    const arrayBuffer = await response.arrayBuffer();
    this.videoBlob = new Blob([arrayBuffer], { type: mimeType });
    console.log('[WebCodecsDecoder] Video size:', (this.videoBlob.size / 1024 / 1024).toFixed(2), 'MB, type:', mimeType);
    
    const fileName = videoUrl.split('/').pop() || 'video.mp4';
    const file = new File([this.videoBlob], fileName, { type: mimeType });
    
    // Create Mediabunny Input
    this.input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });
    
    // Get video track
    this.videoTrack = await this.input.getPrimaryVideoTrack();
    if (!this.videoTrack) {
      throw new Error('No video track found');
    }
    
    // Get duration and frame rate
    const duration = await this.videoTrack.computeDuration();
    const packetStats = await this.videoTrack.computePacketStats(100);
    const frameRate = packetStats?.averagePacketRate || 30;
    const frameCount = Math.ceil(duration * frameRate);
    
    // Get decoder config
    this.decoderConfig = await this.videoTrack.getDecoderConfig();
    
    if (!this.decoderConfig) {
      throw new Error('Failed to get decoder config');
    }
    
    const decoderConfig = this.decoderConfig;
    
    this.metadata = {
      width: this.videoTrack.displayWidth,
      height: this.videoTrack.displayHeight,
      duration,
      frameCount,
      frameRate: Math.round(frameRate),
      codec: decoderConfig.codec,
    };
    
    console.log('[WebCodecsDecoder] Metadata:', JSON.stringify(this.metadata));
    console.log('[WebCodecsDecoder] Decoder config:', JSON.stringify(decoderConfig));
    
    // Check codec support - AV1 has issues
    if (decoderConfig.codec.startsWith('av01')) {
      throw new Error('AV1 codec not fully supported, falling back to VideoElement');
    }
    
    // Verify WebCodecs supports this config
    const support = await VideoDecoder.isConfigSupported(decoderConfig);
    if (!support.supported) {
      throw new Error(`Codec ${decoderConfig.codec} not supported by WebCodecs`);
    }
    
    // Create packet sink for encoded packet extraction
    this.packetSink = new EncodedPacketSink(this.videoTrack);
    
    // Initialize WebCodecs decoder
    this.initDecoder();
    
    return this.metadata;
  }

  /**
   * Initialize WebCodecs VideoDecoder
   */
  private initDecoder(): void {
    if (!this.decoderConfig) {
      throw new Error('Decoder config not available');
    }
    
    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        this.decodedCount++;
        // Queue the frame
        this.frameQueue.push(frame);
        
        // Log progress every 10 frames
        if (this.decodedCount % 10 === 0 || this.decodedCount === 1) {
          console.log(`[WebCodecsDecoder] Decoded frame ${this.decodedCount}`);
        }
        
        // Report progress
        if (this.config.onProgress && this.totalPackets > 0) {
          this.config.onProgress(this.decodedCount / this.totalPackets);
        }
      },
      error: (error: DOMException) => {
        console.error('[WebCodecsDecoder] VideoDecoder error:', error.name, error.message);
        if (this.config.onError) {
          this.config.onError(error);
        }
      },
    });
    
    this.decoder.configure(this.decoderConfig);
    console.log('[WebCodecsDecoder] Decoder configured');
  }

  /**
   * Get metadata
   */
  getMetadata(): VideoMetadata | null {
    return this.metadata;
  }

  /**
   * Create an async iterator for all frames
   * Decodes all packets first, then yields frames
   */
  async *frames(): AsyncGenerator<VideoFrame, void, unknown> {
    if (!this.packetSink || !this.decoder) {
      throw new Error('Video not loaded');
    }
    
    console.log('[WebCodecsDecoder] Starting frame iteration');
    
    // Decode all packets first (synchronously wait)
    await this.decodeAllPackets();
    
    console.log('[WebCodecsDecoder] Yielding', this.frameQueue.length, 'frames');
    
    // Yield all decoded frames
    while (this.frameQueue.length > 0) {
      const frame = this.frameQueue.shift();
      if (frame) {
        yield frame;
      }
    }
  }

  /**
   * Decode all packets
   */
  private async decodeAllPackets(): Promise<void> {
    if (!this.packetSink || !this.decoder) return;
    
    try {
      // Collect all packets first
      console.log('[WebCodecsDecoder] Collecting packets...');
      const packets: EncodedPacket[] = [];
      
      try {
        for await (const packet of this.packetSink.packets()) {
          packets.push(packet);
        }
      } catch (packetError) {
        console.error('[WebCodecsDecoder] Error collecting packets:', packetError);
        throw packetError;
      }
      
      this.totalPackets = packets.length;
      console.log('[WebCodecsDecoder] Total packets:', packets.length);
      
      if (packets.length === 0) {
        console.warn('[WebCodecsDecoder] No packets found!');
        return;
      }
      
      // Decode all packets
      console.log('[WebCodecsDecoder] Decoding packets...');
      for (const packet of packets) {
        if (!this.decoder || this.decoder.state !== 'configured') {
          console.warn('[WebCodecsDecoder] Decoder not ready, state:', this.decoder?.state);
          break;
        }
        
        try {
          const chunk = packet.toEncodedVideoChunk();
          this.decoder.decode(chunk);
        } catch (decodeError) {
          console.error('[WebCodecsDecoder] Error decoding packet:', decodeError);
        }
      }
      
      // Flush decoder and wait for all frames
      if (this.decoder && this.decoder.state === 'configured') {
        console.log('[WebCodecsDecoder] Flushing decoder...');
        await this.decoder.flush();
        console.log('[WebCodecsDecoder] Flush complete');
      }
      
      console.log('[WebCodecsDecoder] Decode complete, frames:', this.frameQueue.length);
    } catch (error) {
      console.error('[WebCodecsDecoder] Decode error:', error);
      throw error;
    }
  }

  /**
   * Get a frame at specific timestamp (less efficient, use frames() when possible)
   */
  async getFrameAtTimestamp(timestampSec: number): Promise<VideoFrame | null> {
    if (!this.packetSink || !this.decoder) {
      throw new Error('Video not loaded');
    }
    
    // Get the packet at this timestamp
    const packet = await this.packetSink.getPacket(timestampSec);
    if (!packet) return null;
    
    // For non-key frames, we need to decode from the previous key frame
    // For simplicity, just decode this packet (may produce artifacts for non-key frames)
    return new Promise((resolve) => {
      const tempDecoder = new VideoDecoder({
        output: (frame) => {
          resolve(frame);
          tempDecoder.close();
        },
        error: () => {
          resolve(null);
          tempDecoder.close();
        },
      });
      
      tempDecoder.configure(this.decoderConfig!);
      tempDecoder.decode(packet.toEncodedVideoChunk());
      tempDecoder.flush();
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Close all queued frames
    for (const frame of this.frameQueue) {
      try {
        frame.close();
      } catch {
        // Ignore errors closing frames
      }
    }
    this.frameQueue = [];
    
    // Close decoder
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch {
        // Ignore errors closing decoder
      }
    }
    this.decoder = null;
    
    this.packetSink = null;
    this.videoTrack = null;
    this.input = null;
    this.metadata = null;
    this.videoBlob = null;
    this.decoderConfig = null;
    this.totalPackets = 0;
    this.decodedCount = 0;
  }
}

/**
 * Check if a video URL can be decoded using WebCodecs
 */
export async function canDecodeWithWebCodecs(videoUrl: string): Promise<boolean> {
  if (!(await WebCodecsVideoDecoder.isSupported())) {
    return false;
  }
  
  try {
    const response = await fetch(videoUrl, { method: 'HEAD' });
    if (!response.ok) return false;
    
    const contentType = response.headers.get('content-type') || '';
    const isVideo = contentType.startsWith('video/') || 
                    videoUrl.endsWith('.mp4') || 
                    videoUrl.endsWith('.webm') ||
                    videoUrl.endsWith('.mov');
    
    return isVideo;
  } catch {
    return false;
  }
}
