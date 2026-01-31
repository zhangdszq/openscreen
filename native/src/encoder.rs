//! 视频编码模块
//!
//! 支持多种硬件加速编码器：NVENC (NVIDIA), QSV (Intel), AMF (AMD), VideoToolbox (Mac)

use crate::error::{ExportError, Result};
use crate::renderer::RenderedFrame;
use std::io::Write;
use std::process::{Child, Command, Stdio};
use tracing::{debug, info, warn};

/// 编码器类型
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EncoderType {
    /// NVIDIA NVENC
    Nvenc,
    /// Intel Quick Sync Video
    Qsv,
    /// AMD Advanced Media Framework
    Amf,
    /// Apple VideoToolbox
    VideoToolbox,
    /// Linux VAAPI
    Vaapi,
    /// 软件编码 (x264)
    X264,
}

impl EncoderType {
    pub fn name(&self) -> &'static str {
        match self {
            EncoderType::Nvenc => "nvenc",
            EncoderType::Qsv => "qsv",
            EncoderType::Amf => "amf",
            EncoderType::VideoToolbox => "videotoolbox",
            EncoderType::Vaapi => "vaapi",
            EncoderType::X264 => "x264",
        }
    }

    pub fn ffmpeg_codec(&self) -> &'static str {
        match self {
            EncoderType::Nvenc => "h264_nvenc",
            EncoderType::Qsv => "h264_qsv",
            EncoderType::Amf => "h264_amf",
            EncoderType::VideoToolbox => "h264_videotoolbox",
            EncoderType::Vaapi => "h264_vaapi",
            EncoderType::X264 => "libx264",
        }
    }
}

/// 编码配置
pub struct EncoderConfig {
    /// 输出路径
    pub output_path: String,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 帧率
    pub fps: u32,
    /// 比特率 (bps)
    pub bitrate: u32,
    /// 编码格式 (h264/h265)
    pub codec: String,
    /// 首选编码器
    pub preferred_encoder: Option<EncoderType>,
    /// FFmpeg 目录路径
    pub ffmpeg_dir: Option<String>,
    /// 输入视频路径（用于复制音频轨道）
    pub input_path: Option<String>,
}

/// 视频编码器 trait
pub trait VideoEncoder: Send {
    fn encode_frame(&mut self, frame: &RenderedFrame) -> Result<()>;
    fn finalize(&mut self) -> Result<()>;
    fn encoder_type(&self) -> EncoderType;
}

/// 获取 FFmpeg 编码器列表（缓存）
fn get_ffmpeg_encoders() -> Option<String> {
    use std::process::Command;
    use tracing::debug;
    
    // 尝试多个可能的 FFmpeg 路径
    let ffmpeg_paths = [
        "ffmpeg",
        "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        // winget 安装的默认路径
        &format!("{}\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe", 
            std::env::var("USERPROFILE").unwrap_or_default()),
    ];
    
    for ffmpeg_path in &ffmpeg_paths {
        match Command::new(ffmpeg_path)
            .args(["-hide_banner", "-encoders"])
            .output()
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                debug!("FFmpeg found at: {}", ffmpeg_path);
                return Some(stdout);
            }
            Ok(output) => {
                debug!("FFmpeg at {} returned error: {:?}", ffmpeg_path, output.status);
            }
            Err(e) => {
                debug!("FFmpeg not found at {}: {}", ffmpeg_path, e);
            }
        }
    }
    
    tracing::warn!("FFmpeg not found in any known location");
    None
}

/// 硬件编码器检测
pub mod nvenc {
    use super::get_ffmpeg_encoders;
    
    pub fn is_available() -> bool {
        get_ffmpeg_encoders()
            .map(|encoders| encoders.contains("h264_nvenc"))
            .unwrap_or(false)
    }
}

pub mod qsv {
    use super::get_ffmpeg_encoders;
    
    pub fn is_available() -> bool {
        get_ffmpeg_encoders()
            .map(|encoders| encoders.contains("h264_qsv"))
            .unwrap_or(false)
    }
}

pub mod amf {
    use super::get_ffmpeg_encoders;
    
