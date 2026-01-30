# OpenScreen Figma Plugin

将 OpenScreen 导出的竞品分析流程图导入 Figma/FigJam。

## 安装步骤

### 1. 编译插件

```bash
cd figma-plugin

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

这会生成 `code.js` 文件。

### 2. 在 Figma 中导入插件

1. 打开 **Figma 桌面端**
2. 点击左上角 Figma 图标 → **Plugins** → **Development** → **Import plugin from manifest...**
3. 选择 `figma-plugin/manifest.json` 文件
4. 插件会出现在 Plugins 菜单中

## 使用方法

### 在 OpenScreen 中导出

1. 在视频编辑器中提取关键帧
2. 打开流程图编辑器
3. 点击"导出"按钮
4. 保存 ZIP 文件

### 在 Figma 中导入

1. 打开 Figma 或 FigJam
2. 运行插件：**Plugins** → **Development** → **OpenScreen Flow Importer**
3. 将 ZIP 文件拖入插件窗口，或点击选择文件
4. 等待导入完成

## 导入效果

- 自动创建包含所有关键帧的 Frame
- 每个关键帧显示截图和标签
- 自动创建节点间的连接线（箭头）
- 在 FigJam 中会使用原生 Connector

## 文件结构

```
figma-plugin/
├── manifest.json    # Figma 插件配置
├── package.json     # Node.js 依赖配置
├── tsconfig.json    # TypeScript 配置
├── code.ts          # 插件主逻辑 (源码)
├── code.js          # 编译后的插件代码 (npm run build 生成)
├── ui.html          # 插件 UI 界面
└── README.md        # 本文件
```

## 开发

```bash
# 监听文件变化，自动编译
npm run watch
```

修改代码后，在 Figma 中右键点击插件 → **Run last plugin** 或按 `Cmd+Option+P` 重新运行。

## 注意事项

1. **网络依赖**：UI 中使用了 CDN 加载的 JSZip 库，首次使用需要网络连接
2. **字体**：默认使用 Inter 字体，如果不可用会使用系统默认字体
3. **FigJam vs Figma**：在 FigJam 中会使用原生连接器，效果更好

## 故障排除

### 插件无法加载
- 确保已运行 `npm run build` 生成 `code.js`
- 检查 `manifest.json` 路径是否正确

### 图片不显示
- 确保 ZIP 文件中包含 `images/` 文件夹
- 检查 `flow.json` 中的 `imageFile` 路径是否正确

### 连接线位置不对
- 尝试在导入后使用 Figma 的自动布局功能调整
