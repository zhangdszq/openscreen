/**
 * Offscreen Render Worker
 * Handles frame rendering in a separate thread using OffscreenCanvas
 * Inspired by Remotion's multi-threaded rendering approach
 */

import { Application, Container, Sprite, Graphics, BlurFilter, Texture } from 'pixi.js';

interface RenderConfig {
  width: number;
  height: number;
  wallpaper: string;
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  borderRadius: number;
  padding: number;
  cropRegion: { x: number; y: number; width: number; height: number };
  videoWidth: number;
  videoHeight: number;
}

interface RenderFrameMessage {
  type: 'render';
  frameData: ArrayBuffer;
  frameWidth: number;
  frameHeight: number;
  timestamp: number;
  frameIndex: number;
  zoomState: {
    scale: number;
    focusX: number;
    focusY: number;
  };
}

interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  config: RenderConfig;
}

interface DestroyMessage {
  type: 'destroy';
}

type WorkerMessage = InitMessage | RenderFrameMessage | DestroyMessage;

// Worker state
let app: Application | null = null;
let videoContainer: Container | null = null;
let cameraContainer: Container | null = null;
let videoSprite: Sprite | null = null;
let maskGraphics: Graphics | null = null;
let blurFilter: BlurFilter | null = null;
let backgroundCanvas: OffscreenCanvas | null = null;
let compositeCanvas: OffscreenCanvas | null = null;
let compositeCtx: OffscreenCanvasRenderingContext2D | null = null;
let shadowCanvas: OffscreenCanvas | null = null;
let shadowCtx: OffscreenCanvasRenderingContext2D | null = null;
let config: RenderConfig | null = null;
let shadowFilterCache: string | null = null;

/**
 * Initialize the renderer with OffscreenCanvas
 */
async function initRenderer(canvas: OffscreenCanvas, cfg: RenderConfig): Promise<void> {
  config = cfg;

  // Initialize PixiJS with OffscreenCanvas
  app = new Application();
  await app.init({
    canvas: canvas as any,
    width: config.width,
    height: config.height,
    backgroundAlpha: 0,
    antialias: false,
    resolution: 1,
    powerPreference: 'high-performance',
    hello: false,
  });

  // Setup containers
  cameraContainer = new Container();
  videoContainer = new Container();
  app.stage.addChild(cameraContainer);
  cameraContainer.addChild(videoContainer);

  // Setup blur filter
  blurFilter = new BlurFilter();
  blurFilter.quality = 3;
  blurFilter.resolution = 1;
  blurFilter.blur = 0;
  videoContainer.filters = [blurFilter];

  // Setup mask
  maskGraphics = new Graphics();
  videoContainer.addChild(maskGraphics);
  videoContainer.mask = maskGraphics;

  // Setup background
  await setupBackground();

  // Setup composite canvas
  compositeCanvas = new OffscreenCanvas(config.width, config.height);
  compositeCtx = compositeCanvas.getContext('2d');

  // Setup shadow canvas if needed
  if (config.showShadow) {
    shadowCanvas = new OffscreenCanvas(config.width, config.height);
    shadowCtx = shadowCanvas.getContext('2d');
    // Pre-compute shadow filter string
    shadowFilterCache = computeShadowFilter(config.shadowIntensity);
  }

  self.postMessage({ type: 'initialized' });
}

/**
 * Setup background (solid color or gradient)
 */
