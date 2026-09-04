"use client";
import { t } from "@/app/lib/i18n";

export default function MultiviewDashboard({ onStreamerClick }: { onStreamerClick?: (twitch: string) => void }) {
  return (
    <div className="w-full p-4 text-white">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
        <h2 className="text-lg font-bold">{t("multiview_dashboard", "Multiview Dashboard")}</h2>
        <p className="text-sm text-slate-400 mt-2">{t("multiview_placeholder", "Dashboard temporarily disabled while the app is being fixed.")}</p>
      </div>
    </div>
  );
}
