"use client";
import { t } from "@/app/lib/i18n";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import T from '@/app/components/T';
function AuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const login = searchParams.get("login");
    const userId = searchParams.get("id");
    const avatarHash = searchParams.get("avatar");
    const discriminator = searchParams.get("discriminator");

    let avatarUrl: string | null = null;
    if (userId) {
      const extension = avatarHash?.startsWith("a_") ? "gif" : "png";
      avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(avatarHash)}.${extension}?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(discriminator || "0") % 5}.png`;
    }

    if (typeof window !== "undefined") {
      if (login) {
        localStorage.setItem("streamer_dashboard_logged_in", "true");
        localStorage.setItem("streamer_dashboard_user_login", login);
        document.cookie = `streamer_dashboard_user_login=${encodeURIComponent(login)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=Lax`;
      }

      if (avatarUrl) {
        localStorage.setItem("streamer_dashboard_user_avatar", avatarUrl);
        document.cookie = `streamer_dashboard_user_avatar=${encodeURIComponent(avatarUrl)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=Lax`;
      }
    }

    const timeout = setTimeout(() => {
      router.replace("/admin");
    }, 500);

    return () => clearTimeout(timeout);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-lg rounded-[32px] border border-white/10 bg-slate-900/90 p-10 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-500/10 text-purple-300 shadow-lg shadow-purple-500/20">
          <svg className="h-10 w-10" viewBox="0 0 128 128" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M64 11.2C35.7 11.2 12.8 33.3 12.8 61.6c0 21.9 13.3 40.7 32.2 49.2v12.8l14.5-8c2.2 0.3 4.4 0.5 6.7 0.5 28.2 0 51.1-22.1 51.1-49.5S92.2 11.2 64 11.2zm0 93.8c-2.1 0-4.1-0.2-6.1-0.5l-1.1-0.2-10.8 5.9V102c-19.1-8.1-32.3-26.9-32.3-48.4 0-28.1 22.4-50.8 50-50.8s50 22.7 50 50.8-22.4 50.8-50 50.8z" />
            <path d="M45.9 50.1c-2.7 0-4.9 2.2-4.9 4.9s2.2 4.9 4.9 4.9 4.9-2.2 4.9-4.9-2.2-4.9-4.9-4.9zm36.2 0c-2.7 0-4.9 2.2-4.9 4.9s2.2 4.9 4.9 4.9 4.9-2.2 4.9-4.9-2.2-4.9-4.9-4.9z" />
          </svg>
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-white">
          <T>Login erfolgreich</T>
        </h1>
        <p className="mt-4 text-slate-400">
          <T>Du wirst jetzt zurück zum Tool geleitet.</T>
        </p>
      </div>
    </div>
  );
}

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4"><T>Loading…</T></div>}>
      <AuthSuccessContent />
    </Suspense>
  );
}