async function setupBackground(): Promise<void> {
  if (!config) return;

  backgroundCanvas = new OffscreenCanvas(config.width, config.height);
  const bgCtx = backgroundCanvas.getContext('2d');
  if (!bgCtx) return;

  const wallpaper = config.wallpaper;

  if (wallpaper.startsWith('#')) {
    bgCtx.fillStyle = wallpaper;
    bgCtx.fillRect(0, 0, config.width, config.height);
  } else if (wallpaper.startsWith('linear-gradient') || wallpaper.startsWith('radial-gradient')) {
    // Parse gradient
    const gradientMatch = wallpaper.match(/(linear|radial)-gradient\((.+)\)/);
    if (gradientMatch) {
      const [, type, params] = gradientMatch;
      const parts = params.split(',').map(s => s.trim());

      let gradient: CanvasGradient;

      if (type === 'linear') {
        gradient = bgCtx.createLinearGradient(0, 0, 0, config.height);
      } else {
        const cx = config.width / 2;
        const cy = config.height / 2;
        const radius = Math.max(config.width, config.height) / 2;
        gradient = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      }

      parts.forEach((part, index) => {
        const colorMatch = part.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/);
        if (colorMatch) {
          const color = colorMatch[1];
          const position = index / Math.max(1, parts.length - 1);
          try {
            gradient.addColorStop(position, color);
          } catch {
            // Invalid color, skip
          }
        }
      });

      bgCtx.fillStyle = gradient;
      bgCtx.fillRect(0, 0, config.width, config.height);
    }
  } else {
    bgCtx.fillStyle = '#000000';
    bgCtx.fillRect(0, 0, config.width, config.height);
  }
}

/**
 * Compute shadow filter string (cached)
 */
function computeShadowFilter(intensity: number): string {
  const baseBlur1 = 48 * intensity;
  const baseBlur2 = 16 * intensity;
  const baseBlur3 = 8 * intensity;
  const baseAlpha1 = 0.7 * intensity;
  const baseAlpha2 = 0.5 * intensity;
  const baseAlpha3 = 0.3 * intensity;
  const baseOffset = 12 * intensity;

  return `drop-shadow(0 ${baseOffset}px ${baseBlur1}px rgba(0,0,0,${baseAlpha1})) drop-shadow(0 ${baseOffset / 3}px ${baseBlur2}px rgba(0,0,0,${baseAlpha2})) drop-shadow(0 ${baseOffset / 6}px ${baseBlur3}px rgba(0,0,0,${baseAlpha3}))`;
}

/**
 * Render a single frame
 */
async function renderFrame(msg: RenderFrameMessage): Promise<void> {
  if (!app || !videoContainer || !cameraContainer || !config || !compositeCtx || !compositeCanvas) {
    self.postMessage({ type: 'error', error: 'Renderer not initialized' });
    return;
  }

  const startTime = performance.now();

  try {
    // Create ImageBitmap from frame data
    const blob = new Blob([msg.frameData], { type: 'image/raw' });
    const imageBitmap = await createImageBitmap(
      new ImageData(
        new Uint8ClampedArray(msg.frameData),
        msg.frameWidth,
        msg.frameHeight
      )
    );

    // Update video sprite
    if (!videoSprite) {
      const texture = Texture.from(imageBitmap as any);
      videoSprite = new Sprite(texture);
      videoContainer.addChild(videoSprite);
    } else {
      const oldTexture = videoSprite.texture;
      const newTexture = Texture.from(imageBitmap as any);
      videoSprite.texture = newTexture;
      oldTexture.destroy(true);
    }

    // Update layout
    updateLayout();

    // Apply zoom transform
    applyZoomTransform(msg.zoomState);

    // Render PixiJS stage
    app.renderer.render(app.stage);

    // Composite with background and shadows
    compositeFrame();

    // Get output data
    const outputBitmap = compositeCanvas.transferToImageBitmap();
    
    const renderTime = performance.now() - startTime;

    // Send result back
    self.postMessage({
      type: 'frameComplete',
      frameIndex: msg.frameIndex,
      timestamp: msg.timestamp,
      bitmap: outputBitmap,
      renderTime,
    }, [outputBitmap]);

    imageBitmap.close();
  } catch (error) {
    self.postMessage({
      type: 'error',
      frameIndex: msg.frameIndex,
      error: String(error),
    });
  }
}

/**
 * Update layout based on config
 */
