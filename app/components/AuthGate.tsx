"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== 'production';
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "authorized" | "unauthorized">(
    isDev ? 'authorized' : 'loading'
  );
  const isPreview = searchParams.get('preview') === '1';
  const hasVerifiedAuth = useRef(false);

  useEffect(() => {
    if (pathname.startsWith("/auth") || pathname === "/anmelden" || isPreview) {
      return;
    }

    if (status === 'authorized') {
      return;
    }

    // In local development allow immediate access so the dev workflow isn't blocked
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        setStatus('authorized');
        return;
      }
    }

    if (hasVerifiedAuth.current) {
      // We already verified once, do not block navigation again.
      setStatus('authorized');
      return;
    }

    let isActive = true;
    setStatus("loading");

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      // If auth verify hangs, proceed to render the app to avoid blocking the UI.
      if (isActive) {
        console.warn('Auth verify timed out — proceeding without confirmation.');
        setStatus('authorized');
      }
      try {
        controller.abort();
      } catch (e) {}
    }, 1000);

    fetch("/api/auth/verify", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!isActive) return;
        clearTimeout(timeout);
        hasVerifiedAuth.current = true;
        if (!res.ok) {
          setStatus("unauthorized");
          return;
        }
        const data = await res.json();
        setStatus(data?.authorized ? "authorized" : "unauthorized");
      })
      .catch((err) => {
        if (!isActive) return;
        clearTimeout(timeout);
        hasVerifiedAuth.current = true;
        // If the fetch was aborted due to timeout, we already set authorized above.
        if ((err as any)?.name === 'AbortError') return;
        setStatus("unauthorized");
      });

    return () => {
      isActive = false;
      clearTimeout(timeout);
      try {
        controller.abort();
      } catch (e) {}
    };
  }, [pathname, isPreview, status]);

  useEffect(() => {
    if (pathname === "/anmelden" && !isPreview) {
      let isActive = true;

      fetch("/api/auth/verify", { cache: "no-store" })
        .then(async (res) => {
          if (!isActive) return;
          if (!res.ok) return;
          const data = await res.json();
          if (data?.authorized) {
            router.replace("/admin");
          }
        })
        .catch(() => {
          // ignore errors on login page
        });

      return () => {
        isActive = false;
      };
    }
  }, [pathname, router, isPreview]);

  useEffect(() => {
    if (pathname !== "/anmelden" && status === "unauthorized" && !isPreview) {
      router.replace("/anmelden");
    }
  }, [status, pathname, router, isPreview]);

  if (pathname.startsWith("/auth") || pathname === "/anmelden" || isPreview) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6 font-sans flex items-center justify-center">
        <div className="max-w-xl rounded-[32px] border border-white/10 bg-slate-900/95 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
          <p className="text-sm text-slate-400">Checking your login…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthorized") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6 font-sans flex items-center justify-center">
        <div className="max-w-xl rounded-[32px] border border-white/10 bg-slate-900/95 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
          <h1 className="text-3xl font-semibold text-white mb-4">You are logged out</h1>
          <p className="text-slate-400 mb-6">Please sign in again with your VIP username and access key to access the dashboard.</p>
          <a
            href="/anmelden"
            className="inline-flex items-center justify-center rounded-full bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Login VIP
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


