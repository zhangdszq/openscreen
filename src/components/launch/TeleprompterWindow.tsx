import { useState, useEffect, useRef } from "react";
import { FiFileText, FiX, FiZap, FiFeather, FiLoader, FiTrash2, FiCopy, FiCheck, FiMinus } from "react-icons/fi";
import { getAISettings, type AISettings } from "./AISettingsDialog";
import styles from "./LaunchWindow.module.css";

// 提词器内容存储 key
const TELEPROMPTER_KEY = "teleprompter-content";

// 加载保存的内容
function loadContent(): string {
  try {
    return localStorage.getItem(TELEPROMPTER_KEY) || "";
  } catch {
    return "";
  }
}

// 保存内容
function saveContent(content: string) {
  try {
    localStorage.setItem(TELEPROMPTER_KEY, content);
  } catch (e) {
    console.error("Failed to save teleprompter content:", e);
  }
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

export function TeleprompterWindow() {
  const [content, setContent] = useState(loadContent);
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [processing, setProcessing] = useState<"expand" | "polish" | null>(null);
  const [copied, setCopied] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载 AI 设置
  useEffect(() => {
    setAiSettings(getAISettings());
    
    // 监听存储变化以同步 AI 设置
    const handleStorageChange = () => {
      setAiSettings(getAISettings());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 保存内容
  useEffect(() => {
    saveContent(content);
    // 同步到其他窗口
    window.electronAPI?.updateTeleprompterContent?.(content);
  }, [content]);

  // 监听来自其他窗口的内容更新
  useEffect(() => {
    const cleanup = window.electronAPI?.onTeleprompterContentUpdate?.((newContent: string) => {
      if (newContent !== content) {
        setContent(newContent);
      }
    });
    return cleanup;
  }, [content]);

  // Handle resize from any edge
  const handleResizeMouseDown = (direction: ResizeDirection) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeDirection(direction);
    resizeStartRef.current = {
      x: e.screenX,
      y: e.screenY,
      width: 0,
      height: 0,
    };
    // 通知主进程开始 resize
    window.electronAPI?.teleprompterResizeStart?.();
  };

  useEffect(() => {
    if (!resizeDirection) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.screenX - resizeStartRef.current.x;
      const deltaY = e.screenY - resizeStartRef.current.y;
      
      window.electronAPI?.teleprompterResizeMove?.({
        direction: resizeDirection,
        deltaX,
        deltaY,
      });
    };

    const handleMouseUp = () => {
      window.electronAPI?.teleprompterResizeEnd?.();
      setResizeDirection(null);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeDirection]);

  const isResizing = resizeDirection !== null;

  // AI 处理函数
  const processWithAI = async (type: "expand" | "polish") => {
    if (!content.trim()) return;
    if (!aiSettings?.enabled || !aiSettings?.apiKey) {
      return;
    }

    setProcessing(type);

    const prompts = {
      expand: `请帮我扩写以下内容，使其更加丰富详细，但保持原有的核心意思和风格。直接输出扩写后的内容，不要任何解释：

${content}`,
      polish: `请帮我润色以下内容，使其更加流畅自然、表达更准确优美，但保持原有的意思不变。直接输出润色后的内容，不要任何解释：

${content}`,
    };

    try {
      const model = aiSettings.selectedModels[0] || "qwen-plus";
      const response = await fetch(`${aiSettings.apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiSettings.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: prompts[type],
            },
          ],
          max_tokens: 2000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || "";
        if (result) {
          setContent(result.trim());
        }
      }
    } catch (err) {
      console.error("AI processing failed:", err);
    } finally {
      setProcessing(null);
    }
  };

  // 复制内容
  const copyContent = async () => {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 清空内容
  const clearContent = () => {
    setContent("");
    textareaRef.current?.focus();
  };

  // 关闭窗口
  const closeWindow = () => {
    window.electronAPI?.closeTeleprompter?.();
  };

  // 最小化窗口
  const minimizeWindow = () => {
    window.electronAPI?.hideTeleprompter?.();
  };

  const isAIAvailable = aiSettings?.enabled && aiSettings?.apiKey;

  return (
    <div className="w-full h-full select-none font-sans relative overflow-visible">
      <div 
        className={`absolute inset-2 text-white flex flex-col rounded-2xl overflow-hidden ${styles.glassContainer}`}
        style={{ background: "rgba(20, 20, 22, 0.95)" }}
      >
        {/* 标题栏 - 可拖动 */}
        <div 
          className={`h-11 flex items-center justify-between px-4 flex-shrink-0 border-b border-white/[0.06] cursor-move ${styles.electronDrag}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <FiFileText size={12} className="text-white" />
            </div>
            <span className="text-[13px] font-medium text-white/80">提词器</span>
          </div>
          
          <div className={`flex items-center gap-1 ${styles.electronNoDrag}`}>
            <button 
              onClick={minimizeWindow}
              className="w-7 h-7 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group"
            >
              <FiMinus size={13} className="text-white/40 group-hover:text-white/80" />
            </button>
            <button 
              onClick={closeWindow}
              className="w-7 h-7 flex items-center justify-center hover:bg-red-500/15 rounded-lg transition-all duration-200 group"
            >
              <FiX size={13} className="text-white/40 group-hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className={`flex-1 flex flex-col p-4 gap-3 min-h-0 ${styles.macScrollbar}`}>
          {/* 文本输入框 */}
          <div className="relative flex-1 min-h-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里输入你的提词内容...&#10;&#10;录制时可以参考这些文字"
              className={`w-full h-full rounded-xl px-4 py-3.5 text-[14px] text-white/90 resize-none ${styles.glassInput} ${styles.macScrollbar}`}
              style={{ lineHeight: "1.8", background: "rgba(0, 0, 0, 0.2)" }}
            />
            
            {/* 字数统计 */}
            <div className="absolute bottom-3 right-4 text-[10px] text-white/25">
              {content.length} 字
            </div>

            {/* 调整大小提示 */}
            {isResizing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                <span className="text-white text-sm font-medium">调整大小</span>
              </div>
            )}
          </div>

          {/* AI 功能按钮 */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => processWithAI("expand")}
              disabled={!content.trim() || !isAIAvailable || processing !== null}
              className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-[12px] font-medium transition-all duration-200 ${
                isAIAvailable && content.trim()
                  ? `${styles.glassCard} text-white/70 hover:text-white hover:bg-emerald-500/15 hover:border-emerald-500/30`
                  : `${styles.glassCard} text-white/30 cursor-not-allowed`
              }`}
              title={!isAIAvailable ? "请先在中控台配置 AI 设置" : ""}
            >
              {processing === "expand" ? (
                <FiLoader size={14} className="animate-spin" />
              ) : (
                <FiZap size={14} />
              )}
              {processing === "expand" ? "扩写中..." : "AI 扩写"}
            </button>
            
            <button
              onClick={() => processWithAI("polish")}
              disabled={!content.trim() || !isAIAvailable || processing !== null}
              className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-[12px] font-medium transition-all duration-200 ${
                isAIAvailable && content.trim()
                  ? `${styles.glassCard} text-white/70 hover:text-white hover:bg-purple-500/15 hover:border-purple-500/30`
                  : `${styles.glassCard} text-white/30 cursor-not-allowed`
              }`}
              title={!isAIAvailable ? "请先在中控台配置 AI 设置" : ""}
            >
              {processing === "polish" ? (
                <FiLoader size={14} className="animate-spin" />
              ) : (
                <FiFeather size={14} />
              )}
              {processing === "polish" ? "润色中..." : "AI 润色"}
            </button>
          </div>

          {/* 工具栏 */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={copyContent}
                disabled={!content.trim()}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] transition-all duration-200 ${
                  content.trim()
                    ? "text-white/50 hover:text-white/80 hover:bg-white/8"
                    : "text-white/20 cursor-not-allowed"
                }`}
              >
                {copied ? <FiCheck size={12} className="text-emerald-400" /> : <FiCopy size={12} />}
                {copied ? "已复制" : "复制"}
              </button>
              
              <button
                onClick={clearContent}
                disabled={!content.trim()}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] transition-all duration-200 ${
                  content.trim()
                    ? "text-white/50 hover:text-red-400 hover:bg-red-500/10"
                    : "text-white/20 cursor-not-allowed"
                }`}
              >
                <FiTrash2 size={12} />
                清空
              </button>
            </div>

            {/* AI 状态提示 */}
            {!isAIAvailable && (
              <span className="text-[10px] text-white/30">
                在中控台配置 AI
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Resize handles - 在窗口最外层边缘 */}
      {/* 角落 handles */}
      <div
        data-resize="nw"
        className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('nw')}
      />
      <div
        data-resize="ne"
        className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('ne')}
      />
      <div
        data-resize="sw"
        className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('sw')}
      />
      <div
        data-resize="se"
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('se')}
      />
      
      {/* 边缘 handles */}
      <div
        data-resize="n"
        className="absolute top-0 left-4 right-4 h-2 cursor-ns-resize z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('n')}
      />
      <div
        data-resize="s"
        className="absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('s')}
      />
      <div
        data-resize="w"
        className="absolute left-0 top-4 bottom-4 w-2 cursor-ew-resize z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('w')}
      />
      <div
        data-resize="e"
        className="absolute right-0 top-4 bottom-4 w-2 cursor-ew-resize z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseDown={handleResizeMouseDown('e')}
      />
    </div>
  );
}
