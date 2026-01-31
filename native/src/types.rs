//! 类型定义模块

use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// 缩放区域配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomRegion {
    /// 区域 ID
    pub id: String,
    /// 开始时间 (毫秒)
    #[napi(js_name = "startMs")]
    pub start_ms: f64,
    /// 结束时间 (毫秒)
    #[napi(js_name = "endMs")]
    pub end_ms: f64,
    /// 缩放中心 X (0-1)
    #[napi(js_name = "targetX")]
    pub target_x: f64,
    /// 缩放中心 Y (0-1)
    #[napi(js_name = "targetY")]
    pub target_y: f64,
    /// 缩放比例
    pub scale: f64,
    /// 缓动函数
    pub easing: Option<String>,
}

/// 裁剪区域配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropRegion {
    /// 左边界 (0-1)
    pub left: f64,
    /// 上边界 (0-1)
    pub top: f64,
    /// 右边界 (0-1)
    pub right: f64,
    /// 下边界 (0-1)
    pub bottom: f64,
}

/// 裁剪时间段配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrimRegion {
    /// 区域 ID
    pub id: String,
    /// 开始时间 (毫秒)
    #[napi(js_name = "startMs")]
    pub start_ms: f64,
    /// 结束时间 (毫秒)
    #[napi(js_name = "endMs")]
    pub end_ms: f64,
}

/// 标注区域配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationRegion {
    /// 区域 ID
    pub id: String,
    /// 标注类型
    #[napi(js_name = "annotationType")]
    pub annotation_type: String,
    /// 开始时间 (毫秒)
    #[napi(js_name = "startMs")]
    pub start_ms: f64,
    /// 结束时间 (毫秒)
    #[napi(js_name = "endMs")]
    pub end_ms: f64,
    /// X 坐标 (0-1)
    pub x: f64,
    /// Y 坐标 (0-1)
    pub y: f64,
    /// 宽度 (0-1)
    pub width: Option<f64>,
    /// 高度 (0-1)
    pub height: Option<f64>,
    /// 颜色
    pub color: Option<String>,
    /// 文本内容
    pub text: Option<String>,
    /// 线条宽度
    #[napi(js_name = "strokeWidth")]
    pub stroke_width: Option<f64>,
}

/// 摄像头覆盖层配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraOverlay {
    /// 是否启用
    pub enabled: bool,
    /// 摄像头视频路径
    #[napi(js_name = "videoPath")]
    pub video_path: Option<String>,
    /// 形状 (circle/rectangle)
    pub shape: String,
    /// 大小百分比
    pub size: f64,
    /// 位置
    pub position: CameraPosition,
    /// 透明度 (0-1)
    pub opacity: f64,
    /// 边框样式
    #[napi(js_name = "borderStyle")]
    pub border_style: String,
}

/// 摄像头位置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraPosition {
    /// X 坐标 (0-1)
    pub x: f64,
    /// Y 坐标 (0-1)
    pub y: f64,
}

/// 导出配置
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    /// 输入视频路径
    #[napi(js_name = "inputPath")]
    pub input_path: String,
    /// 输出视频路径
    #[napi(js_name = "outputPath")]
    pub output_path: String,
    /// 输出宽度
    pub width: u32,
    /// 输出高度
    pub height: u32,
    /// 帧率
    #[napi(js_name = "frameRate")]
    pub frame_rate: u32,
    /// 比特率 (bps)
    pub bitrate: u32,
    /// 编码器 (h264/h265/vp9)
    pub codec: Option<String>,
    /// 壁纸/背景图片路径
    pub wallpaper: Option<String>,
    /// 缩放区域
    #[napi(js_name = "zoomRegions")]
    pub zoom_regions: Vec<ZoomRegion>,
    /// 裁剪区域
    #[napi(js_name = "cropRegion")]
    pub crop_region: Option<CropRegion>,
    /// 时间裁剪
    #[napi(js_name = "trimRegions")]
    pub trim_regions: Vec<TrimRegion>,
    /// 标注
    #[napi(js_name = "annotationRegions")]
    pub annotation_regions: Vec<AnnotationRegion>,
    /// 摄像头覆盖
    #[napi(js_name = "cameraOverlay")]
    pub camera_overlay: Option<CameraOverlay>,
    /// 是否显示阴影
    #[napi(js_name = "showShadow")]
    pub show_shadow: bool,
    /// 阴影强度 (0-1，与编辑器一致)
    #[napi(js_name = "shadowIntensity")]
    pub shadow_intensity: f64,
    /// 是否显示模糊背景
    #[napi(js_name = "showBlur")]
    pub show_blur: bool,
    /// 是否启用运动模糊
    #[napi(js_name = "motionBlurEnabled")]
    pub motion_blur_enabled: bool,
    /// 圆角半径 (像素，基于预览尺寸)
    #[napi(js_name = "borderRadius")]
    pub border_radius: Option<f64>,
    /// 内边距 (0-100 百分比)
    pub padding: Option<f64>,
    /// 预览区域宽度 (用于缩放 borderRadius)
    #[napi(js_name = "previewWidth")]
    pub preview_width: Option<f64>,
    /// 首选编码器 (nvenc/qsv/amf/videotoolbox/vaapi/x264)
    #[napi(js_name = "preferredEncoder")]
    pub preferred_encoder: Option<String>,
    /// 是否使用 GPU 渲染
    #[napi(js_name = "useGpuRendering")]
    pub use_gpu_rendering: Option<bool>,
    /// 并发线程数 (0 = 自动)
    pub concurrency: Option<u32>,
    /// FFmpeg 可执行文件目录路径 (可选，不指定则使用系统 PATH)
    #[napi(js_name = "ffmpegDir")]
    pub ffmpeg_dir: Option<String>,
}

/// 导出进度
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProgress {
    /// 当前帧
    #[napi(js_name = "currentFrame")]
    pub current_frame: u32,
    /// 总帧数
    #[napi(js_name = "totalFrames")]
    pub total_frames: u32,
    /// 进度百分比 (0-100)
    pub percentage: f64,
    /// 当前阶段
    pub stage: String,
    /// 预计剩余时间 (秒)
    #[napi(js_name = "estimatedTimeRemaining")]
    pub estimated_time_remaining: Option<f64>,
    /// 当前处理速度 (帧/秒)
    pub fps: Option<f64>,
}

/// 导出结果
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    /// 是否成功
    pub success: bool,
    /// 输出文件路径
    #[napi(js_name = "outputPath")]
    pub output_path: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 总耗时 (毫秒)
    #[napi(js_name = "durationMs")]
    pub duration_ms: Option<f64>,
    /// 使用的编码器
    #[napi(js_name = "encoderUsed")]
    pub encoder_used: Option<String>,
    /// 总帧数
    #[napi(js_name = "totalFrames")]
    pub total_frames: Option<u32>,
}

/// GPU 信息
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    /// 是否支持 GPU 渲染
    pub supported: bool,
    /// GPU 名称
    pub name: Option<String>,
    /// 后端类型 (Vulkan/Metal/DX12)
    pub backend: Option<String>,
    /// 显存大小 (MB)
    #[napi(js_name = "memoryMb")]
    pub memory_mb: Option<u32>,
}
