/**
 * WindowPicker Component
 * 全屏窗口选择器 - 显示所有窗口缩略图供用户选择
 * 类似 macOS Mission Control 的效果
 */

import { useState, useEffect, useCallback } from 'react';
import { FiX, FiMonitor } from 'react-icons/fi';

interface WindowSource {
  id: string;
  name: string;
  thumbnail: string | null;
  appIcon: string | null;
}

export function WindowPicker() {
  const [windows, setWindows] = useState<WindowSource[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowSource | null>(null);
  const [loading, setLoading] = useState(true);

  // 加载所有窗口
  useEffect(() => {
    async function loadWindows() {
      setLoading(true);
      try {
        // @ts-ignore
        const sources = await window.electronAPI?.getSources?.({ 
          types: ['window'],
          thumbnailSize: { width: 400, height: 300 },
          fetchWindowIcons: true
        });
        
        if (sources) {
          // 过滤掉我们自己的窗口和空窗口
          const filtered = sources.filter((s: any) => 
            s.name && 
            s.name.trim() !== '' &&
            !s.name.includes('InsightView') &&
            !s.name.includes('openscreen') &&
            s.name !== 'Electron'
          ).map((s: any) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail?.toDataURL?.() || s.thumbnail || null,
            appIcon: s.appIcon?.toDataURL?.() || s.appIcon || null,
          }));
          
          setWindows(filtered);
        }
      } catch (error) {
        console.error('加载窗口失败:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadWindows();
  }, []);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && selectedWindow) {
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWindow]);

  // 选择窗口
  const handleSelect = useCallback((win: WindowSource) => {
    setSelectedWindow(win);
  }, []);

  // 双击确认
  const handleDoubleClick = useCallback((win: WindowSource) => {
    // @ts-ignore
    window.electronAPI?.confirmWindowPicker?.({
      id: win.id,
      name: win.name,
    });
  }, []);

  // 确认选择
  const handleConfirm = useCallback(() => {
    if (selectedWindow) {
      // @ts-ignore
      window.electronAPI?.confirmWindowPicker?.({
        id: selectedWindow.id,
        name: selectedWindow.name,
      });
    }
  }, [selectedWindow]);

  // 取消选择
  const handleCancel = useCallback(() => {
    // @ts-ignore
    window.electronAPI?.cancelWindowPicker?.();
  }, []);

  // 计算网格布局
  const getGridCols = () => {
    const count = windows.length;
    if (count <= 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    if (count <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <FiMonitor size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">选择窗口</h1>
            <p className="text-sm text-white/50">点击选择要录制的窗口</p>
          </div>
        </div>
        <button
          onClick={handleCancel}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <FiX size={24} className="text-white/60 hover:text-white" />
        </button>
      </div>

      {/* 窗口网格 */}
      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-white/50">加载中...</div>
          </div>
        ) : windows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <FiMonitor size={48} className="text-white/20" />
            <p className="text-white/40">没有可用的窗口</p>
          </div>
        ) : (
          <div className={`grid ${getGridCols()} gap-6 max-w-6xl mx-auto`}>
            {windows.map((win) => {
              const isSelected = selectedWindow?.id === win.id;
              return (
                <button
                  key={win.id}
                  onClick={() => handleSelect(win)}
                  onDoubleClick={() => handleDoubleClick(win)}
                  className={`
                    group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200
                    ${isSelected 
                      ? 'ring-4 ring-emerald-500 scale-[1.02] shadow-2xl shadow-emerald-500/20' 
                      : 'ring-1 ring-white/10 hover:ring-white/20 hover:scale-[1.01]'
                    }
                  `}
                >
                  {/* 缩略图 */}
                  <div className="relative aspect-video bg-black/50">
                    {win.thumbnail ? (
                      <img
                        src={win.thumbnail}
                        alt={win.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10">
                        <FiMonitor size={32} className="text-white/20" />
                      </div>
                    )}
                    
                    {/* 选中遮罩 */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-emerald-500/10" />
                    )}
                    
                    {/* 悬停遮罩 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                  
                  {/* 窗口信息 */}
                  <div className={`
                    p-4 flex items-center gap-3 transition-colors
                    ${isSelected ? 'bg-emerald-500/20' : 'bg-white/5'}
                  `}>
                    {win.appIcon && (
                      <img src={win.appIcon} alt="" className="w-6 h-6 flex-shrink-0" />
                    )}
                    <span className={`
                      text-sm font-medium truncate
                      ${isSelected ? 'text-emerald-300' : 'text-white/80'}
                    `}>
                      {win.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-t border-white/10 bg-black/30">
        <p className="text-sm text-white/40">
          {selectedWindow ? `已选择: ${selectedWindow.name}` : '点击选择窗口，双击直接确认'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/15 transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedWindow}
            className={`
              px-5 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${selectedWindow 
                ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                : 'bg-white/5 text-white/30 cursor-not-allowed'
              }
            `}
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}

export default WindowPicker;
