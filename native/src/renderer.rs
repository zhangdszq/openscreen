//! GPU 渲染模块
//!
//! 使用 wgpu (WebGPU) 进行 GPU 加速渲染

use crate::decoder::DecodedFrame;
use crate::error::{ExportError, Result};
use crate::types::{
    AnnotationRegion, CropRegion, GpuInfo, ZoomRegion,
};
use std::sync::Arc;
use tracing::{debug, info};
use wgpu::util::DeviceExt;

/// 渲染后的帧
pub struct RenderedFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub timestamp: i64,
    pub frame_index: u32,
}

/// 渲染配置
#[derive(Clone)]
pub struct RenderConfig {
    pub width: u32,
    pub height: u32,
    pub wallpaper: Option<Vec<u8>>,
    pub zoom_regions: Vec<ZoomRegion>,
    pub crop_region: Option<CropRegion>,
    pub annotations: Vec<AnnotationRegion>,
    pub show_shadow: bool,
    pub shadow_intensity: f64,
    pub show_blur: bool,
    pub border_radius: f64,
    pub padding: f64,
    pub camera_overlay: Option<crate::types::CameraOverlay>,
    /// 预览区域宽度（用于缩放 border_radius）
    pub preview_width: f64,
}

/// 检查 GPU 支持
pub async fn check_gpu_support() -> Result<GpuInfo> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await;

    match adapter {
        Some(adapter) => {
            let info = adapter.get_info();
            Ok(GpuInfo {
                supported: true,
                name: Some(info.name),
                backend: Some(format!("{:?}", info.backend)),
                memory_mb: None,
            })
        }
        None => Ok(GpuInfo {
            supported: false,
            name: None,
            backend: None,
            memory_mb: None,
        }),
    }
}

/// Uniform 缓冲区数据
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    scale: f32,
    center_x: f32,
    center_y: f32,
    border_radius: f32,
    padding: f32,
    shadow_intensity: f32,
    input_width: f32,
    input_height: f32,
    output_width: f32,
    output_height: f32,
    // Crop region (normalized 0-1)
    crop_left: f32,
    crop_top: f32,
    crop_right: f32,
    crop_bottom: f32,
}

/// GPU 渲染器
pub struct GpuRenderer {
    device: Arc<wgpu::Device>,
    queue: Arc<wgpu::Queue>,
    config: RenderConfig,
    render_pipeline: wgpu::RenderPipeline,
    output_texture: wgpu::Texture,
    bind_group_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    output_buffer: wgpu::Buffer,
    aligned_bytes_per_row: u32,
    /// 预处理过的 wallpaper RGBA 数据（已缩放到输出尺寸）
    wallpaper_rgba: Option<Vec<u8>>,
}

impl GpuRenderer {
    pub async fn new(config: RenderConfig) -> Result<Self> {
        info!("Initializing GPU renderer ({}x{})", config.width, config.height);

        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| ExportError::GpuError("No GPU adapter found".to_string()))?;

