"use client";

import { useState, useCallback } from "react";
import { Settings, X, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import UploadPanel from "./components/UploadPanel";
import ResultsPanel from "./components/ResultsPanel";
import SettingsModal from "./components/SettingsModal";

// URL Apps Script mặc định
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwF7jE5RMCXwAKd5MyfA5srEqxqKxwv6qARrp6fiS5zCBdAIVdym_O6DQiTk_rkb1DQEw/exec";

export interface BaoCaoData {
  ngayBaoCao: string;
  tenDuAn: string;
  khPercent: string;      // KH (%) - luon = 100%
  lkHomQua: string;       // LK HOM QUA (%)
  homNayPercent: string;  // HOM NAY (%) - delta
  lkHomNay: string;       // LK HOM NAY (%) - lay thang tu San luong % trong PDF
  gtHopDong: string;      // Gia tri Hop dong (ty dong) - co dinh
  gtSanLuong: string;     // San luong (ty dong) - Sep quan tam
  gtConLai: string;       // Gia tri con lai (ty dong) - Sep quan tam
  gtNghiemThu: string;
  congViecTrongNgay: string;
  vuongMac: string;
  tenFile: string;
}

interface Toast {
  id: number;
  type: "error" | "warning" | "success" | "info";
  message: string;
}

let toastCounter = 0;

export default function Home() {
  const [status, setStatus] = useState<"IDLE" | "PROCESSING" | "SUCCESS">("IDLE");
  const [processingText, setProcessingText] = useState("");
  const [extractedData, setExtractedData] = useState<BaoCaoData[]>([]);
  const [validationScores, setValidationScores] = useState<Record<string, number>[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [selectedPdfIndex, setSelectedPdfIndex] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"IDLE" | "SYNCING" | "SUCCESS">("IDLE");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const handleSettingsClose = () => setIsSettingsOpen(false);

  const handleUpload = async (files: File[]) => {
    const savedSettings = localStorage.getItem("bdh_bao_cao_settings");
    const settings = savedSettings ? JSON.parse(savedSettings) : {};
    const apiKey = settings.apiKey || "";

    // API key đã được kiểm tra trước bởi UploadPanel - safeguard thêm
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setStatus("PROCESSING");
    const newData: BaoCaoData[] = [...extractedData];
    const newScores: Record<string, number>[] = [...validationScores];
    const newPreviews: string[] = [...previews];
    const newFileUrls: string[] = [...fileUrls];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingText(`Đang xử lý file ${i + 1}/${files.length}: ${file.name}...`);

      try {
        const fileUrl = URL.createObjectURL(file);
        newFileUrls.push(fileUrl);
        setFileUrls([...newFileUrls]);

        // Render PDF sang ảnh
        setProcessingText(`Đang render PDF...`);
        const pageImages: string[] = [];
        let previewBase64 = "";

        try {
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) throw new Error("pdf.js not loaded");

          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableFontFace: true }).promise;

          const totalPdfPages = pdf.numPages;
          const MAX_PAGES = 20;

          for (let p = 1; p <= Math.min(totalPdfPages, MAX_PAGES); p++) {
            setProcessingText(`Render trang ${p}/${totalPdfPages}...`);
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;
              pageImages.push(canvas.toDataURL("image/jpeg", 0.7));
              if (p === 1) previewBase64 = canvas.toDataURL("image/jpeg", 0.4);
            }
          }
        } catch (pdfErr) {
          console.warn("❌ Lỗi render PDF:", pdfErr);
        }

        newPreviews.push(previewBase64);
        setPreviews([...newPreviews]);

        // Gửi lên AI
        const selectedModel = settings.model || "gpt-4o";
        setProcessingText(`AI đang đọc báo cáo (${selectedModel})...`);

        const formData = new FormData();
        formData.append("model", selectedModel);
        pageImages.forEach((img, idx) => formData.append(`image_page_${idx + 1}`, img));
        formData.append("total_pages_sent", String(pageImages.length));
        if (pageImages.length === 0) formData.append("file", file);

        const response = await fetch("/api/extract-contract", {
          method: "POST",
          headers: { "x-api-key": apiKey, "x-model": selectedModel },
          body: formData,
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

        // lkHomNay lay truc tiep tu "San luong %" tren PDF
        const lkHomNayFromPdf = result.data?.lkHomNay || "0%";
        const lkHomNayNum = parseFloat(lkHomNayFromPdf.replace("%", "").replace(",", ".")) || 0;

        // lkHomQua: lay tu result neu co, neu khong de N/A (chua biet hom qua)
        const lkHomQua = result.data?.lkHomQua || "N/A";
        const lkHomQuaNum = parseFloat(lkHomQua.replace("%", "").replace(",", ".")) || 0;

        // homNayPercent = lkHomNay - lkHomQua (neu biet ca 2)
        const homNayCalc = lkHomQua !== "N/A"
          ? (lkHomNayNum - lkHomQuaNum).toFixed(2) + "%"
          : result.data?.homNayPercent || "N/A";

        const baoCao: BaoCaoData = {
          ...result.data,
          khPercent:     "100%",
          lkHomQua:      lkHomQua,
          homNayPercent: homNayCalc,
          lkHomNay:      lkHomNayFromPdf,
          gtConLai:      result.data?.gtConLai || "N/A",
          tenFile: file.name,
        };

        newData.push(baoCao);
        newScores.push(result.validationScores || {});
        setExtractedData([...newData]);
        setValidationScores([...newScores]);

        // Không auto-sync từng file — sẽ sync batch sau khi extract hết tất cả

        if (i < files.length - 1) await new Promise((r) => setTimeout(r, 500));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        showToast(`Lỗi xử lý "${file.name}": ${msg}`, "error");
        if (newData.length === 0) {
          setStatus("IDLE");
          return;
        }
      }
    }

    // ── Sau khi extract xong TẤT CẢ → sync batch với logic 2 ngày gần nhất ──
    if (newData.length > 0) {
      setProcessingText("Đang đồng bộ lên Google Sheets (2 ngày gần nhất)...");
      const scriptUrl = settings.scriptUrl || DEFAULT_SCRIPT_URL;
      try {
        await syncWithTwoDayLogic(newData, scriptUrl);
        setStatus("SUCCESS");
        setSyncStatus("SUCCESS");
        setTimeout(() => setSyncStatus("IDLE"), 5000);
      } catch (syncErr) {
        console.error("❌ Batch sync failed:", syncErr);
        setStatus("SUCCESS"); // extract vẫn thành công
        showToast("Đã extract xong nhưng đồng bộ Sheets thất bại. Nhấn 'Đồng bộ Sheets' để thử lại.", "warning");
      }
    }
  };

  // ── Hàm sync dùng chung cho cả auto-sync và manual sync ──────────────────
  const syncWithTwoDayLogic = async (data: BaoCaoData[], scriptUrl: string) => {
    const parseDate = (d: string) => {
      if (!d || d === "N/A") return 0;
      const parts = d.split("/");
      if (parts.length === 3) return new Date(+parts[2], +parts[1]-1, +parts[0]).getTime();
      return new Date(d).getTime() || 0;
    };

    // Group theo tên dự án
    const groups: Record<string, BaoCaoData[]> = {};
    for (const item of data) {
      const key = (item.tenDuAn || "N/A").trim().toUpperCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    // Mỗi project: sort ngày asc → lấy 2 mới nhất
    const toSync: Array<{ data: BaoCaoData; lkHomQuaOverride?: string }> = [];

    for (const key in groups) {
      const sorted = groups[key].sort((a, b) =>
        parseDate(a.ngayBaoCao) - parseDate(b.ngayBaoCao)
      );
      const last2 = sorted.slice(-2);

      if (last2.length === 2) {
        toSync.push({ data: last2[0] }); // ngày N-1 sync trước
        toSync.push({
          data: last2[1],
          lkHomQuaOverride: last2[0].lkHomNay || "0%", // lkHomNay(N-1) → làm D cho ngày N
        });
      } else {
        toSync.push({ data: last2[0] });
      }
    }

    for (const item of toSync) {
      const payload = buildSheetsPayload(item.data);
      if (item.lkHomQuaOverride) {
        (payload as any).lkHomQuaOverride = item.lkHomQuaOverride;
      }
      await fetch("/api/sync-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptUrl, payload }),
      });
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const buildSheetsPayload = (data: BaoCaoData) => ({
    action: "updateBaoCao",
    tenDuAn:          data.tenDuAn          || "N/A",
    ngayBaoCao:       data.ngayBaoCao       || "N/A",
    khPercent:        data.khPercent        || "N/A",
    lkHomQua:         data.lkHomQua         || "N/A",
    homNayPercent:    data.homNayPercent    || "N/A",
    lkHomNay:         data.lkHomNay         || "N/A",
    gtHopDong:        data.gtHopDong        || "N/A",
    gtSanLuong:       data.gtSanLuong       || "N/A",
    gtConLai:         data.gtConLai         || "N/A",
    gtNghiemThu:      data.gtNghiemThu      || "N/A",
    congViecTrongNgay: data.congViecTrongNgay || "N/A",
    vuongMac:         data.vuongMac         || "N/A",
    tenFile:          data.tenFile          || "N/A",
  });



  const handleDataUpdate = (index: number, updatedItem: BaoCaoData) => {
    const updated = [...extractedData];
    updated[index] = updatedItem;
    setExtractedData(updated);
  };

  const handleSync = async () => {
    if (extractedData.length === 0) return;
    const savedSettings = localStorage.getItem("bdh_bao_cao_settings");
    const settings = savedSettings ? JSON.parse(savedSettings) : {};
    const scriptUrl = settings.scriptUrl || DEFAULT_SCRIPT_URL;

    setSyncStatus("SYNCING");
    try {
      await syncWithTwoDayLogic(extractedData, scriptUrl);
      setSyncStatus("SUCCESS");
      setTimeout(() => setSyncStatus("IDLE"), 5000);
    } catch (error) {
      console.error("Sync error:", error);
      showToast("Lỗi khi đồng bộ lên Google Sheets. Kiểm tra kết nối và thử lại.", "error");
      setSyncStatus("IDLE");
    }
  };

  const toastConfig = {
    error:   { icon: AlertCircle,    color: "#f87171", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)" },
    warning: { icon: AlertCircle,    color: "#fb923c", bg: "rgba(251,146,60,0.12)",  border: "rgba(251,146,60,0.3)" },
    success: { icon: CheckCircle2,   color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)" },
    info:    { icon: Info,           color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)" },
  };

  return (
    <main
      className="relative flex h-screen w-full overflow-hidden"
      style={{ background: "#050505", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 20% 50%, rgba(0,242,255,0.03) 0%, transparent 70%), radial-gradient(ellipse 40% 60% at 80% 30%, rgba(16,185,129,0.03) 0%, transparent 70%)",
        }}
      />

      {/* Toast Notifications */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const cfg = toastConfig[toast.type];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-3 px-4 py-3 rounded-xl pointer-events-auto"
                style={{
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cfg.color }} />
                <p className="text-xs leading-relaxed flex-1" style={{ color: cfg.color }}>{toast.message}</p>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: cfg.color }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Settings Button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="absolute top-5 left-5 z-20 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-[rgba(0,242,255,0.3)] hover:shadow-[0_0_15px_rgba(0,242,255,0.2)] transition-all group"
        style={{ background: "rgba(18,18,18,0.8)", backdropFilter: "blur(20px)" }}
      >
        <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {/* Left: Upload or PDF Viewer */}
      <div className="w-[40%] h-full shrink-0 p-4">
        {status === "SUCCESS" && fileUrls.length > 0 ? (
          <div
            className="h-full w-full flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_0_0_1px_rgba(0,242,255,0.06),0_20px_60px_rgba(0,0,0,0.8)]"
            style={{ background: "rgba(12,12,12,0.95)" }}
          >
            {/* PDF Header */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]"
              style={{ background: "rgba(18,18,18,0.8)" }}
            >
              <div>
                <h3 className="text-xs font-bold text-white/90 tracking-wide">📄 File Báo Cáo Gốc</h3>
                <p className="text-[10px] text-white/30 mt-0.5">Đối chiếu nội dung trực tiếp</p>
              </div>
              <div className="flex items-center gap-2">
                {fileUrls.length > 1 &&
                  fileUrls.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPdfIndex(i)}
                      className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all border ${
                        i === selectedPdfIndex
                          ? "text-[#00f2ff] border-[rgba(0,242,255,0.3)]"
                          : "text-white/30 border-white/10 hover:text-white"
                      }`}
                      style={{
                        background: i === selectedPdfIndex ? "rgba(0,242,255,0.1)" : "rgba(255,255,255,0.03)",
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                <button
                  onClick={() => {
                    setStatus("IDLE");
                    setPreviews([]);
                    setFileUrls([]);
                    setExtractedData([]);
                    setValidationScores([]);
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold text-white/30 hover:text-[#00f2ff] border border-white/10 hover:border-[rgba(0,242,255,0.25)] rounded-lg transition-all"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  Upload mới
                </button>
              </div>
            </div>
            <iframe src={fileUrls[selectedPdfIndex]} className="flex-1 w-full border-0" title="PDF Viewer" />
          </div>
        ) : (
          <UploadPanel
            onUpload={handleUpload}
            onConfigureRequired={() => setIsSettingsOpen(true)}
            status={status}
            processingText={processingText}
          />
        )}
      </div>

      {/* Right: Results */}
      <div className="w-[60%] h-full shrink-0">
        <ResultsPanel
          dataList={extractedData}
          validationScoresList={validationScores}
          previews={previews}
          fileUrls={fileUrls}
          selectedPdfIndex={selectedPdfIndex}
          onSelectPdf={setSelectedPdfIndex}
          onUpdate={handleDataUpdate}
          onSync={handleSync}
          syncStatus={syncStatus}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
        onSave={(s) => console.log("Saved:", s)}
        defaultScriptUrl={DEFAULT_SCRIPT_URL}
      />
    </main>
  );
}
