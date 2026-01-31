/**
 * WebGPU Render Worker
 * High-performance frame rendering using WebGPU in a dedicated Worker thread
 * Combines the benefits of WebGPU acceleration with Worker parallelism
 */

// WebGPU Shaders
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
  width: f32,
  height: f32,
}

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
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
  
  // Apply zoom transform
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
  width: f32,
  height: f32,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn roundedRectSDF(p: vec2f, size: vec2f, radius: f32) -> f32 {
  let q = abs(p) - size + vec2f(radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
}

@fragment
fn main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  let color = textureSample(inputTexture, inputSampler, texCoord);
  
  if (uniforms.borderRadius > 0.0) {
    let padding = uniforms.padding;
    let size = vec2f(0.5 - padding, 0.5 - padding);
    let p = texCoord - vec2f(0.5);
    let radius = uniforms.borderRadius / max(uniforms.width, uniforms.height);
    let d = roundedRectSDF(p, size, radius);
    
    if (d > 0.0) {
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }
  }
  
  return color;
}
`;

// Worker state
interface WorkerState {
  device: GPUDevice | null;
  pipeline: GPURenderPipeline | null;
  sampler: GPUSampler | null;
  uniformBuffer: GPUBuffer | null;
  outputCanvas: OffscreenCanvas | null;
  context: GPUCanvasContext | null;
  config: RenderConfig | null;
  initialized: boolean;
}

interface RenderConfig {
  width: number;
  height: number;
  borderRadius: number;
  padding: number;
}

const state: WorkerState = {
  device: null,
  pipeline: null,
  sampler: null,
  uniformBuffer: null,
  outputCanvas: null,
  context: null,
  config: null,
  initialized: false,
};

/**
 * Initialize WebGPU in the worker
 */
async function initWebGPU(config: RenderConfig): Promise<boolean> {
  try {
    // @ts-ignore - navigator.gpu may not be typed in worker
    if (!navigator.gpu) {
      console.warn('[WebGPU Worker] WebGPU not available');
      return false;
    }

    // @ts-ignore
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      console.warn('[WebGPU Worker] No adapter found');
      return false;
    }

    state.device = await adapter.requestDevice();
    state.config = config;

    // Create output canvas
    state.outputCanvas = new OffscreenCanvas(config.width, config.height);
    state.context = state.outputCanvas.getContext('webgpu') as GPUCanvasContext;

    // @ts-ignore
    const format = navigator.gpu.getPreferredCanvasFormat();
    state.context.configure({
      device: state.device,
      format,
      alphaMode: 'premultiplied',
    });

    // Create shader modules
    const vertexModule = state.device.createShaderModule({ code: VERTEX_SHADER });
    const fragmentModule = state.device.createShaderModule({ code: FRAGMENT_SHADER });

    // Create sampler
    state.sampler = state.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create uniform buffer (8 floats = 32 bytes)
    state.uniformBuffer = state.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind group layout
    const bindGroupLayout = state.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    // Create pipeline
    state.pipeline = state.device.createRenderPipeline({
      layout: state.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: vertexModule, entryPoint: 'main' },
      fragment: { module: fragmentModule, entryPoint: 'main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    state.initialized = true;
    console.log('[WebGPU Worker] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[WebGPU Worker] Init failed:', error);
    return false;
  }
}

/**
 * Render a frame using WebGPU
 */
async function renderFrame(
  imageData: ImageData,
  zoomState: { scale: number; focusX: number; focusY: number },
  frameIndex: number,
  timestamp: number
): Promise<ImageBitmap | null> {
  if (!state.initialized || !state.device || !state.pipeline || !state.context || !state.outputCanvas || !state.config) {
    console.error('[WebGPU Worker] Not initialized');
    return null;
  }

  try {
    // Create texture from ImageData
    const texture = state.device.createTexture({
      size: [imageData.width, imageData.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    state.device.queue.writeTexture(
      { texture },
      imageData.data,
      { bytesPerRow: imageData.width * 4 },
      [imageData.width, imageData.height]
    );

    // Update uniforms
    const uniforms = new Float32Array([
      zoomState.scale,
      zoomState.focusX,
      zoomState.focusY,
      state.config.width / state.config.height,
      state.config.borderRadius,
      state.config.padding / 100,
      state.config.width,
      state.config.height,
    ]);
    state.device.queue.writeBuffer(state.uniformBuffer!, 0, uniforms);

    // Create bind group
    const bindGroup = state.device.createBindGroup({
      layout: state.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: state.sampler! },
        { binding: 2, resource: { buffer: state.uniformBuffer! } },
      ],
    });

    // Render
    const commandEncoder = state.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: state.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(state.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();

    state.device.queue.submit([commandEncoder.finish()]);
    await state.device.queue.onSubmittedWorkDone();

    // Get output as ImageBitmap
    const bitmap = state.outputCanvas.transferToImageBitmap();

    // Cleanup texture
    texture.destroy();

    return bitmap;
  } catch (error) {
    console.error('[WebGPU Worker] Render error:', error);
    return null;
  }
}

/**
 * Cleanup resources
 */
function destroy(): void {
  if (state.uniformBuffer) {
    state.uniformBuffer.destroy();
  }
  state.device = null;
  state.pipeline = null;
  state.sampler = null;
  state.uniformBuffer = null;
  state.outputCanvas = null;
  state.context = null;
  state.config = null;
  state.initialized = false;
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { type, ...data } = event.data;

  switch (type) {
    case 'init': {
      const success = await initWebGPU(data.config);
      self.postMessage({ type: 'initialized', success });
      break;
    }

    case 'render': {
      const { imageData, zoomState, frameIndex, timestamp } = data;
      const startTime = performance.now();
      
      const bitmap = await renderFrame(imageData, zoomState, frameIndex, timestamp);
      const renderTime = performance.now() - startTime;

      if (bitmap) {
        self.postMessage(
          { type: 'frameComplete', frameIndex, timestamp, bitmap, renderTime },
          [bitmap]
        );
      } else {
        self.postMessage({ type: 'error', frameIndex, error: 'Render failed' });
      }
      break;
    }

    case 'destroy': {
      destroy();
      self.postMessage({ type: 'destroyed' });
      break;
    }
  }
};

export {};