        info!("Using GPU: {} ({:?})", adapter.get_info().name, adapter.get_info().backend);

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("openscreen-renderer"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .map_err(|e| ExportError::GpuError(e.to_string()))?;

        let device = Arc::new(device);
        let queue = Arc::new(queue);

        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("output-texture"),
            size: wgpu::Extent3d {
                width: config.width,
                height: config.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("video-shader"),
            source: wgpu::ShaderSource::Wgsl(SHADER_SOURCE.into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("bind-group-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pipeline-layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("render-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    // 直接写入着色器返回的值（包括 alpha），不进行混合
                    // 这样填充区域的 alpha=0 可以被保留
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let aligned_bytes_per_row = ((config.width * 4 + 255) / 256) * 256;
        let aligned_buffer_size = (aligned_bytes_per_row * config.height) as u64;
        
        let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("output-buffer"),
            size: aligned_buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        // 复制 wallpaper 数据
        let wallpaper_rgba = config.wallpaper.clone();
        if wallpaper_rgba.is_some() {
            info!("Wallpaper loaded for rendering");
        }

        info!("GPU renderer initialized");

        Ok(Self {
            device,
            queue,
            config,
            render_pipeline,
            output_texture,
            bind_group_layout,
            sampler,
            output_buffer,
            aligned_bytes_per_row,
            wallpaper_rgba,
        })
    }

    pub fn render_frame(&self, input: &DecodedFrame, timestamp: i64) -> Result<RenderedFrame> {
        debug!("Rendering frame {} at {}μs", input.frame_index, timestamp);

        let input_texture = self.create_input_texture(input)?;
        let input_view = input_texture.create_view(&Default::default());

        let uniforms = self.calculate_uniforms(timestamp, input.width, input.height);

        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniform-buffer"),
            contents: bytemuck::cast_slice(&[uniforms]),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("bind-group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        let output_view = self.output_texture.create_view(&Default::default());
        
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("render-encoder"),
        });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        // 使用透明色清除，这样填充区域（着色器返回 alpha=0）可以被检测到
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 0.0, // 透明
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                ..Default::default()
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &self.output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &self.output_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(self.aligned_bytes_per_row),
                    rows_per_image: Some(self.config.height),
                },
            },
            wgpu::Extent3d {
                width: self.config.width,
                height: self.config.height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        let mut output_data = self.read_buffer_data()?;

        // 如果有 wallpaper，用它替换透明像素（alpha = 0）
        if let Some(ref wallpaper) = self.wallpaper_rgba {
            self.apply_wallpaper_fill(&mut output_data, wallpaper);
        } else {
            // 没有 wallpaper，将透明像素改为黑色
            for i in (0..output_data.len()).step_by(4) {
                if i + 3 < output_data.len() && output_data[i + 3] == 0 {
                    output_data[i] = 0;     // R
                    output_data[i + 1] = 0; // G
                    output_data[i + 2] = 0; // B
                    output_data[i + 3] = 255; // A
                }
            }
        }

        Ok(RenderedFrame {
            data: output_data,
            width: self.config.width,
            height: self.config.height,
            timestamp,
            frame_index: input.frame_index,
        })
    }

    /// 用 wallpaper 填充透明像素
    fn apply_wallpaper_fill(&self, output: &mut [u8], wallpaper: &[u8]) {
        let w = self.config.width as usize;
        let h = self.config.height as usize;
        let expected_size = w * h * 4;
        
        if wallpaper.len() != expected_size {
            info!("Wallpaper size mismatch: {} vs expected {} ({}x{})", 
                  wallpaper.len(), expected_size, w, h);
            return;
        }

        let mut filled_count = 0usize;
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                if idx + 3 < output.len() && output[idx + 3] == 0 {
                    // 透明像素，用 wallpaper 替换
                    output[idx] = wallpaper[idx];       // R
                    output[idx + 1] = wallpaper[idx + 1]; // G
                    output[idx + 2] = wallpaper[idx + 2]; // B
                    output[idx + 3] = 255;               // A (不透明)
                    filled_count += 1;
                }
            }
        }
        
