//! Openscreen Native Video Export Module
//!
//! 高性能视频导出模块，使用 Rust + GPU 渲染 + 硬件编码

#![deny(clippy::all)]

mod decoder;
mod encoder;
mod error;
mod pipeline;
mod renderer;
mod types;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

pub use error::ExportError;
pub use types::*;

/// 初始化日志系统
#[napi]
pub fn init_logger(level: Option<String>) {
    let filter = level.unwrap_or_else(|| "info".to_string());
    
    let _ = tracing_subscriber::fmt()
        .with_env_filter(&filter)
        .with_target(false)
        .try_init();
    
    info!("Openscreen native module initialized (log level: {})", filter);
}

/// 检查系统支持的硬件编码器
#[napi]
pub fn get_available_encoders() -> Vec<String> {
    let mut encoders = vec![];

    if encoder::nvenc::is_available() {
        encoders.push("nvenc".to_string());
    }
    if encoder::videotoolbox::is_available() {
        encoders.push("videotoolbox".to_string());
    }
    if encoder::qsv::is_available() {
        encoders.push("qsv".to_string());
    }
    if encoder::amf::is_available() {
        encoders.push("amf".to_string());
    }
    if encoder::vaapi::is_available() {
        encoders.push("vaapi".to_string());
    }

    encoders.push("x264".to_string());

    info!("Available encoders: {:?}", encoders);
    encoders
}

/// 检查 GPU 渲染是否可用
#[napi]
pub async fn check_gpu_support() -> Result<GpuInfo> {
    renderer::check_gpu_support().await.map_err(|e| {
        Error::from_reason(format!("GPU check failed: {}", e))
    })
}

/// 视频导出器
#[napi]
pub struct NativeVideoExporter {
    config: ExportConfig,
    cancel_flag: Arc<AtomicBool>,
    is_running: Arc<AtomicBool>,
}

#[napi]
impl NativeVideoExporter {
    #[napi(constructor)]
    pub fn new(config: ExportConfig) -> Self {
        Self {
            config,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    #[napi]
    pub fn export(&self, progress_callback: JsFunction) -> Result<AsyncTask<ExportTask>> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Err(Error::from_reason("Export already in progress"));
        }

        self.cancel_flag.store(false, Ordering::SeqCst);

        let tsfn: ThreadsafeFunction<ExportProgress, ErrorStrategy::Fatal> = progress_callback
            .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;

        let task = ExportTask {
            config: self.config.clone(),
            cancel_flag: self.cancel_flag.clone(),
            is_running: self.is_running.clone(),
            progress_callback: tsfn,
        };

        Ok(AsyncTask::new(task))
    }

    #[napi]
    pub fn cancel(&self) -> bool {
        if self.is_running.load(Ordering::SeqCst) {
            self.cancel_flag.store(true, Ordering::SeqCst);
            info!("Export cancelled by user");
            true
        } else {
            warn!("No export in progress to cancel");
            false
        }
    }

    #[napi(getter)]
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
}

/// 导出任务
pub struct ExportTask {
    config: ExportConfig,
    cancel_flag: Arc<AtomicBool>,
    is_running: Arc<AtomicBool>,
    progress_callback: ThreadsafeFunction<ExportProgress, ErrorStrategy::Fatal>,
}

impl Task for ExportTask {
    type Output = ExportResult;
    type JsValue = ExportResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let config = self.config.clone();
        let cancel_flag = self.cancel_flag.clone();
        let tsfn = self.progress_callback.clone();

        let result = pipeline::run_export_pipeline(config, cancel_flag, move |progress| {
            tsfn.call(progress, ThreadsafeFunctionCallMode::NonBlocking);
        });

        self.is_running.store(false, Ordering::SeqCst);

        result.map_err(|e| Error::from_reason(format!("Export failed: {}", e)))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// 检查 FFmpeg 是否可用
#[napi]
pub fn check_ffmpeg() -> bool {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 获取 FFmpeg 版本
#[napi]
pub fn get_ffmpeg_version() -> Option<String> {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .next()
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
}