    pub fn is_available() -> bool {
        get_ffmpeg_encoders()
            .map(|encoders| encoders.contains("h264_amf"))
            .unwrap_or(false)
    }
}

pub mod videotoolbox {
    use super::get_ffmpeg_encoders;
    
    pub fn is_available() -> bool {
        #[cfg(target_os = "macos")]
        {
            return get_ffmpeg_encoders()
                .map(|encoders| encoders.contains("h264_videotoolbox"))
                .unwrap_or(false);
        }
        #[cfg(not(target_os = "macos"))]
        false
    }
}

pub mod vaapi {
    use super::get_ffmpeg_encoders;
    
    pub fn is_available() -> bool {
        #[cfg(target_os = "linux")]
        {
            // 检查 VAAPI 设备
            if !std::path::Path::new("/dev/dri/renderD128").exists() {
                return false;
            }
            
            return get_ffmpeg_encoders()
                .map(|encoders| encoders.contains("h264_vaapi"))
                .unwrap_or(false);
        }
        #[cfg(not(target_os = "linux"))]
        false
    }
}

/// 选择最佳编码器
pub fn select_encoder(preferred: Option<EncoderType>) -> EncoderType {
    // 如果指定了首选编码器且可用，使用它
    if let Some(encoder) = preferred {
        if is_encoder_available(encoder) {
            info!("Using preferred encoder: {:?}", encoder);
            return encoder;
        }
        warn!("Preferred encoder {:?} not available, auto-selecting", encoder);
    }

    // 按优先级检测可用的编码器
    let candidates = [
        EncoderType::Nvenc,
        EncoderType::VideoToolbox,
        EncoderType::Qsv,
        EncoderType::Amf,
        EncoderType::Vaapi,
    ];

    for encoder in candidates {
        if is_encoder_available(encoder) {
            info!("Auto-selected encoder: {:?}", encoder);
            return encoder;
        }
    }

    // 回退到软件编码
    info!("Falling back to software encoder (x264)");
    EncoderType::X264
}

fn is_encoder_available(encoder: EncoderType) -> bool {
    match encoder {
        EncoderType::Nvenc => nvenc::is_available(),
        EncoderType::Qsv => qsv::is_available(),
        EncoderType::Amf => amf::is_available(),
        EncoderType::VideoToolbox => videotoolbox::is_available(),
        EncoderType::Vaapi => vaapi::is_available(),
        EncoderType::X264 => true,
    }
}

/// 创建编码器实例
pub fn create_encoder(config: EncoderConfig) -> Result<Box<dyn VideoEncoder>> {
    let encoder_type = select_encoder(config.preferred_encoder);
    Ok(Box::new(FfmpegPipeEncoder::new(config, encoder_type)?))
}

/// 查找 FFmpeg 可执行文件路径
fn find_ffmpeg_executable(name: &str, ffmpeg_dir: Option<&str>) -> String {
    // 如果指定了 ffmpeg_dir，优先使用
    if let Some(dir) = ffmpeg_dir {
        #[cfg(target_os = "windows")]
        let path = format!("{}\\{}.exe", dir, name);
        #[cfg(not(target_os = "windows"))]
        let path = format!("{}/{}", dir, name);
        
        if std::path::Path::new(&path).exists() {
            debug!("Found {} at specified dir: {}", name, path);
            return path;
        }
        warn!("FFmpeg not found at specified dir: {}, falling back to system search", path);
    }
    
    // Windows 上常见的 FFmpeg 安装位置
    #[cfg(target_os = "windows")]
    let candidates = vec![
        format!("{}.exe", name),
        format!("C:\\Program Files\\FFmpeg\\bin\\{}.exe", name),
        format!("C:\\Program Files (x86)\\FFmpeg\\bin\\{}.exe", name),
        format!("C:\\ffmpeg\\bin\\{}.exe", name),
        format!("C:\\Users\\{}\\AppData\\Local\\Microsoft\\WinGet\\Links\\{}.exe", 
            std::env::var("USERNAME").unwrap_or_default(), name),
    ];
    
    #[cfg(not(target_os = "windows"))]
    let candidates = vec![
        name.to_string(),
        format!("/usr/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        format!("/opt/homebrew/bin/{}", name),
    ];
    
    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return candidate.clone();
        }
    }
    
    name.to_string()
}

