//! 导出流水线模块

use crate::decoder::VideoDecoder;
use crate::encoder::{self, EncoderConfig, EncoderType};
use crate::error::{ExportError, Result};
use crate::renderer::{CpuRenderer, GpuRenderer, RenderConfig, RenderedFrame};
use crate::types::{ExportConfig, ExportProgress, ExportResult};
use crossbeam_channel::{bounded, Receiver, Sender};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info, warn};

/// 加载 wallpaper 图片并缩放到指定尺寸
fn load_wallpaper(path: &str, target_width: u32, target_height: u32) -> Option<Vec<u8>> {
    info!("Loading wallpaper: {}", path);
    
    match image::open(path) {
        Ok(img) => {
            // 缩放到目标尺寸
            let resized = img.resize_to_fill(
                target_width,
                target_height,
                image::imageops::FilterType::Lanczos3
            );
            // 转换为 RGBA
            let rgba = resized.to_rgba8();
            info!("Wallpaper loaded and resized to {}x{}", target_width, target_height);
            Some(rgba.into_raw())
        }
        Err(e) => {
            warn!("Failed to load wallpaper: {}", e);
            None
        }
    }
}

pub fn run_export_pipeline<F>(
    config: ExportConfig,
    cancel_flag: Arc<AtomicBool>,
    progress_callback: F,
) -> Result<ExportResult>
where
    F: Fn(ExportProgress) + Send + Sync + 'static,
{
    let start_time = Instant::now();
    info!("Starting export pipeline");
    info!("  Input: {}", config.input_path);
    info!("  Output: {}", config.output_path);
    info!("  Resolution: {}x{}", config.width, config.height);
    info!("  Frame rate: {} fps", config.frame_rate);
    info!("  Bitrate: {} bps", config.bitrate);

    let decoder = VideoDecoder::new(&config.input_path, config.trim_regions.clone(), config.ffmpeg_dir.clone())?;
    let video_info = decoder.info();
    let total_frames = decoder.effective_frame_count();

    info!("Video info: {}x{} @ {:.2} fps, {} frames",
        video_info.width, video_info.height, video_info.fps, total_frames);

    // 可选的摄像头解码器
    let camera_decoder = if let Some(ref camera_overlay) = config.camera_overlay {
        if camera_overlay.enabled {
            if let Some(ref camera_path) = camera_overlay.video_path {
                info!("Loading camera video: {}", camera_path);
                match VideoDecoder::new(camera_path, vec![], config.ffmpeg_dir.clone()) {
                    Ok(d) => {
                        info!("Camera video loaded: {}x{}", d.info().width, d.info().height);
                        Some(d)
                    }
                    Err(e) => {
                        warn!("Failed to load camera video: {}, skipping", e);
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let preferred_encoder = config.preferred_encoder.as_deref().and_then(|name| {
        match name {
            "nvenc" => Some(EncoderType::Nvenc),
            "qsv" => Some(EncoderType::Qsv),
            "amf" => Some(EncoderType::Amf),
            "videotoolbox" => Some(EncoderType::VideoToolbox),
            "vaapi" => Some(EncoderType::Vaapi),
            "x264" => Some(EncoderType::X264),
            _ => None,
        }
    });
    let encoder_type = encoder::select_encoder(preferred_encoder);

    let processed_frames = Arc::new(AtomicU32::new(0));
    let progress_callback = Arc::new(progress_callback);

    let use_gpu = config.use_gpu_rendering.unwrap_or(true);

    let result = if use_gpu {
        run_threaded_pipeline(
            config.clone(),
            decoder,
            camera_decoder,
            encoder_type,
            total_frames,
            cancel_flag.clone(),
            processed_frames.clone(),
            progress_callback.clone(),
        )
    } else {
        run_simple_pipeline(
            config.clone(),
            decoder,
            camera_decoder,
            encoder_type,
            total_frames,
            cancel_flag.clone(),
            processed_frames.clone(),
            progress_callback.clone(),
        )
    };

    let elapsed = start_time.elapsed();
    let final_frames = processed_frames.load(Ordering::SeqCst);

    match result {
        Ok(_) => {
            let fps = if elapsed.as_secs_f64() > 0.0 {
                final_frames as f64 / elapsed.as_secs_f64()
            } else {
                0.0
            };
            
            info!("Export completed: {} frames in {:.2}s ({:.1} fps)",
                final_frames,
                elapsed.as_secs_f64(),
                fps
            );

            Ok(ExportResult {
                success: true,
                output_path: Some(config.output_path),
                error: None,
                duration_ms: Some(elapsed.as_millis() as f64),
                encoder_used: Some(encoder_type.name().to_string()),
                total_frames: Some(final_frames),
            })
        }
        Err(ExportError::Cancelled) => {
            warn!("Export cancelled after {} frames", final_frames);
            Ok(ExportResult {
                success: false,
                output_path: None,
                error: Some("Export cancelled".to_string()),
                duration_ms: Some(elapsed.as_millis() as f64),
                encoder_used: Some(encoder_type.name().to_string()),
                total_frames: Some(final_frames),
            })
        }
        Err(e) => {
            error!("Export failed: {}", e);
            Ok(ExportResult {
                success: false,
                output_path: None,
                error: Some(e.to_string()),
                duration_ms: Some(elapsed.as_millis() as f64),
                encoder_used: Some(encoder_type.name().to_string()),
                total_frames: Some(final_frames),
            })
        }
    }
}

fn run_threaded_pipeline<F>(
    config: ExportConfig,
    decoder: VideoDecoder,
    camera_decoder: Option<VideoDecoder>,
    encoder_type: EncoderType,
    total_frames: u32,
    cancel_flag: Arc<AtomicBool>,
    processed_frames: Arc<AtomicU32>,
    progress_callback: Arc<F>,
) -> Result<()>
where
    F: Fn(ExportProgress) + Send + Sync + 'static,
{
    info!("Running threaded pipeline");

    let (render_tx, render_rx): (Sender<RenderedFrame>, Receiver<RenderedFrame>) = bounded(8);

    let cancel_render = cancel_flag.clone();
    let cancel_encode = cancel_flag.clone();

    // 摄像头覆盖配置
    let camera_overlay_config = config.camera_overlay.clone();

    // 加载壁纸/背景图片
    let wallpaper_data = config.wallpaper.as_ref().and_then(|path| {
        load_wallpaper(path, config.width, config.height)
    });

    let render_config = RenderConfig {
        width: config.width,
        height: config.height,
        wallpaper: wallpaper_data,
        zoom_regions: config.zoom_regions.clone(),
        crop_region: config.crop_region.clone(),
        annotations: config.annotation_regions.clone(),
        show_shadow: config.show_shadow,
        shadow_intensity: config.shadow_intensity,
        show_blur: config.show_blur,
        border_radius: config.border_radius.unwrap_or(0.0),
        padding: config.padding.unwrap_or(0.0),
        camera_overlay: camera_overlay_config,
        preview_width: config.preview_width.unwrap_or(800.0),
    };

    let render_handle = std::thread::spawn(move || -> Result<()> {
        info!("Decode+Render thread started");

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| ExportError::Unknown(format!("Failed to create runtime: {}", e)))?;

        let gpu_renderer = rt.block_on(async {
            match GpuRenderer::new(render_config.clone()).await {
                Ok(r) => {
                    info!("GPU renderer initialized");
                    Some(r)
                }
                Err(e) => {
                    warn!("GPU renderer failed: {}, using CPU fallback", e);
                    None
                }
            }
        });

        let cpu_renderer = if gpu_renderer.is_none() {
            Some(CpuRenderer::new(render_config))
        } else {
            None
        };

        let mut decoder = decoder;
        let mut camera_decoder = camera_decoder;

        while let Some(frame) = decoder.next_frame() {
            if cancel_render.load(Ordering::SeqCst) {
                debug!("Render thread cancelled");
                break;
            }

            // 获取对应时间的摄像头帧
            let camera_frame = if let Some(ref mut cam_dec) = camera_decoder {
                cam_dec.next_frame()
            } else {
                None
            };

            let rendered = if let Some(ref renderer) = gpu_renderer {
                renderer.render_frame_with_camera(&frame, camera_frame.as_ref(), frame.timestamp)?
            } else if let Some(ref renderer) = cpu_renderer {
                renderer.render_frame(&frame, frame.timestamp)?
            } else {
                RenderedFrame {
                    data: frame.data,
                    width: frame.width,
                    height: frame.height,
                    timestamp: frame.timestamp,
                    frame_index: frame.frame_index,
                }
            };

            if render_tx.send(rendered).is_err() {
                debug!("Render channel closed");
                break;
            }
        }

        drop(render_tx);
        info!("Decode+Render thread finished");
        Ok(())
    });

    let output_path = config.output_path.clone();
    let input_path = config.input_path.clone();
    let ffmpeg_dir = config.ffmpeg_dir.clone();
    let encode_handle = std::thread::spawn(move || -> Result<()> {
        info!("Encode thread started");

        let encoder_config = EncoderConfig {
            output_path,
            width: config.width,
            height: config.height,
            fps: config.frame_rate,
            bitrate: config.bitrate,
            codec: config.codec.unwrap_or_else(|| "h264".to_string()),
            preferred_encoder: Some(encoder_type),
            ffmpeg_dir,
            input_path: Some(input_path),  // 用于复制音频
        };

        let mut encoder = encoder::create_encoder(encoder_config)?;
        let start_time = Instant::now();

        for frame in render_rx {
            if cancel_encode.load(Ordering::SeqCst) {
                debug!("Encode thread cancelled");
                return Err(ExportError::Cancelled);
            }

            encoder.encode_frame(&frame)?;

            let current = processed_frames.fetch_add(1, Ordering::SeqCst) + 1;
            let elapsed = start_time.elapsed().as_secs_f64();
            let fps = if elapsed > 0.0 { current as f64 / elapsed } else { 0.0 };
            let remaining = if fps > 0.0 {
                Some((total_frames - current) as f64 / fps)
            } else {
                None
            };

            progress_callback(ExportProgress {
                current_frame: current,
                total_frames,
                percentage: (current as f64 / total_frames as f64) * 100.0,
                stage: "encoding".to_string(),
                estimated_time_remaining: remaining,
                fps: Some(fps),
            });
        }

        encoder.finalize()?;
        info!("Encode thread finished");
        Ok(())
    });

    let render_result = render_handle.join()
        .map_err(|_| ExportError::Unknown("Render thread panicked".to_string()))?;
    
    let encode_result = encode_handle.join()
        .map_err(|_| ExportError::Unknown("Encode thread panicked".to_string()))?;

    render_result?;
    encode_result?;

    Ok(())
}

fn run_simple_pipeline<F>(
    config: ExportConfig,
    mut decoder: VideoDecoder,
    _camera_decoder: Option<VideoDecoder>,
    encoder_type: EncoderType,
    total_frames: u32,
    cancel_flag: Arc<AtomicBool>,
    processed_frames: Arc<AtomicU32>,
    progress_callback: Arc<F>,
) -> Result<()>
where
    F: Fn(ExportProgress) + Send + Sync + 'static,
{
    info!("Running simple pipeline (CPU only)");

    // 加载壁纸/背景图片
    let wallpaper_data = config.wallpaper.as_ref().and_then(|path| {
        load_wallpaper(path, config.width, config.height)
    });

    let render_config = RenderConfig {
        width: config.width,
        height: config.height,
        wallpaper: wallpaper_data,
        zoom_regions: config.zoom_regions.clone(),
        crop_region: config.crop_region.clone(),
        annotations: config.annotation_regions.clone(),
        show_shadow: config.show_shadow,
        shadow_intensity: config.shadow_intensity,
        show_blur: config.show_blur,
        border_radius: config.border_radius.unwrap_or(0.0),
        padding: config.padding.unwrap_or(0.0),
        camera_overlay: config.camera_overlay.clone(),
        preview_width: config.preview_width.unwrap_or(800.0),
    };

    let renderer = CpuRenderer::new(render_config);

    let encoder_config = EncoderConfig {
        output_path: config.output_path.clone(),
        width: config.width,
        height: config.height,
        fps: config.frame_rate,
        bitrate: config.bitrate,
        codec: config.codec.unwrap_or_else(|| "h264".to_string()),
        preferred_encoder: Some(encoder_type),
        ffmpeg_dir: config.ffmpeg_dir.clone(),
        input_path: Some(config.input_path.clone()),  // 用于复制音频
    };

    let mut encoder = encoder::create_encoder(encoder_config)?;
    let start_time = Instant::now();

    while let Some(frame) = decoder.next_frame() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(ExportError::Cancelled);
        }

        let rendered = renderer.render_frame(&frame, frame.timestamp)?;

        encoder.encode_frame(&rendered)?;

        let current = processed_frames.fetch_add(1, Ordering::SeqCst) + 1;
        let elapsed = start_time.elapsed().as_secs_f64();
        let fps = if elapsed > 0.0 { current as f64 / elapsed } else { 0.0 };

        progress_callback(ExportProgress {
            current_frame: current,
            total_frames,
            percentage: (current as f64 / total_frames as f64) * 100.0,
            stage: "encoding".to_string(),
            estimated_time_remaining: if fps > 0.0 {
                Some((total_frames - current) as f64 / fps)
            } else {
                None
            },
            fps: Some(fps),
        });
    }

    encoder.finalize()?;
    Ok(())
}
