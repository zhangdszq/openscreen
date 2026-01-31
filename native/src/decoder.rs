//! 视频解码模块

use crate::error::{ExportError, Result};
use crate::types::TrimRegion;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::io::{BufReader, Read};
use tracing::{debug, info, warn};

/// 解码后的视频帧
#[derive(Clone)]
pub struct DecodedFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub timestamp: i64,
    pub frame_index: u32,
}

/// 视频信息
#[derive(Clone, Debug)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub frame_count: u32,
    pub duration: f64,
    pub codec: String,
}

/// 查找 FFmpeg/FFprobe 可执行文件路径
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
        // winget 默认安装位置
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
            debug!("Found {} at: {}", name, candidate);
            return candidate.clone();
        }
    }
    
    // 回退到 PATH 搜索
    name.to_string()
}

fn probe_video<P: AsRef<Path>>(path: P, ffmpeg_dir: Option<&str>) -> Result<VideoInfo> {
    let path_str = path.as_ref().to_string_lossy();
    let ffprobe_path = find_ffmpeg_executable("ffprobe", ffmpeg_dir);
    debug!("Using ffprobe: {}", ffprobe_path);
    
    let output = Command::new(&ffprobe_path)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            "-select_streams", "v:0",
            &path_str,
        ])
        .output()
        .map_err(|e| ExportError::DecoderError(format!("Failed to run ffprobe ({}): {}", ffprobe_path, e)))?;

    if !output.status.success() {
        return Err(ExportError::DecoderError(
            "ffprobe failed - is FFmpeg installed?".to_string()
        ));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| ExportError::DecoderError(format!("Failed to parse ffprobe output: {}", e)))?;

    let streams = json["streams"].as_array()
        .ok_or_else(|| ExportError::DecoderError("No streams found".to_string()))?;
    
    let video_stream = streams.first()
        .ok_or_else(|| ExportError::DecoderError("No video stream found".to_string()))?;

    let width = video_stream["width"].as_u64().unwrap_or(1920) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(1080) as u32;
    
    // 优先使用 avg_frame_rate（更准确），回退到 r_frame_rate
    let fps_str = video_stream["avg_frame_rate"].as_str()
        .filter(|s| !s.is_empty() && *s != "0/0")
        .or_else(|| video_stream["r_frame_rate"].as_str())
        .unwrap_or("30/1");
    let mut fps = parse_frame_rate(fps_str);
    
    // 如果帧率异常（>120fps），默认使用30fps
    if fps > 120.0 || fps <= 0.0 {
        tracing::warn!("Abnormal frame rate detected: {}, using 30 fps", fps);
        fps = 30.0;
    }
    
    let duration = json["format"]["duration"].as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    
    let frame_count = (duration * fps).ceil() as u32;
    let codec = video_stream["codec_name"].as_str().unwrap_or("unknown").to_string();

    Ok(VideoInfo {
        width,
        height,
        fps,
        frame_count,
        duration,
        codec,
    })
}

fn parse_frame_rate(fps_str: &str) -> f64 {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().unwrap_or(30.0);
        let den: f64 = parts[1].parse().unwrap_or(1.0);
        if den > 0.0 { num / den } else { 30.0 }
    } else {
        fps_str.parse().unwrap_or(30.0)
    }
}

/// 视频解码器
pub struct VideoDecoder {
    input_path: String,
    video_info: VideoInfo,
    ffmpeg_process: Option<Child>,
    reader: Option<BufReader<std::process::ChildStdout>>,
    current_frame: u32,
    trim_regions: Vec<TrimRegion>,
    frame_size: usize,
    ffmpeg_dir: Option<String>,
}

impl VideoDecoder {
    pub fn new<P: AsRef<Path>>(path: P, trim_regions: Vec<TrimRegion>, ffmpeg_dir: Option<String>) -> Result<Self> {
        let input_path = path.as_ref().to_string_lossy().to_string();
        
        info!("Opening video: {}", input_path);

        let video_info = probe_video(&input_path, ffmpeg_dir.as_deref())?;
        
        info!("Video info: {}x{} @ {:.2} fps, {} frames, codec: {}",
            video_info.width, video_info.height, video_info.fps, 
            video_info.frame_count, video_info.codec);

        let frame_size = (video_info.width * video_info.height * 4) as usize;

        let mut decoder = Self {
            input_path,
            video_info,
            ffmpeg_process: None,
            reader: None,
            current_frame: 0,
            trim_regions,
            frame_size,
            ffmpeg_dir,
        };

        decoder.start_ffmpeg()?;

        Ok(decoder)
    }