/// FFmpeg 管道编码器
pub struct FfmpegPipeEncoder {
    process: Child,
    stdin: std::process::ChildStdin,
    encoder_type: EncoderType,
    frame_count: u32,
    width: u32,
    height: u32,
}

impl FfmpegPipeEncoder {
    pub fn new(config: EncoderConfig, encoder_type: EncoderType) -> Result<Self> {
        let ffmpeg_codec = encoder_type.ffmpeg_codec();
        let bitrate_k = config.bitrate / 1000;
        let ffmpeg_path = find_ffmpeg_executable("ffmpeg", config.ffmpeg_dir.as_deref());

        info!("Starting FFmpeg encoder: {} ({}x{} @ {} fps, {} kbps)",
            ffmpeg_codec, config.width, config.height, config.fps, bitrate_k);
        debug!("Using ffmpeg: {}", ffmpeg_path);

        let mut cmd = Command::new(&ffmpeg_path);
        
        // 视频输入参数（从管道）
        cmd.args([
            "-y",                                              // 覆盖输出
            "-f", "rawvideo",                                  // 输入格式
            "-pix_fmt", "rgba",                                // 输入像素格式
            "-s", &format!("{}x{}", config.width, config.height), // 分辨率
            "-r", &config.fps.to_string(),                     // 帧率
            "-i", "pipe:0",                                    // 从 stdin 读取视频
        ]);
        
        // 音频输入参数（从原始文件）
        if let Some(ref input_path) = config.input_path {
            info!("Adding audio from: {}", input_path);
            cmd.args(["-i", input_path]);
        }

        // 编码参数（根据编码器类型调整）
        match encoder_type {
            EncoderType::Nvenc => {
                cmd.args([
                    "-c:v", ffmpeg_codec,
                    "-preset", "p4",           // 平衡预设
                    "-tune", "hq",             // 高质量调优
                    "-rc", "vbr",              // 可变码率
                    "-b:v", &format!("{}k", bitrate_k),
                    "-maxrate", &format!("{}k", bitrate_k * 2),
                    "-bufsize", &format!("{}k", bitrate_k * 4),
                ]);
            }
            EncoderType::VideoToolbox => {
                cmd.args([
                    "-c:v", ffmpeg_codec,
                    "-b:v", &format!("{}k", bitrate_k),
                    "-profile:v", "high",
                    "-level", "4.2",
                ]);
            }
            EncoderType::Qsv => {
                cmd.args([
                    "-c:v", ffmpeg_codec,
                    "-preset", "medium",
                    "-b:v", &format!("{}k", bitrate_k),
                    "-maxrate", &format!("{}k", bitrate_k * 2),
                ]);
            }
            EncoderType::X264 => {
                cmd.args([
                    "-c:v", ffmpeg_codec,
                    "-preset", "fast",         // 快速预设
                    "-crf", "23",              // 质量因子
                    "-b:v", &format!("{}k", bitrate_k),
                    "-maxrate", &format!("{}k", bitrate_k * 2),
                    "-bufsize", &format!("{}k", bitrate_k * 4),
                    "-profile:v", "high",
                    "-level", "4.2",
                ]);
            }
            _ => {
                cmd.args([
                    "-c:v", ffmpeg_codec,
                    "-b:v", &format!("{}k", bitrate_k),
                ]);
            }
        }

        // 输出参数
        if config.input_path.is_some() {
            // 有音频输入时，映射视频（管道）和音频（原始文件）
            cmd.args([
                "-map", "0:v",                                     // 视频来自第一个输入（管道）
                "-map", "1:a?",                                    // 音频来自第二个输入（原始文件，可选）
                "-c:a", "aac",                                     // 音频编码为 AAC
                "-b:a", "192k",                                    // 音频比特率
            ]);
        }
        cmd.args([
            "-pix_fmt", "yuv420p",                             // 输出像素格式
            "-movflags", "+faststart",                         // MP4 快速启动
            &config.output_path,
        ]);

        cmd.stdin(Stdio::piped())
           .stdout(Stdio::null())
           .stderr(Stdio::piped());

        debug!("FFmpeg command: {:?}", cmd);

        let mut process = cmd.spawn()
            .map_err(|e| ExportError::EncoderError(format!("Failed to start FFmpeg: {}", e)))?;

        let stdin = process.stdin.take()
            .ok_or_else(|| ExportError::EncoderError("Failed to open FFmpeg stdin".to_string()))?;

        Ok(Self {
            process,
            stdin,
            encoder_type,
            frame_count: 0,
            width: config.width,
            height: config.height,
        })
    }
}

