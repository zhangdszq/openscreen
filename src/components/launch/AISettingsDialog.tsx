import { useState, useEffect } from "react";
import { FiSettings, FiEye, FiEyeOff, FiCheck, FiX, FiPlus, FiTrash2 } from "react-icons/fi";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import styles from "./LaunchWindow.module.css";

// 阿里通义千问模型列表
const QWEN_MODELS = [
  { id: "qwen-plus", name: "qwen-plus", recommended: true },
  { id: "qwen-turbo", name: "qwen-turbo", recommended: false },
  { id: "qwen-max", name: "qwen-max", recommended: false },
  { id: "qwen-max-longcontext", name: "qwen-max-longcontext", recommended: false },
];

// AI 设置的存储 key
const AI_SETTINGS_KEY = "ai-settings";

export interface AISettings {
  enabled: boolean;
  apiKey: string;
  apiBaseUrl: string;
  selectedModels: string[];
}

const DEFAULT_SETTINGS: AISettings = {
  enabled: false,
  apiKey: "",
  apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  selectedModels: ["qwen-plus"],
};

// 加载设置
function loadSettings(): AISettings {
  try {
    const saved = localStorage.getItem(AI_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to load AI settings:", e);
  }
  return DEFAULT_SETTINGS;
}

// 保存设置
function saveSettings(settings: AISettings) {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save AI settings:", e);
  }
}

interface AISettingsDialogProps {
  trigger?: React.ReactNode;
}

