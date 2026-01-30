/**
 * Figma Exporter
 * 
 * Exports flow graphs to a package format that can be imported into Figma.
 * Since Figma REST API doesn't support creating nodes, we export as:
 * - Individual keyframe images
 * - JSON metadata describing the flow graph
 * - README with import instructions
 */

import JSZip from 'jszip';
import type { FlowGraph } from '@/components/video-editor/types';
import { keyframeToBlob, getKeyframeFileExtension } from '@/pro/keyframe';

/**
 * Figma export package format
 */
export interface FigmaExportPackage {
  version: string;
  exportedAt: string;
  projectName: string;
  description?: string;
  keyframes: FigmaKeyframeData[];
  connections: FigmaConnectionData[];
  layout: {
    canvasWidth: number;
    canvasHeight: number;
    nodeWidth: number;
    nodeHeight: number;
  };
}

export interface FigmaKeyframeData {
  id: string;
  imageFile: string;
  label: string;
  timestamp: number;
  position: { x: number; y: number };
  source: string;
  metadata?: {
    pageUrl?: string;
    pageTitle?: string;
    notes?: string;
  };
}

export interface FigmaConnectionData {
  id: string;
  from: string;
  to: string;
  label?: string;
}

/**
 * Export options
 */
export interface FigmaExportOptions {
  projectName: string;
  description?: string;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality?: number;
  includeReadme?: boolean;
}

const DEFAULT_OPTIONS: FigmaExportOptions = {
  projectName: '竞品分析流程图',
  imageFormat: 'png',
  imageQuality: 0.92,
  includeReadme: true,
};

/**
 * Export flow graph to a ZIP file
 */
export async function exportToFigmaPackage(
  flowGraph: FlowGraph,
  options: Partial<FigmaExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const zip = new JSZip();

  // Create images folder
  const imagesFolder = zip.folder('images');
  if (!imagesFolder) {
    throw new Error('Failed to create images folder in ZIP');
  }

  // Calculate layout bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const nodeWidth = 180;
  const nodeHeight = 120;

  flowGraph.keyframes.forEach(kf => {
    const pos = kf.flowPosition || { x: 0, y: 0 };
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  });

  // Normalize positions (start from 0,0)
  const offsetX = minX < 0 ? -minX : 0;
  const offsetY = minY < 0 ? -minY : 0;

  // Process keyframes
  const keyframeData: FigmaKeyframeData[] = [];
  const ext = getKeyframeFileExtension(opts.imageFormat);

  for (let i = 0; i < flowGraph.keyframes.length; i++) {
    const kf = flowGraph.keyframes[i];
    const imageFileName = `keyframe_${i + 1}${ext}`;
    
    // Add image to ZIP
    if (kf.imageData) {
      const blob = keyframeToBlob(kf);
      if (blob) {
        imagesFolder.file(imageFileName, blob);
      }
    }

    // Calculate normalized position
    const pos = kf.flowPosition || { x: 0, y: 0 };
    
    keyframeData.push({
      id: kf.id,
      imageFile: `images/${imageFileName}`,
      label: kf.label || `关键帧 ${i + 1}`,
      timestamp: kf.timestampMs,
      position: {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      },
      source: kf.source,
      metadata: kf.metadata ? {
        pageUrl: kf.metadata.pageUrl,
        pageTitle: kf.metadata.pageTitle,
        notes: kf.metadata.notes,
      } : undefined,
    });
  }

  // Process connections
  const connectionData: FigmaConnectionData[] = flowGraph.connections.map(conn => ({
    id: conn.id,
    from: conn.from,
    to: conn.to,
    label: conn.label,
  }));

  // Create metadata JSON
  const packageData: FigmaExportPackage = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    projectName: opts.projectName,
    description: opts.description,
    keyframes: keyframeData,
    connections: connectionData,
    layout: {
      canvasWidth: maxX - minX + offsetX,
      canvasHeight: maxY - minY + offsetY,
      nodeWidth,
      nodeHeight,
    },
  };

  zip.file('flow.json', JSON.stringify(packageData, null, 2));

  // Add README
  if (opts.includeReadme) {
    const readme = generateReadme(opts.projectName, keyframeData.length, connectionData.length);
    zip.file('README.md', readme);
  }

  // Generate ZIP blob
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Generate README content
 */
function generateReadme(projectName: string, keyframeCount: number, connectionCount: number): string {
  return `# ${projectName}

## 导出信息

- **关键帧数量**: ${keyframeCount}
- **连接数量**: ${connectionCount}
- **导出时间**: ${new Date().toLocaleString('zh-CN')}

## 文件结构

\`\`\`
├── README.md          # 本文件
├── flow.json          # 流程图数据
└── images/            # 关键帧图片
    ├── keyframe_1.png
    ├── keyframe_2.png
    └── ...
\`\`\`

## 在 Figma 中导入

### 方法一：手动导入

1. 打开 Figma，创建一个新的 Frame 或选择现有的 Frame
2. 将 \`images/\` 文件夹中的图片拖入 Figma
3. 参照 \`flow.json\` 中的 \`position\` 信息排列图片
4. 使用 Figma 的连接线工具或箭头形状连接各帧

### 方法二：使用 FigJam

1. 打开 FigJam 白板
2. 将图片拖入白板
3. 使用 FigJam 的连接器功能创建节点间的连接

### 方法三：使用 Figma 插件（推荐）

如果你有 OpenScreen Figma 插件：

1. 在 Figma 中打开插件
2. 选择"导入流程图"
3. 上传此 ZIP 文件
4. 插件将自动创建 Frame 并排列

## flow.json 数据格式

\`\`\`json
{
  "version": "1.0.0",
  "keyframes": [
    {
      "id": "唯一标识",
      "imageFile": "图片文件路径",
      "label": "标签",
      "position": { "x": 0, "y": 0 }
    }
  ],
  "connections": [
    {
      "from": "起始关键帧ID",
      "to": "目标关键帧ID",
      "label": "可选标签"
    }
  ]
}
\`\`\`

---

由 OpenScreen 导出 | https://github.com/openscreen
`;
}

/**
 * Export flow graph as JSON only (no images)
 */
export function exportFlowGraphAsJson(flowGraph: FlowGraph): string {
  return JSON.stringify(flowGraph, null, 2);
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export and download flow graph as Figma package
 */
export async function downloadFigmaPackage(
  flowGraph: FlowGraph,
  options: Partial<FigmaExportOptions> = {}
): Promise<void> {
  const blob = await exportToFigmaPackage(flowGraph, options);
  const filename = `${options.projectName || 'flow-export'}_${Date.now()}.zip`;
  downloadBlob(blob, filename);
}