        if filled_count > 0 {
            debug!("Filled {} transparent pixels with wallpaper", filled_count);
        }
    }

    /// 渲染帧并叠加摄像头画中画
    pub fn render_frame_with_camera(
        &self,
        input: &DecodedFrame,
        camera_frame: Option<&DecodedFrame>,
        timestamp: i64,
    ) -> Result<RenderedFrame> {
        // 先渲染主视频
        let mut rendered = self.render_frame(input, timestamp)?;

        // 如果有摄像头帧，叠加到渲染结果上
        if let (Some(camera), Some(ref overlay_config)) = (camera_frame, &self.config.camera_overlay) {
            if overlay_config.enabled {
                self.overlay_camera(&mut rendered.data, camera, overlay_config);
            }
        }

        Ok(rendered)
    }

    /// 在输出帧上叠加摄像头画面
    fn overlay_camera(
        &self,
        output: &mut [u8],
        camera: &DecodedFrame,
        overlay: &crate::types::CameraOverlay,
    ) {
        let out_w = self.config.width as usize;
        let out_h = self.config.height as usize;

        // 计算摄像头覆盖区域的大小
        // 编辑器公式: pipWidth = (overlay.size / 100) * containerWidth
        // pipHeight = shape === 'circle' ? pipWidth : pipWidth * 0.75
        let pip_width = (overlay.size / 100.0 * out_w as f64) as usize;
        
        // 根据形状决定尺寸
        let (cam_w, cam_h) = if overlay.shape == "circle" {
            // 圆形：宽高相等（正方形区域）
            (pip_width, pip_width)
        } else {
            // 矩形：高度是宽度的 75%（与编辑器一致）
            (pip_width, (pip_width as f64 * 0.75) as usize)
        };

        // 计算位置（基于归一化坐标）
        let margin = 20usize;
        let cam_x = ((overlay.position.x * out_w as f64) as usize).saturating_sub(cam_w / 2).min(out_w.saturating_sub(cam_w + margin));
        let cam_y = ((overlay.position.y * out_h as f64) as usize).saturating_sub(cam_h / 2).min(out_h.saturating_sub(cam_h + margin));

        // 计算摄像头帧的采样区域
        // 对于圆形，需要从摄像头帧中心裁剪一个正方形区域，保持宽高比不变
        let is_circle = overlay.shape == "circle";
        let center_x = cam_w as f64 / 2.0;
        let center_y = cam_h as f64 / 2.0;
        let radius = cam_w.min(cam_h) as f64 / 2.0;

        // 计算源区域（保持宽高比，从中心裁剪）
        let (src_offset_x, src_offset_y, src_region_w, src_region_h) = if is_circle {
            // 圆形：从摄像头帧中心裁剪正方形区域
            let camera_min_dim = camera.width.min(camera.height) as f64;
            let offset_x = (camera.width as f64 - camera_min_dim) / 2.0;
            let offset_y = (camera.height as f64 - camera_min_dim) / 2.0;
            (offset_x, offset_y, camera_min_dim, camera_min_dim)
        } else {
            // 矩形：使用整个摄像头帧
            (0.0, 0.0, camera.width as f64, camera.height as f64)
        };

        let scale_x = src_region_w / cam_w as f64;
        let scale_y = src_region_h / cam_h as f64;

        // 绘制阴影效果（如果启用）- 模拟 CSS box-shadow
        // CSS: 0 2px 4px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.25), 0 8px 16px rgba(0,0,0,0.2)
        if overlay.border_style == "shadow" {
            // 三层阴影，从小到大
            let shadow_layers = [
                (2, 4, 0.30f32),   // offset: 2, blur: 4, opacity: 0.3
                (4, 8, 0.25f32),   // offset: 4, blur: 8, opacity: 0.25
                (8, 16, 0.20f32),  // offset: 8, blur: 16, opacity: 0.2
            ];
            
            // 缩放阴影参数到实际像素
            let scale_factor = cam_w.min(cam_h) as f64 / 150.0; // 基准大小 150px
            
            for (offset_y, blur_size, opacity) in shadow_layers.iter().rev() {
                let actual_offset = (*offset_y as f64 * scale_factor).max(1.0) as isize;
                let actual_blur = (*blur_size as f64 * scale_factor).max(2.0) as usize;
                
                // 绘制模糊阴影
                for y in 0..(cam_h + actual_blur * 2) {
                    for x in 0..(cam_w + actual_blur * 2) {
                        let check_x = x as f64 - actual_blur as f64;
                        let check_y = y as f64 - actual_blur as f64;
                        
                        // 计算到形状边缘的距离用于模糊
                        let in_shape = if is_circle {
                            let dx = check_x - center_x;
                            let dy = check_y - center_y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            dist <= radius + actual_blur as f64 * 0.5
                        } else {
                            check_x >= -(actual_blur as f64 * 0.5) 
                                && check_x < cam_w as f64 + actual_blur as f64 * 0.5
                                && check_y >= -(actual_blur as f64 * 0.5) 
                                && check_y < cam_h as f64 + actual_blur as f64 * 0.5
                        };

                        if in_shape {
                            // 阴影只向下偏移 (Y方向)
                            let dst_x = (cam_x as isize + x as isize - actual_blur as isize) as usize;
                            let dst_y = (cam_y as isize + y as isize - actual_blur as isize + actual_offset) as usize;

                            if dst_x < out_w && dst_y < out_h {
                                let dst_idx = (dst_y * out_w + dst_x) * 4;
                                if dst_idx + 3 < output.len() {
                                    // 计算模糊衰减
                                    let edge_dist = if is_circle {
                                        let dx = check_x - center_x;
                                        let dy = check_y - center_y;
                                        ((dx * dx + dy * dy).sqrt() - radius).max(0.0)
                                    } else {
                                        0.0
                                    };
                                    let blur_factor = (1.0 - edge_dist / actual_blur as f64).max(0.0).min(1.0);
                                    let final_opacity = opacity * blur_factor as f32;
                                    
                                    let dst_r = output[dst_idx] as f32;
                                    let dst_g = output[dst_idx + 1] as f32;
                                    let dst_b = output[dst_idx + 2] as f32;

                                    output[dst_idx] = (dst_r * (1.0 - final_opacity)) as u8;
                                    output[dst_idx + 1] = (dst_g * (1.0 - final_opacity)) as u8;
                                    output[dst_idx + 2] = (dst_b * (1.0 - final_opacity)) as u8;
                                }
                            }
                        }
                    }
                }
            }
        }

        // 绘制白色边框（如果启用）
        if overlay.border_style == "white" {
            let border_width = (cam_w.min(cam_h) / 30).max(3);
            let border_radius = radius + border_width as f64;
            
            for y in 0..(cam_h + border_width * 2) {
                for x in 0..(cam_w + border_width * 2) {
                    let check_x = x as f64 - border_width as f64 - center_x;
                    let check_y = y as f64 - border_width as f64 - center_y;
                    
                    let in_border = if is_circle {
                        let dist = (check_x * check_x + check_y * check_y).sqrt();
                        dist <= border_radius && dist > radius
                    } else {
                        let in_outer = x < cam_w + border_width * 2 && y < cam_h + border_width * 2;
                        let in_inner = x >= border_width && x < cam_w + border_width 
                                    && y >= border_width && y < cam_h + border_width;
                        in_outer && !in_inner
                    };

                    if in_border {
                        let dst_x = cam_x.saturating_sub(border_width) + x;
                        let dst_y = cam_y.saturating_sub(border_width) + y;

                        if dst_x < out_w && dst_y < out_h {
                            let dst_idx = (dst_y * out_w + dst_x) * 4;
                            if dst_idx + 3 < output.len() {
                                output[dst_idx] = 255;     // R
                                output[dst_idx + 1] = 255; // G
                                output[dst_idx + 2] = 255; // B
                                output[dst_idx + 3] = 255; // A
                            }
                        }
                    }
                }
            }
        }

        // 绘制摄像头画面（水平翻转/镜像效果）
        for y in 0..cam_h {
            for x in 0..cam_w {
                // 圆形裁剪检查
                if is_circle {
                    let dx = x as f64 - center_x;
                    let dy = y as f64 - center_y;
                    if dx * dx + dy * dy > radius * radius {
                        continue;
                    }
                }

                // 从裁剪区域采样（保持宽高比）
                // 水平翻转：从右向左采样 (cam_w - 1 - x) 实现镜像效果
                let mirrored_x = cam_w - 1 - x;
                let src_x = ((src_offset_x + mirrored_x as f64 * scale_x) as u32).min(camera.width - 1);
                let src_y = ((src_offset_y + y as f64 * scale_y) as u32).min(camera.height - 1);

                let src_idx = ((src_y * camera.width + src_x) * 4) as usize;
                let dst_x = cam_x + x;
                let dst_y = cam_y + y;

                if dst_x < out_w && dst_y < out_h {
                    let dst_idx = (dst_y * out_w + dst_x) * 4;

                    if src_idx + 3 < camera.data.len() && dst_idx + 3 < output.len() {
                        let opacity = overlay.opacity as f32;
                        let src_r = camera.data[src_idx] as f32;
                        let src_g = camera.data[src_idx + 1] as f32;
                        let src_b = camera.data[src_idx + 2] as f32;
                        let dst_r = output[dst_idx] as f32;
                        let dst_g = output[dst_idx + 1] as f32;
                        let dst_b = output[dst_idx + 2] as f32;

                        output[dst_idx] = (src_r * opacity + dst_r * (1.0 - opacity)) as u8;
                        output[dst_idx + 1] = (src_g * opacity + dst_g * (1.0 - opacity)) as u8;
                        output[dst_idx + 2] = (src_b * opacity + dst_b * (1.0 - opacity)) as u8;
                        output[dst_idx + 3] = 255;
                    }
                }
            }
        }
    }

    fn create_input_texture(&self, frame: &DecodedFrame) -> Result<wgpu::Texture> {
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("input-texture"),
            size: wgpu::Extent3d {
                width: frame.width,
                height: frame.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        self.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame.data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4 * frame.width),
                rows_per_image: Some(frame.height),
            },
            wgpu::Extent3d {
                width: frame.width,
                height: frame.height,
                depth_or_array_layers: 1,
            },
        );

        Ok(texture)
    }

    fn calculate_uniforms(&self, timestamp: i64, input_width: u32, input_height: u32) -> Uniforms {
        let time_ms = timestamp as f64 / 1000.0;
        let (scale, center_x, center_y) = self.find_active_zoom(time_ms);

        // 获取裁剪区域，默认为完整视频
        let (crop_left, crop_top, crop_right, crop_bottom) = match &self.config.crop_region {
            Some(crop) => (crop.left as f32, crop.top as f32, crop.right as f32, crop.bottom as f32),
            None => (0.0, 0.0, 1.0, 1.0),
        };

        // 根据输出尺寸缩放 border_radius
        // 编辑器中的 border_radius 是基于预览尺寸的像素值
        let scale_factor = if self.config.preview_width > 0.0 {
            self.config.width as f64 / self.config.preview_width
        } else {
            1.0
        };
        let scaled_border_radius = self.config.border_radius * scale_factor;

        Uniforms {
            scale: scale as f32,
            center_x: center_x as f32,
            center_y: center_y as f32,
            border_radius: scaled_border_radius as f32,
            padding: self.config.padding as f32,
            shadow_intensity: if self.config.show_shadow {
                self.config.shadow_intensity as f32
            } else {
                0.0
            },
            input_width: input_width as f32,
            input_height: input_height as f32,
            output_width: self.config.width as f32,
            output_height: self.config.height as f32,
            crop_left,
            crop_top,
            crop_right,
            crop_bottom,
        }
    }

    fn find_active_zoom(&self, time_ms: f64) -> (f64, f64, f64) {
        // 过渡窗口时间（毫秒），与编辑器保持一致
        const TRANSITION_WINDOW_MS: f64 = 300.0;
        
        // 找到当前时间最强的 zoom region
        let mut best_strength = 0.0;
        let mut best_region: Option<&crate::types::ZoomRegion> = None;
        
        for region in &self.config.zoom_regions {
            let lead_in_start = region.start_ms - TRANSITION_WINDOW_MS;
            let lead_out_end = region.end_ms + TRANSITION_WINDOW_MS;
            
            if time_ms < lead_in_start || time_ms > lead_out_end {
                continue;
            }
            
            // 计算渐入渐出强度
            let fade_in = smooth_step((time_ms - lead_in_start) / TRANSITION_WINDOW_MS);
            let fade_out = smooth_step((lead_out_end - time_ms) / TRANSITION_WINDOW_MS);
            let strength = fade_in.min(fade_out);
            
            if strength > best_strength {
                best_strength = strength;
                best_region = Some(region);
            }
        }
        
        if let Some(region) = best_region {
            // 应用缓动后的强度
            let eased_strength = apply_easing(&region.easing, best_strength);
            
            return (
                1.0 + (region.scale - 1.0) * eased_strength,
                0.5 + (region.target_x - 0.5) * eased_strength,
                0.5 + (region.target_y - 0.5) * eased_strength,
            );
        }

        (1.0, 0.5, 0.5)
    }

    fn read_buffer_data(&self) -> Result<Vec<u8>> {
        let buffer_slice = self.output_buffer.slice(..);
        
        let (tx, rx) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });

        self.device.poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| ExportError::GpuError("Failed to receive map result".to_string()))?
            .map_err(|e| ExportError::GpuError(format!("Buffer map failed: {:?}", e)))?;

        let data = buffer_slice.get_mapped_range();
        
        let actual_bytes_per_row = self.config.width * 4;
        let mut output = Vec::with_capacity((actual_bytes_per_row * self.config.height) as usize);
        
        for y in 0..self.config.height {
            let start = (y * self.aligned_bytes_per_row) as usize;
            let end = start + actual_bytes_per_row as usize;
            output.extend_from_slice(&data[start..end]);
        }

        drop(data);
        self.output_buffer.unmap();

        Ok(output)
    }
}

