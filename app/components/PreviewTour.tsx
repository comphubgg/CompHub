'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const TOUR_STEPS = [
  {
    step: 1,
    page: '/',
    target: 'dashboardIntro',
    title: 'Welcome to the tour',
    description: 'This onboarding tour will guide you through the dashboard, tournaments, and rankings pages in a read-only preview.',
  },
  {
    step: 2,
    page: '/',
    target: 'sidebar',
    title: 'Folder sidebar',
    description: 'The sidebar shows folders and streamer counts. You can observe folder selection and which streamers belong to each list.',
  },
  {
    step: 3,
    page: '/',
    target: 'controls',
    title: 'Player controls',
    description: 'These buttons toggle chat visibility and switch between single and multiview. In tour mode, interactions are limited to keep the flow guided.',
  },
  {
    step: 4,
    page: '/',
    target: 'preview',
    title: 'Main preview',
    description: 'This is the stream preview area. The tour shows the layout, but playback control is not part of the onboarding interactions.',
  },
  {
    step: 5,
    page: '/',
    target: 'chat',
    title: 'Chat panel',
    description: 'The chat panel is visible for context, but chat actions remain disabled while the tour is active.',
  },
  {
    step: 6,
    page: '/tournaments',
    target: 'tournamentHeader',
    title: 'Tournaments overview',
    description: 'Here you can review upcoming and completed tournaments in a read-only preview of the tournament tool.',
  },
  {
    step: 7,
    page: '/tournaments',
    target: 'tournamentControls',
    title: 'Import and controls',
    description: 'Import and editing controls are disabled in preview mode, but the schedule and tournament cards are visible.',
  },
  {
    step: 8,
    page: '/tournaments',
    target: 'tournamentGrid',
    title: 'Tournament cards',
    description: 'This view shows competition details and status badges. The tour uses this page to explain tournament tracking.',
  },
  {
    step: 9,
    page: '/power-rankings',
    target: 'rankingsHeader',
    title: 'Rankings page',
    description: 'The rankings page shows power rankings in a read-only view. Filters and scores are visible for the tour.',
  },
  {
    step: 10,
    page: '/power-rankings',
    target: 'rankingsTable',
    title: 'Ranking details',
    description: 'This step highlights the ranking table and explains the display without enabling edits.',
  },
  {
    step: 11,
    page: '/power-rankings',
    target: 'rankingsFooter',
    title: 'Tour complete',
    description: 'You have reached the end of the onboarding tour. Finish the tour to return to login and request access.',
  },
];

export default function PreviewTour() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [targetRect, setTargetRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');

  const previewMode = searchParams.get('preview') === '1';
  const tourMode = searchParams.get('tour') === '1';
  const stepParam = parseInt(searchParams.get('tourStep') || '1', 10);
  const tourStep = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= TOUR_STEPS.length ? stepParam : 1;
  const currentStep = TOUR_STEPS[tourStep - 1];

  useEffect(() => {
    if (!previewMode || !tourMode) return;
    if (pathname !== currentStep.page) {
      router.replace(`${currentStep.page}?preview=1&tour=1&tourStep=${tourStep}`);
    }
  }, [previewMode, tourMode, pathname, currentStep.page, tourStep, router]);

  useEffect(() => {
    if (!previewMode || !tourMode) {
      setTargetRect(null);
      return;
    }

    const targetElement = currentStep.target
      ? document.querySelector(`[data-tour="${currentStep.target}"]`) as HTMLElement | null
      : null;

    if (!targetElement) {
      setTargetRect(null);
      return;
    }

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    const rect = targetElement.getBoundingClientRect();
    const padding = 12;
    setTargetRect({
      left: Math.max(8, rect.left - padding),
      top: Math.max(8, rect.top - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    const tooltipWidth = 420;
    const tooltipHeight = 220;
    const margin = 16;
    const canRight = rect.left + rect.width + tooltipWidth + margin < window.innerWidth;
    const canLeft = rect.left - tooltipWidth - margin > 0;
    const canBottom = rect.top + rect.height + tooltipHeight + margin < window.innerHeight;
    const canTop = rect.top - tooltipHeight - margin > 0;

    if (canRight) {
      setTooltipPosition('right');
    } else if (canLeft) {
      setTooltipPosition('left');
    } else if (canBottom) {
      setTooltipPosition('bottom');
    } else {
      setTooltipPosition('top');
    }
  }, [previewMode, tourMode, tourStep, currentStep.target]);

  // Tour disabled
  return null;
}
