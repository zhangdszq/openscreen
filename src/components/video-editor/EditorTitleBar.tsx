import { useState } from "react";
import { FiMinus, FiMaximize2, FiX, FiChevronLeft, FiSave, FiShare2, FiHelpCircle, FiSettings } from "react-icons/fi";
import { BsRecordCircle } from "react-icons/bs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./EditorTitleBar.module.css";

interface EditorTitleBarProps {
  onExport?: () => void;
  onBackToRecorder?: () => void;
}

export function EditorTitleBar({ onExport, onBackToRecorder }: EditorTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(true);

  const handleMinimize = () => {
    window.electronAPI?.windowMinimize?.();
  };

  const handleMaximize = () => {
    window.electronAPI?.windowMaximize?.();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.windowClose?.();
  };

  const handleBackToRecorder = () => {
    if (onBackToRecorder) {
      onBackToRecorder();
    } else {
      // Default: switch to HUD overlay
      window.electronAPI?.switchToEditor?.(); // This might need a new API
    }
  };

  return (
    <div className={`h-12 flex-shrink-0 flex items-center justify-between px-5 ${styles.titleBar} ${styles.electronDrag}`}>
      {/* Left Section: Logo & Menu */}
      <div className="flex items-center gap-4">
        {/* Back Button */}
        <button
          onClick={handleBackToRecorder}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/8 transition-all duration-200 ${styles.electronNoDrag}`}
        >
          <FiChevronLeft size={16} />
          <span className="text-[13px]">返回</span>
        </button>

        <div className={`h-5 w-px ${styles.divider}`} />

        {/* App Logo & Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[10px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <div className="w-2.5 h-2.5 bg-white rounded-full" />
          </div>
          <span className="text-[14px] font-semibold text-white/90 tracking-tight">InsightView</span>
          <span className="text-[12px] text-white/30 font-medium">编辑器</span>
        </div>

        <div className={`h-5 w-px ${styles.divider}`} />

        {/* File Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`text-[13px] text-white/50 hover:text-white/90 px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all duration-200 ${styles.electronNoDrag}`}>
              文件
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.menuContent} align="start" sideOffset={8}>
            <DropdownMenuItem className={styles.menuItem} onClick={handleBackToRecorder}>
              <BsRecordCircle size={14} />
              <span>新建录制</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.menuItem}>
              <FiSave size={14} />
              <span>打开视频...</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className={styles.menuSeparator} />
            <DropdownMenuItem className={styles.menuItem} onClick={onExport}>
              <FiShare2 size={14} />
              <span>导出...</span>
              <span className="ml-auto text-[11px] text-white/30">⌘E</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Edit Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`text-[13px] text-white/50 hover:text-white/90 px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all duration-200 ${styles.electronNoDrag}`}>
              编辑
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.menuContent} align="start" sideOffset={8}>
            <DropdownMenuItem className={styles.menuItem} disabled>
              <span>撤销</span>
              <span className="ml-auto text-[11px] text-white/30">⌘Z</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.menuItem} disabled>
              <span>重做</span>
              <span className="ml-auto text-[11px] text-white/30">⇧⌘Z</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className={styles.menuSeparator} />
            <DropdownMenuItem className={styles.menuItem} disabled>
              <span>删除选中</span>
              <span className="ml-auto text-[11px] text-white/30">⌫</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`text-[13px] text-white/50 hover:text-white/90 px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all duration-200 ${styles.electronNoDrag}`}>
              视图
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.menuContent} align="start" sideOffset={8}>
            <DropdownMenuItem className={styles.menuItem}>
              <span>放大</span>
              <span className="ml-auto text-[11px] text-white/30">⌘+</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.menuItem}>
              <span>缩小</span>
              <span className="ml-auto text-[11px] text-white/30">⌘-</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.menuItem}>
              <span>实际大小</span>
              <span className="ml-auto text-[11px] text-white/30">⌘0</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`text-[13px] text-white/50 hover:text-white/90 px-3 py-1.5 rounded-lg hover:bg-white/8 transition-all duration-200 ${styles.electronNoDrag}`}>
              帮助
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.menuContent} align="start" sideOffset={8}>
            <DropdownMenuItem className={styles.menuItem}>
              <FiHelpCircle size={14} />
              <span>键盘快捷键</span>
              <span className="ml-auto text-[11px] text-white/30">⌘/</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className={styles.menuSeparator} />
            <DropdownMenuItem className={styles.menuItem}>
              <span>关于 InsightView</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Draggable area (implicit) */}
      <div className="flex-1" />

      {/* Right Section: Window Controls */}
      <div className={`flex items-center gap-1 ${styles.electronNoDrag}`}>
        {/* Export Button */}
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-[12px] font-medium shadow-lg shadow-emerald-500/25 transition-all duration-200 mr-3"
        >
          <FiShare2 size={14} />
          导出
        </button>

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="w-9 h-9 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group"
        >
          <FiMinus size={16} className="text-white/40 group-hover:text-white/80" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-9 h-9 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group"
        >
          <FiMaximize2 size={14} className="text-white/40 group-hover:text-white/80" />
        </button>
        <button
          onClick={handleClose}
          className="w-9 h-9 flex items-center justify-center hover:bg-red-500/15 rounded-lg transition-all duration-200 group"
        >
          <FiX size={16} className="text-white/40 group-hover:text-red-400" />
        </button>
      </div>
    </div>
  );
}