/// 平滑步进函数，用于渐入渐出过渡
fn smooth_step(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn apply_easing(easing: &Option<String>, t: f64) -> f64 {
    match easing.as_deref() {
        Some("easeInOut") | None => {
            if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
        Some("easeIn") => t * t * t,
        Some("easeOut") => 1.0 - (1.0 - t).powi(3),
        Some("linear") => t,
        _ => t,
    }
}

/// CPU 软件渲染器
pub struct CpuRenderer {
    config: RenderConfig,
}

impl CpuRenderer {
    pub fn new(config: RenderConfig) -> Self {
        info!("Using CPU software renderer");
        Self { config }
    }

    pub fn render_frame(&self, input: &DecodedFrame, timestamp: i64) -> Result<RenderedFrame> {
        let mut output = vec![0u8; (self.config.width * self.config.height * 4) as usize];

        let scale_x = input.width as f64 / self.config.width as f64;
        let scale_y = input.height as f64 / self.config.height as f64;

        for y in 0..self.config.height {
            for x in 0..self.config.width {
                let src_x = ((x as f64 * scale_x) as u32).min(input.width - 1);
                let src_y = ((y as f64 * scale_y) as u32).min(input.height - 1);

                let src_idx = ((src_y * input.width + src_x) * 4) as usize;
                let dst_idx = ((y * self.config.width + x) * 4) as usize;

                if src_idx + 3 < input.data.len() && dst_idx + 3 < output.len() {
                    output[dst_idx] = input.data[src_idx];
                    output[dst_idx + 1] = input.data[src_idx + 1];
                    output[dst_idx + 2] = input.data[src_idx + 2];
                    output[dst_idx + 3] = input.data[src_idx + 3];
                }
            }
        }

        Ok(RenderedFrame {
            data: output,
            width: self.config.width,
            height: self.config.height,
            timestamp,
            frame_index: input.frame_index,
        })
    }
}

const SHADER_SOURCE: &str = r#"
struct Uniforms {
    scale: f32,
    center_x: f32,
    center_y: f32,
    border_radius: f32,
    padding: f32,
    shadow_intensity: f32,
    input_width: f32,
    input_height: f32,
    output_width: f32,
    output_height: f32,
    crop_left: f32,
    crop_top: f32,
    crop_right: f32,
    crop_bottom: f32,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0)
    );
    
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(1.0, 0.0)
    );
    
    out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    out.uv = uvs[vertex_index];
    
    return out;
}

