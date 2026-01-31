//! 错误处理模块

use thiserror::Error;

/// 导出错误类型
#[derive(Error, Debug)]
pub enum ExportError {
    #[error("Failed to open input video: {0}")]
    InputError(String),

    #[error("Failed to create output file: {0}")]
    OutputError(String),

    #[error("Decoder error: {0}")]
    DecoderError(String),

    #[error("Encoder error: {0}")]
    EncoderError(String),

    #[error("Renderer error: {0}")]
    RendererError(String),

    #[error("GPU initialization failed: {0}")]
    GpuError(String),

    #[error("FFmpeg error: {0}")]
    FfmpegError(String),

    #[error("Invalid configuration: {0}")]
    ConfigError(String),

    #[error("Export cancelled by user")]
    Cancelled,

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<ExportError> for napi::Error {
    fn from(err: ExportError) -> Self {
        napi::Error::from_reason(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ExportError>;