impl VideoEncoder for FfmpegPipeEncoder {
    fn encode_frame(&mut self, frame: &RenderedFrame) -> Result<()> {
        // 验证帧尺寸
        let expected_size = (self.width * self.height * 4) as usize;
        if frame.data.len() != expected_size {
            return Err(ExportError::EncoderError(format!(
                "Frame size mismatch: expected {}, got {}",
                expected_size, frame.data.len()
            )));
        }

        // 调试：检查第一帧数据是否有效
        if self.frame_count == 0 {
            let non_zero = frame.data.iter().filter(|&&b| b != 0).count();
            info!("Encoder received first frame: {} bytes, non-zero: {}/{} ({:.1}%)",
                frame.data.len(), non_zero, frame.data.len(),
                non_zero as f64 / frame.data.len() as f64 * 100.0);
            
            // 打印前几个像素的 RGBA 值
            if frame.data.len() >= 16 {
                info!("Rendered first 4 pixels (RGBA): [{},{},{},{}] [{},{},{},{}] [{},{},{},{}] [{},{},{},{}]",
                    frame.data[0], frame.data[1], frame.data[2], frame.data[3],
                    frame.data[4], frame.data[5], frame.data[6], frame.data[7],
                    frame.data[8], frame.data[9], frame.data[10], frame.data[11],
                    frame.data[12], frame.data[13], frame.data[14], frame.data[15]);
            }
            
            // 检查中间区域的像素
            let mid = frame.data.len() / 2;
            if frame.data.len() > mid + 4 {
                info!("Rendered center pixel (RGBA): [{},{},{},{}]", 
                    frame.data[mid], frame.data[mid+1], frame.data[mid+2], frame.data[mid+3]);
            }
        }

        self.stdin.write_all(&frame.data)
            .map_err(|e| ExportError::EncoderError(format!("Failed to write frame: {}", e)))?;

        self.frame_count += 1;
        
        if self.frame_count % 100 == 0 {
            debug!("Encoded {} frames", self.frame_count);
        }

        Ok(())
    }

    fn finalize(&mut self) -> Result<()> {
        // 刷新并关闭 stdin
        self.stdin.flush()
            .map_err(|e| ExportError::EncoderError(format!("Failed to flush: {}", e)))?;
        
        // 关闭 stdin 以通知 FFmpeg 结束
        drop(std::mem::replace(&mut self.stdin, unsafe {
            std::mem::zeroed()
        }));

        // 等待 FFmpeg 完成
        let status = self.process.wait()
            .map_err(|e| ExportError::EncoderError(format!("FFmpeg wait failed: {}", e)))?;

        if !status.success() {
            // 尝试读取错误输出
            if let Some(ref mut stderr) = self.process.stderr {
                let mut error_msg = String::new();
                use std::io::Read;
                let _ = stderr.read_to_string(&mut error_msg);
                if !error_msg.is_empty() {
                    warn!("FFmpeg stderr: {}", error_msg);
                }
            }
            return Err(ExportError::EncoderError(format!(
                "FFmpeg exited with status: {}",
                status
            )));
        }

        info!("Encoding complete: {} frames encoded with {:?}",
            self.frame_count, self.encoder_type);

        Ok(())
    }

    fn encoder_type(&self) -> EncoderType {
        self.encoder_type
    }
}

impl Drop for FfmpegPipeEncoder {
    fn drop(&mut self) {
        // 确保进程被正确终止
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}