// 计算点到圆角矩形的距离（用于圆角和阴影）
fn rounded_rect_sdf(p: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
    let q = abs(p) - size + vec2<f32>(radius);
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - radius;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    
    // ============ 计算基础参数 ============
    // padding 将视频缩小到中心区域
    let padding_scale = 1.0 - (uniforms.padding / 100.0) * 0.4;
    
    // 计算裁剪区域的宽高比
    let crop_width = uniforms.crop_right - uniforms.crop_left;
    let crop_height = uniforms.crop_bottom - uniforms.crop_top;
    let crop_pixel_width = crop_width * uniforms.input_width;
    let crop_pixel_height = crop_height * uniforms.input_height;
    let crop_aspect = crop_pixel_width / crop_pixel_height;
    let output_aspect = uniforms.output_width / uniforms.output_height;
    
    // 在 padding 区域内，根据宽高比计算实际内容区域的缩放
    var content_scale_x = padding_scale;
    var content_scale_y = padding_scale;
    
    if crop_aspect > output_aspect {
        content_scale_y = padding_scale * (output_aspect / crop_aspect);
    } else if crop_aspect < output_aspect {
        content_scale_x = padding_scale * (crop_aspect / output_aspect);
    }
    
    // 内容区域的像素尺寸（用于圆角和阴影计算）
    let content_pixel_width = content_scale_x * uniforms.output_width;
    let content_pixel_height = content_scale_y * uniforms.output_height;
    let half_content_w = content_pixel_width / 2.0;
    let half_content_h = content_pixel_height / 2.0;
    
    // 当前像素相对于画面中心的位置（像素）
    let pixel_x = (uv.x - 0.5) * uniforms.output_width;
    let pixel_y = (uv.y - 0.5) * uniforms.output_height;
    
    // ============ 圆角和阴影检查（基于 padding 后的内容区域）============
    let border_radius = uniforms.border_radius;
    let dist_to_rect = rounded_rect_sdf(
        vec2<f32>(pixel_x, pixel_y),
        vec2<f32>(half_content_w, half_content_h),
        border_radius
    );
    
    // 阴影效果（在圆角外绘制阴影）
    if uniforms.shadow_intensity > 0.0 && dist_to_rect > 0.0 {
        let shadow_spread = 40.0 * uniforms.shadow_intensity;
        let shadow_offset_y = 12.0 * uniforms.shadow_intensity;
        
        // 计算到阴影源的距离
        let shadow_dist = rounded_rect_sdf(
            vec2<f32>(pixel_x, pixel_y - shadow_offset_y),
            vec2<f32>(half_content_w, half_content_h),
            border_radius
        );
        
        if shadow_dist < shadow_spread && shadow_dist > 0.0 {
            let shadow_alpha = pow(1.0 - shadow_dist / shadow_spread, 2.0) * uniforms.shadow_intensity * 0.6;
            return vec4<f32>(0.0, 0.0, 0.0, shadow_alpha);
        }
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    // 在圆角外，返回透明
    if dist_to_rect > 0.0 {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    // ============ 计算采样 UV ============
    // 将屏幕 UV 映射到内容区域的归一化坐标
    // 这里的关键是：zoom 是对整个内容进行放大，焦点移动到屏幕中心
    // 所以我们首先计算"如果没有 zoom，这个屏幕位置对应视频的哪个位置"
    // 然后 zoom 会改变这个映射关系
    
    let content_min_x = (1.0 - content_scale_x) / 2.0;
    let content_min_y = (1.0 - content_scale_y) / 2.0;
    
    // 首先应用 zoom 变换
    // 编辑器逻辑：焦点移动到屏幕中心，内容放大
    // 在屏幕空间中：screen_pos = (content_pos - focus) * scale + screen_center
    // 反过来：content_pos = (screen_pos - screen_center) / scale + focus
    
    var video_uv: vec2<f32>;
    if uniforms.scale > 1.0 {
        let focus = vec2<f32>(uniforms.center_x, uniforms.center_y);
        // 将屏幕 UV 转换为相对于屏幕中心的坐标
        let screen_offset = uv - vec2<f32>(0.5, 0.5);
        // 计算在视频坐标系中的位置
        // 内容区域在屏幕上的大小
        let content_size = vec2<f32>(content_scale_x, content_scale_y);
        // 将屏幕偏移转换为内容空间的偏移
        let content_offset = screen_offset / content_size;
        // 应用 zoom：除以 scale 并加上焦点
        video_uv = content_offset / uniforms.scale + focus;
    } else {
        // 无 zoom：直接映射
        video_uv = vec2<f32>(
            (uv.x - content_min_x) / content_scale_x,
            (uv.y - content_min_y) / content_scale_y
        );
    }
    
    // 映射到裁剪区域
    var sample_uv = vec2<f32>(
        uniforms.crop_left + video_uv.x * crop_width,
        uniforms.crop_top + video_uv.y * crop_height
    );
    
    // 边界检查：超出视频范围时，clamp 到边缘（重复边缘像素）
    sample_uv.x = clamp(sample_uv.x, 0.001, 0.999);
    sample_uv.y = clamp(sample_uv.y, 0.001, 0.999);
    
    // 采样纹理
    var color = textureSample(input_texture, input_sampler, sample_uv);
    
    return color;
}
"#;
