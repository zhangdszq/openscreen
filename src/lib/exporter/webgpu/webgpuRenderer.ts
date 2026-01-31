/**
 * WebGPU Frame Renderer
 * High-performance GPU rendering using WebGPU API
 * Provides better performance than WebGL for video frame processing
 */

export interface WebGPURendererConfig {
  width: number;
  height: number;
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  borderRadius: number;
}

// Shader for basic video frame rendering with zoom and effects
const VERTEX_SHADER = /* wgsl */`
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

struct Uniforms {
  scale: f32,
  focusX: f32,
  focusY: f32,
  aspectRatio: f32,
  borderRadius: f32,
  padding: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full screen quad vertices
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0)
  );

  var texCoords = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  
  // Apply zoom transform to texture coordinates
  var tc = texCoords[vertexIndex];
  let focus = vec2f(uniforms.focusX, uniforms.focusY);
  tc = (tc - focus) / uniforms.scale + focus;
  output.texCoord = tc;
  
  return output;
}
`;

const FRAGMENT_SHADER = /* wgsl */`
struct Uniforms {
  scale: f32,
  focusX: f32,
  focusY: f32,
  aspectRatio: f32,
  borderRadius: f32,
  padding: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var videoTexture: texture_external;
@group(0) @binding(1) var videoSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Rounded rectangle SDF
fn roundedRectSDF(p: vec2f, size: vec2f, radius: f32) -> f32 {
  let q = abs(p) - size + vec2f(radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
}

@fragment
fn main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  // Sample video texture
  let color = textureSampleBaseClampToEdge(videoTexture, videoSampler, texCoord);
  
  // Apply rounded corners if needed
  if (uniforms.borderRadius > 0.0) {
    let padding = uniforms.padding;
    let size = vec2f(0.5 - padding, 0.5 - padding);
    let p = texCoord - vec2f(0.5);
    let radius = uniforms.borderRadius / 1000.0; // Normalize
    let d = roundedRectSDF(p, size, radius);
    
    if (d > 0.0) {
      discard;
    }
  }
  
  return color;
}
`;

// Blur shader for background effect
const BLUR_SHADER = /* wgsl */`
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct BlurUniforms {
  direction: vec2f,
  blurAmount: f32,
  _pad: f32,
}

@group(0) @binding(2) var<uniform> blurUniforms: BlurUniforms;

@fragment
fn main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  let texelSize = vec2f(1.0) / vec2f(textureDimensions(inputTexture));
  var color = vec4f(0.0);
  var total = 0.0;
  
  // 9-tap Gaussian blur
  let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  
  color += textureSample(inputTexture, inputSampler, texCoord) * weights[0];
  total += weights[0];
  
  for (var i = 1; i < 5; i++) {
    let offset = blurUniforms.direction * texelSize * f32(i) * blurUniforms.blurAmount;
    color += textureSample(inputTexture, inputSampler, texCoord + offset) * weights[i];
    color += textureSample(inputTexture, inputSampler, texCoord - offset) * weights[i];
    total += weights[i] * 2.0;
  }
  
  return color / total;
}
`;

/**
 * Check if WebGPU is available
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (!navigator.gpu) {
    return false;
  }
  
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * WebGPU-based frame renderer
 */
export class WebGPURenderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private config: WebGPURendererConfig;
  private isInitialized = false;

  constructor(config: WebGPURendererConfig) {
    this.config = config;
  }

  /**
   * Initialize WebGPU renderer
   */
  async initialize(canvas?: HTMLCanvasElement | OffscreenCanvas): Promise<boolean> {
    if (!navigator.gpu) {
      console.warn('[WebGPURenderer] WebGPU not supported');
      return false;
    }

    try {
      // Request adapter and device
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        console.warn('[WebGPURenderer] No WebGPU adapter found');
        return false;
      }

      this.device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {},
      });

      // Setup canvas
      this.canvas = canvas || document.createElement('canvas');
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;

      this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
      if (!this.context) {
        throw new Error('Failed to get WebGPU context');
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format,
        alphaMode: 'premultiplied',
      });

      // Create shader modules
      const vertexModule = this.device.createShaderModule({
        code: VERTEX_SHADER,
      });

      const fragmentModule = this.device.createShaderModule({
        code: FRAGMENT_SHADER,
      });

      // Create sampler
      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      // Create uniform buffer
      this.uniformBuffer = this.device.createBuffer({
        size: 32, // 8 floats
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Create bind group layout
      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            externalTexture: {},
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {},
          },
          {
            binding: 2,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      });

      // Create pipeline
      this.pipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: vertexModule,
          entryPoint: 'main',
        },
        fragment: {
          module: fragmentModule,
          entryPoint: 'main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      this.isInitialized = true;
      console.log('[WebGPURenderer] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[WebGPURenderer] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Render a video frame
   */
  async renderFrame(
    videoFrame: VideoFrame,
    zoomState: { scale: number; focusX: number; focusY: number }
  ): Promise<void> {
    if (!this.isInitialized || !this.device || !this.context || !this.pipeline) {
      throw new Error('WebGPU renderer not initialized');
    }

    // Create external texture from video frame
    const externalTexture = this.device.importExternalTexture({
      source: videoFrame as any,
    });

    // Update uniforms
    const uniforms = new Float32Array([
      zoomState.scale,
      zoomState.focusX,
      zoomState.focusY,
      this.config.width / this.config.height,
      this.config.borderRadius,
      0.0, // padding
      0.0, // pad1
      0.0, // pad2
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniforms);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: externalTexture },
        { binding: 1, resource: this.sampler! },
        { binding: 2, resource: { buffer: this.uniformBuffer! } },
      ],
    });

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Wait for GPU to finish
    await this.device.queue.onSubmittedWorkDone();
  }

  /**
   * Get the output canvas
   */
  getCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this.canvas;
  }

  /**
   * Check if renderer is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy renderer and release resources
   */
  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null;
    }
    
    this.device = null;
    this.context = null;
    this.canvas = null;
    this.pipeline = null;
    this.sampler = null;
    this.isInitialized = false;
    
    console.log('[WebGPURenderer] Destroyed');
  }
}

/**
 * Factory function to create the best available renderer
 */
export async function createBestRenderer(
  config: WebGPURendererConfig
): Promise<{ type: 'webgpu' | 'webgl'; renderer: WebGPURenderer | null }> {
  // Try WebGPU first
  if (await isWebGPUAvailable()) {
    const renderer = new WebGPURenderer(config);
    const success = await renderer.initialize();
    if (success) {
      return { type: 'webgpu', renderer };
    }
  }

  // Fall back to WebGL (return null, let caller use PixiJS)
  console.log('[createBestRenderer] WebGPU not available, falling back to WebGL/PixiJS');
  return { type: 'webgl', renderer: null };
}
