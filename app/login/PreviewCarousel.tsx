"use client";

import { useEffect, useState } from 'react';

import T from '@/app/components/T';
const slides = [
  {
    title: 'Dashboard overview',
    description: 'Dashboard overview screenshot for the main app view.',
    image: '/login-screenshots/dashboard.png',
  },
  {
    title: 'Full app preview',
    description: 'Complete app page screenshot showing layout and navigation.',
    image: '/login-screenshots/ganze-seite.png',
  },
  {
    title: 'Multiview layout',
    description: 'Multiview screen view with chat and stream panels.',
    image: '/login-screenshots/multiview.png',
  },
  {
    title: 'Rankings list',
    description: 'Power rankings table screenshot with pagination.',
    image: '/login-screenshots/ranking.png',
  },
  {
    title: 'Tournament cards',
    description: 'Tournament overview screenshot with filters and event cards.',
    image: '/login-screenshots/Tournaments.png',
  },
];

export default function PreviewCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const slideCount = slides.length;
  const currentSlide = slides[activeSlide] || slides[0] || null;

  useEffect(() => {
    if (slideCount === 0 || isPaused || isZoomed) return undefined;

    const timer = setInterval(() => {
      setActiveSlide((current) => (current + 1) % slideCount);
    }, 9000);
    return () => clearInterval(timer);
  }, [slideCount, isPaused, isZoomed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (slideCount === 0) return;
      if (event.key === 'Escape' && isZoomed) {
        setIsZoomed(false);
      }
      if (event.key === 'ArrowLeft') {
        setActiveSlide((current) => (current - 1 + slideCount) % slideCount);
      }
      if (event.key === 'ArrowRight') {
        setActiveSlide((current) => (current + 1) % slideCount);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideCount, isZoomed]);

  if (!currentSlide) {
    return (
      <div className="space-y-5">
        <div className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-5">
          <div className="text-slate-400">No preview screenshots available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">View-only demo</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">{currentSlide.title}</h2>
            <p className="mt-2 text-sm text-slate-400">{currentSlide.description}</p>
            <div className="mt-4 grid gap-2 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Dashboard rules</div>
              <p>• This preview is view-only. No streams are actually playing.</p>
              <p>• You can browse the page, but you cannot add or change stream entries.</p>
              <p>• Use the arrows or keyboard to navigate.</p>
              <p>• Zoom enlarges the image and pauses rotation.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPaused((value) => !value)}
              className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsZoomed(true);
                setIsPaused(true);
              }}
              className="rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              Zoom
            </button>
            <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Slide {activeSlide + 1} / {slideCount}
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
            <img
              src={currentSlide.image}
              alt={currentSlide.title}
              className={`h-[280px] w-full object-cover transition duration-300 ${isZoomed ? 'scale-105' : 'scale-100'}`}
            />
            <button
              type="button"
              onClick={() => setActiveSlide((current) => (current - 1 + slideCount) % slideCount)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label="Previous slide"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setActiveSlide((current) => (current + 1) % slideCount)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label="Next slide"
            >
              ›
            </button>
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200">
              Arrow keys work too
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Slide details</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{currentSlide.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{currentSlide.description}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-500">
              Note: This is a view-only preview. No features are interactive.
            </p>
          </div>
        </div>
      </div>

      {isZoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="relative w-full max-w-6xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl shadow-black/60">
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute right-4 top-4 rounded-full bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              <T>Close</T>
            </button>
            <img
              src={currentSlide.image}
              alt={`Zoomed ${currentSlide.title}`}
              className="h-[calc(100vh-8rem)] w-full object-contain"
            />
            <p className="mt-4 text-sm text-slate-400">Press ESC or Close to return to the normal preview.</p>
          </div>
        </div>
      )}
    </div>
  );
}
