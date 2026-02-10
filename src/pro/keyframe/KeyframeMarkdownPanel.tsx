/**
 * KeyframeMarkdownPanel - Full-screen Markdown document editor (Feishu-style)
 *
 * Content is stored as Markdown. Keyframe images are embedded as base64
 * Markdown image syntax: ![alt](data:image/png;base64,...) and rendered
 * inline in the editor.
 *
 * Features:
 *  - Markdown native editing (# heading, **bold**, > quote, - list, ```, etc.)
 *  - Inline image display in editor
 *  - Floating bubble toolbar on text selection
 *  - Slash "/" command menu
 *  - One-click copy (rich text + images)
 *  - Export as ZIP (Markdown + images folder)
 */

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  X,
  Edit2,
  Check,
  Copy,
} from 'lucide-react';
import { useKeyframeStore } from './keyframeStore';
import { keyframeToBlob } from './keyframeExtractor';
import { downloadBlob } from '@/pro/figma-export/figmaExporter';
import { DocEditor, type DocEditorRef } from './editor/DocEditor';

interface KeyframeMarkdownPanelProps {
  onClose: () => void;
}

/**
 * Format milliseconds to mm:ss
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function KeyframeMarkdownPanel({ onClose }: KeyframeMarkdownPanelProps) {
  const { flowGraph } = useKeyframeStore();
  const keyframes = flowGraph.keyframes;

  const [docTitle, setDocTitle] = useState('操作步骤文档');
  const [editingTitle, setEditingTitle] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<DocEditorRef>(null);

  const sortedKeyframes = useMemo(
    () => [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs),
    [keyframes],
  );

  // ── Generate initial Markdown content from keyframes ──
  const initialMarkdown = useMemo(() => {
    if (sortedKeyframes.length === 0) return '';

    const lines: string[] = [];
    lines.push(`# ${docTitle}`);
    lines.push('');
    lines.push(`> 共 ${sortedKeyframes.length} 个步骤`);
    lines.push('');

    sortedKeyframes.forEach((kf, index) => {
      const stepNum = index + 1;
      const label = kf.label || `步骤 ${stepNum}`;
      const desc = kf.metadata?.notes || '';

      lines.push(`## ${stepNum}. ${label}`);
      lines.push('');
      lines.push(`**时间**: ${formatTime(kf.timestampMs)}`);
      lines.push('');

      // Embed image as inline base64 Markdown image
      if (kf.imageData) {
        lines.push(`![${label}](${kf.imageData})`);
        lines.push('');
      }

      if (desc) {
        lines.push(desc);
        lines.push('');
      }

      if (index < sortedKeyframes.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });

    return lines.join('\n');
  }, [sortedKeyframes, docTitle]);

  // ── Get export-ready Markdown (replace base64 with file paths) ──
  const getExportMarkdown = useCallback(() => {
    const md = editorRef.current?.getMarkdown() ?? '';
    if (!md) return md;

    // Replace base64 image URLs with relative file paths for export
    let imgCounter = 0;
    return md.replace(
      /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g,
      (_match, alt) => {
        imgCounter++;
        return `![${alt}](images/step_${imgCounter}.png)`;
      },
    );
  }, []);

  // ── Export as ZIP with Markdown + images ──
  const handleExport = useCallback(async () => {
    if (sortedKeyframes.length === 0) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const imagesFolder = zip.folder('images')!;

      zip.file('README.md', getExportMarkdown());

      sortedKeyframes.forEach((kf, index) => {
        if (kf.imageData) {
          const blob = keyframeToBlob(kf);
          if (blob) {
            imagesFolder.file(`step_${index + 1}.png`, blob);
          }
        }
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${docTitle}_${Date.now()}.zip`);
    } catch (error) {
      console.error('Failed to export:', error);
    }
  }, [sortedKeyframes, getExportMarkdown, docTitle]);

  // ── Copy entire document as rich text (HTML with images) ──
  const handleCopyAll = useCallback(async () => {
    const html = editorRef.current?.getHTML() ?? '';
    const plainText = editorRef.current?.getMarkdown() ?? editorRef.current?.getText() ?? '';

    if (!html) return;

    try {
      // Wrap in styled container for better paste rendering
      const styledHtml = `<div style="font-family:system-ui,sans-serif;color:#222;">${html}</div>`;

      const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Clipboard write failed:', error);
      // Fallback: select all editor content and copy
      try {
        const editorEl = document.querySelector('.tiptap-doc-editor .ProseMirror');
        if (editorEl) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(editorEl);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }
      } catch {
        console.error('Fallback copy also failed');
      }
    }
  }, []);

  // ── Close on Escape ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if a slash-command menu might be open
        const popup = document.querySelector('.tippy-box[data-theme="slash-command"]');
        if (popup) return;
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c]">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0d0d0f]">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[#34B27B]" />
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingTitle(false);
              }}
              className="text-base font-semibold text-white bg-white/10 border border-white/20 rounded-lg px-3 py-1 focus:outline-none focus:border-[#34B27B]"
            />
          ) : (
            <h1
              className="text-base font-semibold text-white cursor-pointer hover:text-[#34B27B] transition-colors"
              onClick={() => setEditingTitle(true)}
            >
              {docTitle}
              <Edit2 className="w-3.5 h-3.5 inline ml-2 opacity-40" />
            </h1>
          )}
          <span className="text-xs text-slate-500">{sortedKeyframes.length} 个步骤</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            disabled={sortedKeyframes.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#34B27B]" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                一键复制
              </>
            )}
          </button>
          <button
            onClick={handleExport}
            disabled={sortedKeyframes.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 bg-[#34B27B] hover:bg-[#2ea36d] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 ZIP
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Document body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-10 px-8" style={{ minHeight: '100%' }}>
          {sortedKeyframes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
              <FileText className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">暂无关键帧</p>
              <p className="text-sm mt-2">请先在「关键帧」面板中截取关键帧，然后回到这里编辑文档</p>
            </div>
          ) : (
            <DocEditor
              ref={editorRef}
              initialContent={initialMarkdown}
              placeholder="输入 Markdown 或 / 插入内容…"
            />
          )}
        </div>
      </div>

      {/* ── Bottom hint bar ── */}
      <div className="flex items-center justify-center px-6 py-2 border-t border-white/5 bg-[#0d0d0f]">
        <p className="text-[11px] text-slate-600">
          支持 Markdown 语法：# 标题 · **加粗** · *斜体* · {'>'} 引用 · - 列表 · ``` 代码块 · --- 分割线 · 输入 / 插入块 · Esc 关闭
        </p>
      </div>
    </div>
  );
}

export default KeyframeMarkdownPanel;