export function AISettingsDialog({ trigger }: AISettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [customModel, setCustomModel] = useState("");

  // 保存设置到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleModel = (modelId: string) => {
    setSettings(prev => {
      const models = prev.selectedModels.includes(modelId)
        ? prev.selectedModels.filter(m => m !== modelId)
        : [...prev.selectedModels, modelId];
      return { ...prev, selectedModels: models.length > 0 ? models : [modelId] };
    });
  };

  const addCustomModel = () => {
    if (customModel.trim() && !settings.selectedModels.includes(customModel.trim())) {
      setSettings(prev => ({
        ...prev,
        selectedModels: [...prev.selectedModels, customModel.trim()],
      }));
      setCustomModel("");
    }
  };

  const removeModel = (modelId: string) => {
    if (settings.selectedModels.length > 1) {
      setSettings(prev => ({
        ...prev,
        selectedModels: prev.selectedModels.filter(m => m !== modelId),
      }));
    }
  };

  // 真正测试 API 连接 - 调用 chat/completions 接口
  const testConnection = async () => {
    if (!settings.apiKey) {
      setTestStatus("error");
      setTestMessage("请先输入 API Key");
      setTimeout(() => {
        setTestStatus("idle");
        setTestMessage("");
      }, 3000);
      return;
    }

    setTestStatus("testing");
    setTestMessage("");

    try {
      // 使用第一个选中的模型进行测试
      const testModel = settings.selectedModels[0] || "qwen-plus";
      
      const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [
            {
              role: "user",
              content: "你好，请回复'连接成功'四个字"
            }
          ],
          max_tokens: 20,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || "";
        setTestStatus("success");
        setTestMessage(reply.slice(0, 30) + (reply.length > 30 ? "..." : ""));
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestStatus("error");
        setTestMessage(errorData.error?.message || `HTTP ${response.status}`);
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : "网络错误");
    }

    // 5秒后重置状态
    setTimeout(() => {
      setTestStatus("idle");
      setTestMessage("");
    }, 5000);
  };

  const defaultTrigger = (
    <button className="w-8 h-8 flex items-center justify-center hover:bg-white/8 rounded-lg transition-all duration-200 group">
      <FiSettings size={15} className="text-white/40 group-hover:text-white/80" />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent 
        className={`w-[380px] text-white p-0 rounded-2xl overflow-hidden ${styles.glassPopover}`}
        side="bottom"
        align="end"
        sideOffset={8}
      >
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <FiSettings size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white/90">AI 模型设置</h3>
            <p className="text-[10px] text-white/40">配置通义千问 API</p>
          </div>
        </div>

        <div className={`px-5 py-4 space-y-5 max-h-[400px] overflow-y-auto ${styles.macScrollbar}`}>
          {/* 通义千问设置 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">通</span>
                </div>
                <div>
                  <h3 className="text-[13px] font-medium text-white/90">通义千问</h3>
                  <p className="text-[10px] text-white/40">阿里云大语言模型</p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => updateSetting("enabled", checked)}
              />
            </div>

            {settings.enabled && (
              <div className="space-y-4 pl-10">
                {/* API Key */}
                <div className="space-y-2">
                  <label className="text-[11px] text-white/45 font-medium">API Key</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={settings.apiKey}
                        onChange={(e) => updateSetting("apiKey", e.target.value)}
                        placeholder="sk-..."
                        className={`w-full rounded-xl px-3 py-2.5 text-[12px] text-white pr-10 ${styles.glassInput}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showApiKey ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                      </button>
                    </div>
                    <button
                      onClick={testConnection}
                      disabled={testStatus === "testing"}
                      className={`px-4 py-2.5 rounded-xl text-[11px] font-medium transition-all duration-200 flex items-center gap-1.5 min-w-[70px] justify-center
                        ${testStatus === "success" 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                          : testStatus === "error"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : `${styles.glassCard} text-white/60 hover:text-white/90`
                        }`}
                    >
                      {testStatus === "testing" ? (
                        <span className="animate-pulse">检测中...</span>
                      ) : testStatus === "success" ? (
                        <><FiCheck size={12} /> 成功</>
                      ) : testStatus === "error" ? (
                        <><FiX size={12} /> 失败</>
                      ) : (
                        "检测"
                      )}
                    </button>
                  </div>
                  {/* 测试结果消息 */}
                  {testMessage && (
                    <p className={`text-[10px] ${testStatus === "success" ? "text-emerald-400" : "text-red-400"}`}>
                      {testStatus === "success" ? `AI 回复: ${testMessage}` : `错误: ${testMessage}`}
                    </p>
                  )}
                  <a 
                    href="https://dashscope.console.aliyun.com/apiKey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors inline-block"
                  >
                    点击这里获取密钥
                  </a>
                </div>

                {/* API 地址 */}
                <div className="space-y-2">
                  <label className="text-[11px] text-white/45 font-medium">API 地址</label>
                  <input
                    type="text"
                    value={settings.apiBaseUrl}
                    onChange={(e) => updateSetting("apiBaseUrl", e.target.value)}
                    className={`w-full rounded-xl px-3 py-2.5 text-[12px] text-white ${styles.glassInput}`}
                  />
                  <p className="text-[10px] text-white/30">
                    请求地址预览: {settings.apiBaseUrl}/chat/completions
                  </p>
                </div>

                {/* 模型选择 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-white/45 font-medium">模型</label>
                    <a 
                      href="https://help.aliyun.com/zh/model-studio/getting-started/models" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      查看更多模型
                    </a>
                  </div>
                  
                  {/* 预设模型列表 */}
                  <div className="space-y-1.5">
                    {QWEN_MODELS.map((model) => {
                      const isSelected = settings.selectedModels.includes(model.id);
                      return (
                        <button
                          key={model.id}
                          onClick={() => toggleModel(model.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 ${
                            isSelected
                              ? "bg-emerald-500/15 border border-emerald-500/30"
                              : `${styles.glassCard}`
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                              isSelected ? "bg-emerald-500/20" : "bg-white/5"
                            }`}>
                              <span className="text-[8px] font-medium text-white/60">千问</span>
                            </div>
                            <span className={`text-[11px] ${isSelected ? "text-white" : "text-white/60"}`}>
                              {model.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {model.recommended && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                                推荐
                              </span>
                            )}
                            {isSelected && (
                              <FiCheck size={12} className="text-emerald-400" />
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {/* 自定义模型 */}
                    {settings.selectedModels
                      .filter(m => !QWEN_MODELS.some(qm => qm.id === m))
                      .map((modelId) => (
                        <div
                          key={modelId}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-emerald-500/20">
                              <span className="text-[8px] font-medium text-white/60">自定</span>
                            </div>
                            <span className="text-[11px] text-white">
                              {modelId}
                            </span>
                          </div>
                          <button
                            onClick={() => removeModel(modelId)}
                            className="p-1 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                          >
                            <FiTrash2 size={11} />
                          </button>
                        </div>
                      ))}
                  </div>

                  {/* 添加自定义模型 */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCustomModel()}
                      placeholder="+ 添加自定义模型"
                      className={`flex-1 rounded-xl px-3 py-2 text-[10px] text-white ${styles.glassInput}`}
                    />
                    <button
                      onClick={addCustomModel}
                      disabled={!customModel.trim()}
                      className={`px-2.5 py-2 rounded-xl transition-all duration-200 ${styles.glassCard} text-white/50 hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <FiPlus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部信息 */}
        <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02]">
          <p className="text-[9px] text-white/30 text-center">
            API Key 安全存储在本地，不会上传到任何服务器
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 导出获取设置的方法供其他组件使用
export function getAISettings(): AISettings {
  return loadSettings();
}
