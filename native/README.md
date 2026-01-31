# Openscreen Native Module

高性能视频导出原生模块，使用 Rust + GPU 渲染 + 硬件编码。

## 特性

- 🚀 **多线程并行处理** - 解码、渲染、编码同时进行
- 🎮 **GPU 加速渲染** - 使用 WebGPU (wgpu) 进行效果渲染
- ⚡ **硬件编码** - 支持 NVENC (NVIDIA), QSV (Intel), AMF (AMD), VideoToolbox (Mac)
- 🔄 **FFmpeg 管道** - 通过 FFmpeg CLI 进行编解码

## 支持的平台

| 平台 | GPU 渲染 | 硬件编码 |
|------|----------|----------|
| Windows x64 | ✅ DirectX 12/Vulkan | ✅ NVENC/QSV/AMF |
| macOS Intel | ✅ Metal | ✅ VideoToolbox |
| macOS Apple Silicon | ✅ Metal | ✅ VideoToolbox |
| Linux x64 | ✅ Vulkan | ✅ NVENC/VAAPI |

## 前置依赖

### 所有平台

1. **Rust** 1.70+ - https://rustup.rs/
2. **Node.js** 18+
3. **FFmpeg** - 必须安装并在 PATH 中可用

### Windows

```powershell
# 安装 Rust
winget install Rustlang.Rustup

# 安装 FFmpeg
winget install FFmpeg

# 安装 Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools
```

### macOS

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Xcode Command Line Tools
xcode-select --install

# 安装 FFmpeg
brew install ffmpeg
```

### Linux

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Ubuntu/Debian
sudo apt install build-essential ffmpeg

# Fedora
sudo dnf install gcc ffmpeg
```

## 构建

```bash
# 进入 native 目录
cd native

# 安装 Node.js 依赖
npm install

# 构建 (Debug)
npm run build:debug

# 构建 (Release) - 推荐用于生产
npm run build
```

构建成功后会生成：
- `openscreen-native.win32-x64-msvc.node` (Windows)
- `openscreen-native.darwin-x64.node` (macOS Intel)
- `openscreen-native.darwin-arm64.node` (macOS Apple Silicon)
- `openscreen-native.linux-x64-gnu.node` (Linux)
- `index.js` - JavaScript 入口
- `index.d.ts` - TypeScript 类型定义

## 使用方法

### 在 Node.js/Electron 中使用

```javascript
const {
  NativeVideoExporter,
  getAvailableEncoders,
  checkGpuSupport,
  checkFfmpeg,
  initLogger,
} = require('./native');

// 初始化日志 (可选)
initLogger('info');

// 检查 FFmpeg
if (!checkFfmpeg()) {
  console.error('FFmpeg not found! Please install FFmpeg.');
  process.exit(1);
}

// 查看可用编码器
console.log('Available encoders:', getAvailableEncoders());

// 检查 GPU 支持
const gpuInfo = await checkGpuSupport();
console.log('GPU:', gpuInfo);

// 创建导出配置
const config = {
  inputPath: '/path/to/input.webm',
  outputPath: '/path/to/output.mp4',
  width: 1920,
  height: 1080,
  frameRate: 30,
  bitrate: 15000000,  // 15 Mbps
  zoomRegions: [],
  trimRegions: [],
  annotationRegions: [],
  showShadow: true,
  shadowIntensity: 60,
  showBlur: false,
  motionBlurEnabled: false,
  borderRadius: 12,
  padding: 5,
  preferredEncoder: 'nvenc',  // 或 'videotoolbox', 'qsv', 'x264'
  useGpuRendering: true,
};

// 创建导出器
const exporter = new NativeVideoExporter(config);

// 执行导出
const result = await exporter.export((progress) => {
  console.log(`Progress: ${progress.percentage.toFixed(1)}%`);
  console.log(`FPS: ${progress.fps?.toFixed(1)}`);
  console.log(`ETA: ${progress.estimatedTimeRemaining?.toFixed(0)}s`);
});

if (result.success) {
  console.log('Export completed:', result.outputPath);
  console.log('Duration:', result.durationMs, 'ms');
  console.log('Encoder:', result.encoderUsed);
  console.log('Frames:', result.totalFrames);
} else {
  console.error('Export failed:', result.error);
}
```

### 取消导出

```javascript
// 在另一个地方取消导出
exporter.cancel();

// 检查是否正在运行
if (exporter.isRunning) {
  console.log('Export in progress...');
}
```

## API 参考

### 函数

| 函数 | 描述 |
|------|------|
| `initLogger(level?)` | 初始化日志系统 |
| `getAvailableEncoders()` | 获取可用的硬件编码器列表 |
| `checkGpuSupport()` | 检查 GPU 渲染支持 |
| `checkFfmpeg()` | 检查 FFmpeg 是否可用 |
| `getFfmpegVersion()` | 获取 FFmpeg 版本 |
| `quickExport(config, callback)` | 快速导出（无需创建实例） |

### NativeVideoExporter

| 方法/属性 | 描述 |
|-----------|------|
| `new NativeVideoExporter(config)` | 创建导出器实例 |
| `export(progressCallback)` | 开始导出 |
| `cancel()` | 取消导出 |
| `isRunning` | 是否正在导出 |

### ExportConfig

```typescript
interface ExportConfig {
  inputPath: string;        // 输入视频路径
  outputPath: string;       // 输出视频路径
  width: number;            // 输出宽度
  height: number;           // 输出高度
  frameRate: number;        // 帧率
  bitrate: number;          // 比特率 (bps)
  codec?: string;           // 编码格式
  wallpaper?: string;       // 背景图片路径
  zoomRegions: ZoomRegion[];
  cropRegion?: CropRegion;
  trimRegions: TrimRegion[];
  annotationRegions: AnnotationRegion[];
  cameraOverlay?: CameraOverlay;
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  motionBlurEnabled: boolean;
  borderRadius?: number;
  padding?: number;
  preferredEncoder?: string;  // 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'vaapi' | 'x264'
  useGpuRendering?: boolean;
  concurrency?: number;
}
```

## 性能对比

| 方案 | 1080p 60s 视频 | 相对速度 |
|------|----------------|----------|
| WebCodecs (JS) | ~120s | 1x |
| Native + x264 | ~40s | 3x |
| Native + GPU | ~20s | 6x |
| Native + NVENC | ~10s | 12x |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Node.js (napi-rs)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   Decoder    │──►│   Renderer   │──►│   Encoder    │    │
│  │ (FFmpeg CLI) │   │ (wgpu/GPU)   │   │ (FFmpeg CLI) │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           crossbeam-channel (并行通道)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 故障排除

### FFmpeg 未找到

确保 FFmpeg 已安装并在 PATH 中：

```bash
ffmpeg -version
```

### GPU 渲染失败

如果 GPU 渲染失败，模块会自动回退到 CPU 渲染。检查：

1. 显卡驱动是否最新
2. Vulkan/Metal 是否支持

### 硬件编码不可用

运行以下命令检查 FFmpeg 支持的编码器：

```bash
ffmpeg -encoders | grep -E "nvenc|qsv|amf|videotoolbox|vaapi"
```

## 开发

### 运行测试

```bash
cargo test
```

### 调试模式

```bash
# 启用详细日志
RUST_LOG=debug npm run build:debug
```

### 生成类型定义

构建后会自动生成 `index.d.ts`。

## 许可证

MIT