function updateLayout(): void {
  if (!config || !videoSprite || !maskGraphics || !videoContainer) return;

  const { width, height, cropRegion, borderRadius, padding, videoWidth, videoHeight } = config;

  // Calculate cropped video dimensions
  const croppedVideoWidth = videoWidth * cropRegion.width;
  const croppedVideoHeight = videoHeight * cropRegion.height;

  // Calculate scale to fit
  const paddingScale = 1.0 - (padding / 100) * 0.4;
  const viewportWidth = width * paddingScale;
  const viewportHeight = height * paddingScale;
  const scale = Math.min(viewportWidth / croppedVideoWidth, viewportHeight / croppedVideoHeight);

  // Position video sprite
  videoSprite.width = videoWidth * scale;
  videoSprite.height = videoHeight * scale;

  const cropPixelX = cropRegion.x * videoWidth * scale;
  const cropPixelY = cropRegion.y * videoHeight * scale;
  videoSprite.x = -cropPixelX;
  videoSprite.y = -cropPixelY;

  // Position video container
  const croppedDisplayWidth = croppedVideoWidth * scale;
  const croppedDisplayHeight = croppedVideoHeight * scale;
  const centerOffsetX = (width - croppedDisplayWidth) / 2;
  const centerOffsetY = (height - croppedDisplayHeight) / 2;
  videoContainer.x = centerOffsetX;
  videoContainer.y = centerOffsetY;

  // Update mask
  maskGraphics.clear();
  maskGraphics.roundRect(0, 0, croppedDisplayWidth, croppedDisplayHeight, borderRadius);
  maskGraphics.fill({ color: 0xffffff });
}

/**
 * Apply zoom transform to camera container
 */
function applyZoomTransform(zoomState: { scale: number; focusX: number; focusY: number }): void {
  if (!cameraContainer || !config) return;

  const { width, height } = config;
  const { scale, focusX, focusY } = zoomState;

  // Calculate pivot point
  const pivotX = focusX * width;
  const pivotY = focusY * height;

  cameraContainer.pivot.set(pivotX, pivotY);
  cameraContainer.position.set(width / 2, height / 2);
  cameraContainer.scale.set(scale);
}

/**
 * Composite final frame with background and shadows
 */
function compositeFrame(): void {
  if (!compositeCtx || !compositeCanvas || !config || !app) return;

  const { width, height, showShadow, showBlur } = config;
  const videoCanvas = app.canvas as OffscreenCanvas;

  // Clear
  compositeCtx.clearRect(0, 0, width, height);

  // Draw background
  if (backgroundCanvas) {
    if (showBlur) {
      compositeCtx.save();
      compositeCtx.filter = 'blur(6px)';
      compositeCtx.drawImage(backgroundCanvas, 0, 0);
      compositeCtx.restore();
    } else {
      compositeCtx.drawImage(backgroundCanvas, 0, 0);
    }
  }

  // Draw video with shadow
  if (showShadow && shadowCanvas && shadowCtx && shadowFilterCache) {
    shadowCtx.clearRect(0, 0, width, height);
    shadowCtx.save();
    shadowCtx.filter = shadowFilterCache;
    shadowCtx.drawImage(videoCanvas, 0, 0);
    shadowCtx.restore();
    compositeCtx.drawImage(shadowCanvas, 0, 0);
  } else {
    compositeCtx.drawImage(videoCanvas, 0, 0);
  }
}

/**
 * Cleanup resources
 */
function destroy(): void {
  if (videoSprite) {
    videoSprite.destroy();
    videoSprite = null;
  }
  if (app) {
    app.destroy(true, { children: true, texture: true, textureSource: true });
    app = null;
  }
  cameraContainer = null;
  videoContainer = null;
  maskGraphics = null;
  blurFilter = null;
  backgroundCanvas = null;
  compositeCanvas = null;
  compositeCtx = null;
  shadowCanvas = null;
  shadowCtx = null;
  config = null;
  shadowFilterCache = null;

  self.postMessage({ type: 'destroyed' });
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      await initRenderer(msg.canvas, msg.config);
      break;
    case 'render':
      await renderFrame(msg);
      break;
    case 'destroy':
      destroy();
      break;
  }
};

export {};
