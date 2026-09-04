"use client";
import { t } from "@/app/lib/i18n";

interface NotificationBellProps {
  notificationsEnabled: boolean;
  onToggle: () => void;
  newNotifications: boolean;
}

export default function NotificationBell({ notificationsEnabled, onToggle }: NotificationBellProps) {
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={onToggle}
        className="rounded-full bg-zinc-900 border border-zinc-700 p-3 text-white shadow-lg hover:bg-zinc-800 transition"
        title={notificationsEnabled ? t("notifications_an_klick_zum_deaktivieren", "Notifications an (klick zum deaktivieren)") : t("notifications_aus_klick_zum_aktivieren", "Notifications aus (klick zum aktivieren)")}
      >
        {notificationsEnabled ? "🔔" : "🔕"}
      </button>
    </div>
  );
}
