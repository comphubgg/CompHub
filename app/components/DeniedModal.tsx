"use client";
import { t } from "@/app/lib/i18n";
import T from '@/app/components/T';
export default function DeniedModal() {
  return (
    <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-slate-900/95 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="space-y-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-500/10 text-purple-300 shadow-lg shadow-purple-500/10">
          <svg viewBox="0 0 128 128" className="h-12 w-12" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M64 11.2C35.7 11.2 12.8 33.3 12.8 61.6c0 21.9 13.3 40.7 32.2 49.2v12.8l14.5-8c2.2 0.3 4.4 0.5 6.7 0.5 28.2 0 51.1-22.1 51.1-49.5S92.2 11.2 64 11.2zm0 93.8c-2.1 0-4.1-0.2-6.1-0.5l-1.1-0.2-10.8 5.9V102c-19.1-8.1-32.3-26.9-32.3-48.4 0-28.1 22.4-50.8 50-50.8s50 22.7 50 50.8-22.4 50.8-50 50.8z" />
            <path d="M45.9 50.1c-2.7 0-4.9 2.2-4.9 4.9s2.2 4.9 4.9 4.9 4.9-2.2 4.9-4.9-2.2-4.9-4.9-4.9zm36.2 0c-2.7 0-4.9 2.2-4.9 4.9s2.2 4.9 4.9 4.9 4.9-2.2 4.9-4.9-2.2-4.9-4.9-4.9z" />
          </svg>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-[28px] border border-white/10 bg-slate-950/80 p-6 text-left shadow-lg shadow-black/20">
            <h1 className="text-3xl font-semibold text-white"><T>What this does</T></h1>
            <p className="text-slate-300">
              This tool shows the most important streaming and tournament data at a glance.
              Live status, player stats and internal overviews are compiled here for authorized users.
            </p>
            <ul className="mt-4 space-y-2 text-left text-slate-300">
              <li><T>• Match statistics in real-time</T></li>
              <li><T>• Player overview and leaderboards</T></li>
              <li><T>• Live stream status and Twitch data</T></li>
              <li><T>• Fully integrated pro players (NA & EU)</T></li>
              <li><T>• Add custom streamers (manually selectable)</T></li>
              <li><T>• Overview of all tournaments and leaderboards</T></li>
            </ul>
          </div>

          <div className="space-y-4 rounded-[28px] border border-white/10 bg-slate-950/80 p-6 text-left shadow-lg shadow-black/20">
            <h2 className="text-2xl font-semibold text-white"><T>No access?</T></h2>
            <p className="text-slate-300">
              If you believe you should have access, please contact me directly.
              Send a message on Discord or Twitter with your request.
            </p>
            <div className="rounded-3xl bg-slate-900/80 p-4 text-sm text-slate-300">
              <p className="font-semibold text-white"><T>Contact</T></p>
              <p className="mt-3"><T>Discord:</T> <span className="font-medium text-purple-300"><T>juanitofnbr</T></span></p>
              <p><T>Twitter:</T> <a className="text-blue-400 hover:text-blue-300" href="https://twitter.com/juanitofnbr" target="_blank" rel="noreferrer">@juanitofnbr</a></p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/80 p-6 text-left shadow-lg shadow-black/20">
          <p className="text-slate-300"><T>Note: Login is restricted to selected users. You can use the dashboard only if I have enabled your access.</T></p>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <a
          href="/api/auth/discord/authorize"
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-black/40 transition hover:bg-white/10"
          aria-label="Try again - Discord Login"
        >
          <T>Erneut versuchen</T>
        </a>
      </div>
    </div>
  );
}