    fn start_ffmpeg(&mut self) -> Result<()> {
        let ffmpeg_path = find_ffmpeg_executable("ffmpeg", self.ffmpeg_dir.as_deref());
        debug!("Using ffmpeg: {}", ffmpeg_path);
        
        let mut cmd = Command::new(&ffmpeg_path);
        
        // 构建帧率参数
        let fps_str = format!("{}", self.video_info.fps.round() as u32);
        
        cmd.args([
            "-i", &self.input_path,
            "-r", &fps_str,           // 输出帧率
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-vsync", "cfr",          // 固定帧率
            "-"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

        let mut process = cmd.spawn()
            .map_err(|e| ExportError::DecoderError(format!("Failed to start FFmpeg ({}): {}", ffmpeg_path, e)))?;

        let stdout = process.stdout.take()
            .ok_or_else(|| ExportError::DecoderError("Failed to capture FFmpeg stdout".to_string()))?;

        self.reader = Some(BufReader::with_capacity(self.frame_size * 2, stdout));
        self.ffmpeg_process = Some(process);
        self.current_frame = 0;

        info!("FFmpeg decoder started");
        Ok(())
    }

    pub fn info(&self) -> &VideoInfo {
        &self.video_info
    }

    pub fn effective_frame_count(&self) -> u32 {
        let trim_frames: u32 = self.trim_regions.iter()
            .map(|r| {
                let start_frame = (r.start_ms / 1000.0 * self.video_info.fps) as u32;
                let end_frame = (r.end_ms / 1000.0 * self.video_info.fps) as u32;
                end_frame.saturating_sub(start_frame)
            })
            .sum();
        
        self.video_info.frame_count.saturating_sub(trim_frames)
    }

    pub fn map_effective_to_source_time(&self, effective_time_ms: f64) -> f64 {
        let mut source_time_ms = effective_time_ms;
        
        let mut sorted_trims = self.trim_regions.clone();
        sorted_trims.sort_by(|a, b| a.start_ms.partial_cmp(&b.start_ms).unwrap());
        
        for trim in &sorted_trims {
            if source_time_ms < trim.start_ms {
                break;
            }
            source_time_ms += trim.end_ms - trim.start_ms;
        }
        
        source_time_ms
    }

    pub fn next_frame(&mut self) -> Option<DecodedFrame> {
        let reader = self.reader.as_mut()?;
        let fps = self.video_info.fps;
        let width = self.video_info.width;
        let height = self.video_info.height;
        let trim_regions = self.trim_regions.clone();

        loop {
            let mut data = vec![0u8; self.frame_size];
            
            match reader.read_exact(&mut data) {
                Ok(_) => {}
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::UnexpectedEof {
                        debug!("End of video stream");
                        return None;
                    }
                    warn!("Read error: {}", e);
                    return None;
                }
            }

            let frame_index = self.current_frame;
            let timestamp_us = (frame_index as f64 / fps * 1_000_000.0) as i64;
            let time_ms = frame_index as f64 / fps * 1000.0;

            self.current_frame += 1;

            // Check if in trim region
            let in_trim = trim_regions.iter().any(|r| time_ms >= r.start_ms && time_ms < r.end_ms);
            if in_trim {
                debug!("Skipping frame {} (in trim region)", frame_index);
                continue;
            }

            // 调试：检查帧数据是否有效（不全是零）
            if frame_index == 0 {
                let non_zero_count = data.iter().filter(|&&b| b != 0).count();
                let total = data.len();
                info!("First frame: {}x{}, {} bytes, non-zero: {}/{} ({:.1}%)", 
                    width, height, total, non_zero_count, total,
                    non_zero_count as f64 / total as f64 * 100.0);
                
                // 打印前几个像素的 RGBA 值
                if data.len() >= 16 {
                    info!("First 4 pixels (RGBA): [{},{},{},{}] [{},{},{},{}] [{},{},{},{}] [{},{},{},{}]",
                        data[0], data[1], data[2], data[3],
                        data[4], data[5], data[6], data[7],
                        data[8], data[9], data[10], data[11],
                        data[12], data[13], data[14], data[15]);
                }
                
                // 检查中间区域的像素
                let mid = (height / 2 * width * 4 + width / 2 * 4) as usize;
                if data.len() > mid + 4 {
                    info!("Center pixel (RGBA): [{},{},{},{}]", data[mid], data[mid+1], data[mid+2], data[mid+3]);
                }
            }

            return Some(DecodedFrame {
                data,
                width,
                height,
                timestamp: timestamp_us,
                frame_index,
            });
        }
    }

    pub fn reset(&mut self) -> Result<()> {
        if let Some(mut process) = self.ffmpeg_process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        self.reader = None;
        
        self.start_ffmpeg()
    }
}

impl Drop for VideoDecoder {
    fn drop(&mut self) {
        if let Some(mut process) = self.ffmpeg_process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
}
