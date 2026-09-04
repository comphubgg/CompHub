"use client";
import { t } from "@/app/lib/i18n";
import { useEffect, useState } from "react";

export default function DemoPanel() {
  const [showDemo, setShowDemo] = useState(false);
  const [demoNotification, setDemoNotification] = useState<string | null>(null);
  const [mainHeight, setMainHeight] = useState(75);

  const sendFakeNotification = (streamer: string, viewers: number) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(`🔴 ${streamer} ist live!`, {
        body: `${viewers.toLocaleString()} Zuschauer`,
      });
    }

    setDemoNotification(`🔴 ${streamer} ist jetzt LIVE! (${viewers.toLocaleString()} Zuschauer)`);
    window.setTimeout(() => setDemoNotification(null), 4000);
  };

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert(t("dein_browser_untersttzt_keine_notifications", "Dein Browser unterstützt keine Notifications"));
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        alert(t("notifications_aktiviert", "✅ Notifications aktiviert!"));
        sendFakeNotification(t("demo_streamer", "Demo Streamer"), 1234);
      }
    } else if (Notification.permission === "granted") {
      alert(t("notifications_sind_bereits_aktiviert", "✅ Notifications sind bereits aktiviert!"));
    } else {
      alert("❌ Notifications are disabled. Check your browser settings.");
    }
  };

  useEffect(() => {
    return () => {
      setDemoNotification(null);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {demoNotification && (
        <div className="mb-3 animate-in fade-in slide-in-from-right-full duration-300">
          <div className="bg-gradient-to-r from-red-950 to-purple-950 border border-red-500/50 rounded-lg px-4 py-3 shadow-lg shadow-red-500/20 text-sm font-bold text-white flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            {demoNotification}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowDemo((prev) => !prev)}
        className="bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-2 px-3 rounded-lg shadow-lg transition-all transform hover:scale-105"
        title={t("demo_panel", "Demo Panel")}
      >
        {t("demo", "🎬 Demo")}
      </button>

      {showDemo && (
        <div className="absolute bottom-16 right-0 bg-zinc-900/95 border border-purple-500/50 rounded-lg p-4 shadow-2xl shadow-purple-500/20 w-64 backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-200">
          <h3 className="text-white text-xs font-bold mb-3 uppercase tracking-wider">{t("demo_features", "🎬 Demo Features")}</h3>

          <div className="space-y-2 mb-4 pb-4 border-b border-zinc-700">
            <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider mb-2">{t("notifications", "🔔 Notifications")}</div>
            <button
              onClick={requestNotificationPermission}
              className="w-full bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 text-xs py-1.5 px-2 rounded transition-all"
            >
              {t("notifications_aktivieren", "✅ Notifications aktivieren")}
            </button>
            <button
              onClick={() => sendFakeNotification("vadeal", 1245)}
              className="w-full bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-red-300 text-xs py-1.5 px-2 rounded transition-all"
            >
              {t("vadeal_live_12k", "🔴 vadeal live (1.2k)")}
            </button>
          </div>

          <div className="space-y-2 mb-4 pb-4 border-b border-zinc-700">
            <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider mb-2">{t("layout_preset", "📐 Layout Preset")}</div>
            <div className="space-y-1">
              <button
                onClick={() => setMainHeight(50)}
                className="w-full bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 text-xs py-1 px-2 rounded transition-all"
              >
                {t("5050_split", "50/50 Split")}
              </button>
              <button
                onClick={() => setMainHeight(75)}
                className="w-full bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 text-xs py-1 px-2 rounded transition-all"
              >
                {t("groklein_7525", "Groß/Klein (75/25)")}
              </button>
              <button
                onClick={() => setMainHeight(90)}
                className="w-full bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 text-xs py-1 px-2 rounded transition-all"
              >
                {t("sehr_gro_9010", "Sehr Groß (90/10)")}
              </button>
            </div>
            <div className="mt-2 text-[10px] text-zinc-500 bg-zinc-800/50 p-2 rounded">
              💡 <strong>{t("tipp", "Tipp:")}</strong> {t("im_multiview_siehst_du_einen_balken_zwischen_den_streams__zi", "Im Multiview siehst du einen Balken zwischen den Streams - zieh ihn, um die Größe zu ändern!")}
            </div>
          </div>

          <div className="text-xs text-zinc-500 space-y-1">
            <div className="flex items-center gap-1">
              <span>✅</span>
              <span>{t("streamer_mit__hinzufgen", "Streamer mit ➕ hinzufügen")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>❌</span>
              <span>{t("streamer_mit__entfernen", "Streamer mit ✕ entfernen")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>🖱️</span>
              <span>{t("kleine_streams__klickbar", "Kleine Streams = klickbar")}</span>
            </div>
          </div>

          <button
            onClick={() => setShowDemo(false)}
            className="mt-3 w-full bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs py-1 px-2 rounded transition-all"
          >
            {t("schlieen", "Schließen")}
          </button>
        </div>
      )}
    </div>
  );
}
