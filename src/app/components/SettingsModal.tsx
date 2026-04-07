"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Save, Key, Link2, Box, CheckCircle2, Loader2 } from "lucide-react";

interface Settings {
  apiKey: string;
  model: string;
  scriptUrl: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  defaultScriptUrl?: string;
}

const STORAGE_KEY = "bdh_bao_cao_settings";

export default function SettingsModal({ isOpen, onClose, onSave, defaultScriptUrl = "" }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>({
    apiKey: "",
    model: "gpt-4o",
    scriptUrl: defaultScriptUrl,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiTestStatus, setApiTestStatus] = useState<"IDLE" | "TESTING" | "SUCCESS" | "ERROR">("IDLE");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          // Nếu chưa có scriptUrl thì lấy default
          scriptUrl: parsed.scriptUrl || defaultScriptUrl,
        }));
      } catch (e) { /* ignore */ }
    }
  }, [defaultScriptUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    onSave(settings);
    setIsSaving(false);
    onClose();
  };

  const handleTestApi = async () => {
    if (!settings.apiKey) return;
    setApiTestStatus("TESTING");
    await new Promise((r) => setTimeout(r, 800));
    setApiTestStatus(settings.apiKey.startsWith("sk-") ? "SUCCESS" : "ERROR");
    setTimeout(() => setApiTestStatus("IDLE"), 3000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="bg-[#0f1423]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 opacity-50" />

              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Cấu hình</h2>
                  <p className="text-sm text-white/40 mt-1">Báo cáo BĐH Dự án</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* API Key */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-2">
                    <Key className="w-4 h-4 text-cyan-400" /> OpenAI API Key
                  </label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={settings.apiKey}
                        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 transition-all font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      onClick={handleTestApi}
                      disabled={!settings.apiKey || apiTestStatus === "TESTING"}
                      className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center min-w-[80px]"
                    >
                      {apiTestStatus === "TESTING" ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        apiTestStatus === "SUCCESS" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                          apiTestStatus === "ERROR" ? <span className="text-red-400 text-sm">Lỗi</span> :
                            <span className="text-sm">Test</span>}
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mt-1.5 ml-1">Dùng để đọc và trích xuất dữ liệu báo cáo PDF.</p>
                </div>

                {/* Model */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-2">
                    <Box className="w-4 h-4 text-emerald-400" /> AI Model
                  </label>
                  <div className="relative">
                    <select
                      value={settings.model}
                      onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white appearance-none focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 transition-all cursor-pointer"
                    >
                      <option value="gpt-4o" className="bg-[#0f1423] text-white">gpt-4o</option>
                      <option value="gpt-4.1" className="bg-[#0f1423] text-white">gpt-4.1 (Khuyến nghị)</option>
                      <option value="gpt-4.1-mini" className="bg-[#0f1423] text-white">gpt-4.1-mini (Nhanh + Rẻ)</option>
                      <option value="gpt-4.1-nano" className="bg-[#0f1423] text-white">gpt-4.1-nano (Siêu nhanh)</option>
                      <option value="o4-mini" className="bg-[#0f1423] text-white">o4-mini (Suy luận mạnh)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">▼</div>
                  </div>
                </div>

                {/* Apps Script URL */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-2">
                    <Link2 className="w-4 h-4 text-blue-400" /> Google Apps Script URL
                  </label>
                  <input
                    type="text"
                    value={settings.scriptUrl}
                    onChange={(e) => setSettings({ ...settings, scriptUrl: e.target.value })}
                    placeholder="https://script.google.com/macros/s/..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 transition-all font-mono text-xs"
                  />
                  <p className="text-xs text-white/40 mt-1.5 ml-1">
                    Đường dẫn Web App để đẩy dữ liệu lên sheet NHAP LIEU.
                  </p>
                  {settings.scriptUrl && (
                    <div className="mt-2 px-3 py-2 rounded-lg text-xs font-mono text-emerald-400/80 truncate"
                      style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                      ✓ {settings.scriptUrl.substring(0, 60)}...
                    </div>
                  )}
                </div>
              </div>

              {/* Save button */}
              <div className="mt-10 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="relative px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 overflow-hidden group"
                >
                  {isSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
                  ) : (
                    <><Save className="w-4 h-4" /> Lưu cấu hình</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
