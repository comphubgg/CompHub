export default function AuthDeniedPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-center">
        <section className="space-y-6 lg:w-1/2">
          <div className="rounded-[32px] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-500/10 text-purple-300">
                <span className="text-2xl">💬</span>
              </div>
              <div>
                <h1 className="text-3xl font-semibold">Streamer Tool Dashboard</h1>
                <p className="mt-2 text-sm text-slate-400">
                  This dashboard shows internal streamer info, tournament data and live status.
                  Only pre-approved users are allowed to use it.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="space-y-4">
              <p className="text-xl font-semibold text-red-300">Access denied</p>
              <p className="text-slate-300">
                You are not authorized to use this page. If you need access,
                please contact me and I will check your account.
              </p>
              <div className="rounded-3xl bg-slate-950/90 p-4 text-sm text-slate-300 border border-zinc-800">
                <p className="font-semibold text-slate-100">Contact the owner:</p>
                <p className="mt-3">Discord: <span className="font-medium text-white">juanitofnbr</span></p>
                <p>Twitter: <a className="text-blue-400 hover:text-blue-300" href="https://twitter.com/juanitofnbr" target="_blank" rel="noreferrer">@juanitofnbr</a></p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:w-1/2">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.25),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.18),_transparent_25%)]" />
            <div className="relative grid gap-6">
              <div className="mx-auto h-72 w-full max-w-md rounded-3xl bg-slate-950/50 p-6 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
                  <span>Dashboard streamer</span>
                  <span>LIVE</span>
                </div>
                <div className="h-44 rounded-3xl bg-slate-800/80 p-4">
                  <div className="flex h-full items-center justify-center text-6xl text-slate-500">📊</div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/75 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Tool Info</p>
                <h2 className="mt-4 text-3xl font-semibold text-white">For authorized streamers only</h2>
                <p className="mt-4 text-slate-300">
                  Here you can access match stats, player data and live status for the channel.
                  Only authorized users receive full access.
                </p>
                <ul className="mt-4 space-y-2 text-left text-slate-300">
                  <li>• Full pro player integration (NA & EU)</li>
                  <li>• Add your own streamers manually</li>
                  <li>• Tournament and leaderboard overview</li>
                  <li>• More features planned: advanced stats, alerts, and integrations</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="mt-10 flex justify-center">
        <a
          href="/anmelden"
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
        >Return to VIP benefits</a>
      </div>
    </main>
  );
}

