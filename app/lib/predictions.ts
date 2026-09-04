import { promises as fs } from 'fs';
import path from 'path';
import type { PredictionRecord, PredictionEntry } from './predictionsTypes';
import { DATEN_ORT } from '@/lib/datenOrt';

const PREDICTIONS_FILE = path.join(DATEN_ORT, 'predictions.json');

function slugifyIdentifier(identifier: string) {
  return identifier
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureDataDir() {
  const dir = path.dirname(PREDICTIONS_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readPredictionsData(): Promise<PredictionRecord[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PREDICTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function writePredictionsData(data: PredictionRecord[]) {
  await ensureDataDir();
  await fs.writeFile(PREDICTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function loadAllPredictions(): Promise<PredictionRecord[]> {
  return await readPredictionsData();
}

export async function loadPredictionBySlug(slug: string): Promise<PredictionRecord | null> {
  const predictions = await readPredictionsData();
  return predictions.find((prediction) => prediction.slug === slug) ?? null;
}

export async function savePredictionRecord(prediction: PredictionRecord): Promise<void> {
  const predictions = await readPredictionsData();
  const existingIndex = predictions.findIndex((item) => item.slug === prediction.slug);
  if (existingIndex >= 0) {
    predictions[existingIndex] = prediction;
  } else {
    predictions.push(prediction);
  }
  await writePredictionsData(predictions);
}

export async function deletePredictionBySlug(slug: string): Promise<void> {
  const predictions = await readPredictionsData();
  const next = predictions.filter((item) => item.slug !== slug);
  await writePredictionsData(next);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPlaceholderMapSvg(title: string, width = 1280, height = 720) {
  const text = escapeXml(title || 'Tournament map unavailable');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#020617" />
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" rx="30" ry="30" fill="#0f172a" stroke="#1e293b" stroke-width="4" />
  <text x="50%" y="45%" text-anchor="middle" fill="#7dd3fc" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="42" font-weight="700">Map preview unavailable</text>
  <text x="50%" y="55%" text-anchor="middle" fill="#cbd5e1" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="24">${text}</text>
</svg>`;
  return Buffer.from(svg).toString('base64');
}

function extractTitleFromHtml(html: string) {
  const titleMatch = /<title>([^<]*)<\/title>/i.exec(html);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].trim());
  }

  const ogTitleMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (ogTitleMatch?.[1]) {
    return decodeHtmlEntities(ogTitleMatch[1].trim());
  }

  const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  if (h1Match?.[1]) {
    return decodeHtmlEntities(h1Match[1].trim());
  }

  return 'Prediction event';
}

function normalizeTextCandidate(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*\+\s*/g, ' + ');
}

function extractEntriesFromHtml(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, ' ');

  const candidates = new Map<string, string[]>();
  const matches = Array.from(stripped.matchAll(/>([^<]{4,120})</g));

  for (const match of matches) {
    const raw = normalizeTextCandidate(match[1]);
    if (!raw) continue;
    if (raw.length < 4 || raw.length > 80) continue;
    if (/\b(score|rank|stage|round|prize|tournament|match|group|points|date|time|day)\b/i.test(raw)) continue;
    if (/\d{1,2}(st|nd|rd|th)\b/i.test(raw)) continue;

    const segments = raw
      .split(/[/\\+\n\r·•–—]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (segments.length === 0 || segments.length > 4) continue;

    const normalizedSegments = segments.map((part) => part.replace(/\s+/g, ' ').trim());
    const hasValidSegment = normalizedSegments.some((segment) => /[A-Za-zÄÖÜäöü]/.test(segment));
    if (!hasValidSegment) continue;

    const label = normalizedSegments.join(' / ');
    if (!label || label.length < 4) continue;
    if (label.length > 80) continue;
    if (/^(home|away|vs|versus|win|lose|draw)$/i.test(label)) continue;

    if (!candidates.has(label)) {
      candidates.set(label, normalizedSegments);
    }
  }

  return Array.from(candidates.entries()).map(([label, players]) => ({
    id: slugifyIdentifier(label),
    label,
    players,
    position: null,
  }));
}

function isPlaywrightMissingBrowserError(error: unknown) {
  const message = String((error as any)?.message || error || '');
  return /Executable doesn't exist|Please run the following command to download new browsers|playwright was just installed or updated/i.test(message);
}

async function fetchImageAsBase64(imageUrl: string) {
  const response = await fetch(imageUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Unable to fetch map image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  return {
    mapImageBase64: buffer.toString('base64'),
    mapImageMime: contentType,
  };
}

function extractMapImageUrlFromHtml(html: string, baseUrl: string) {
  const imageMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi));
  const candidates: { src: string; score: number }[] = [];

  for (const match of imageMatches) {
    const src = match[1];
    if (!src) continue;
    const lower = match[0].toLowerCase();
    const score = (lower.match(/map|event|battle|tournament|arena|layout|background/) || []).length;
    try {
      const absoluteUrl = new URL(src, baseUrl).toString();
      candidates.push({ src: absoluteUrl, score });
    } catch {
      continue;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].src : null;
}

async function parseTournamentSourceFromHtml(tournamentUrl: string) {
  const response = await fetch(tournamentUrl, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PredictionBot/1.0)' } });
  if (!response.ok) {
    throw new Error(`Unable to fetch tournament source: ${response.status}`);
  }

  const html = await response.text();
  const title = extractTitleFromHtml(html);
  const entries = extractEntriesFromHtml(html);
  const mapWidth = 1280;
  const mapHeight = 720;
  let mapImageBase64 = createPlaceholderMapSvg(title, mapWidth, mapHeight);
  let mapImageMime = 'image/svg+xml';

  const imageUrl = extractMapImageUrlFromHtml(html, tournamentUrl);
  if (imageUrl) {
    try {
      const fetched = await fetchImageAsBase64(imageUrl);
      mapImageBase64 = fetched.mapImageBase64;
      mapImageMime = fetched.mapImageMime;
    } catch {
      // ignore image fetch failure and keep placeholder
    }
  }

  return {
    title,
    mapImageBase64,
    mapImageMime,
    mapWidth,
    mapHeight,
    entries,
  };
}

async function parseTournamentSourceWithPlaywright(tournamentUrl: string) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1600, height: 960 });
    await page.goto(tournamentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);

    const pageTitle = await page.title();

    async function findMapRoot() {
      const selectors = [
        '.map',
        '.tournament-map',
        '.event-map',
        '.map-container',
        '[class*=map]',
        '[id*=map]',
      ];

      for (const selector of selectors) {
        try {
          const handle = await page.$(selector);
          if (!handle) continue;
          const box = await handle.boundingBox();
          if (box && box.width >= 120 && box.height >= 120) {
            return { handle, selector, box };
          }
        } catch {
          // ignore selector errors
        }
      }

      const images = await page.$$('img');
      let bestImage = null as { handle: any; box: { width: number; height: number } } | null;
      for (const image of images) {
        const box = await image.boundingBox();
        if (!box || box.width < 180 || box.height < 120) continue;
        if (!bestImage || box.width * box.height > bestImage.box.width * bestImage.box.height) {
          bestImage = { handle: image, box };
        }
      }

      if (bestImage) {
        return { handle: bestImage.handle, selector: null, box: bestImage.box } as const;
      }

      return null;
    }

    const foundMap = await findMapRoot();
    let screenshotBuffer: Buffer;
    let mapWidth = 1600;
    let mapHeight = 960;
    let rootSelector: string | null = null;

    if (foundMap) {
      screenshotBuffer = await foundMap.handle.screenshot({ type: 'png' });
      mapWidth = Math.max(1, Math.round(foundMap.box.width));
      mapHeight = Math.max(1, Math.round(foundMap.box.height));
      rootSelector = foundMap.selector || null;
    } else {
      const pageSize = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      mapWidth = Math.min(1600, Math.max(600, pageSize.width));
      mapHeight = Math.min(960, Math.max(400, pageSize.height));
      await page.setViewportSize({ width: mapWidth, height: mapHeight });
      screenshotBuffer = await page.screenshot({ type: 'png', fullPage: true });
      rootSelector = null;
    }

    const rawEntries = await page.evaluate((rootSelectorValue) => {
      const root = rootSelectorValue ? document.querySelector(rootSelectorValue) : document.body;
      if (!root) return [] as any[];

      const rootRect = root.getBoundingClientRect();
      const candidates = Array.from(root.querySelectorAll('div,span,li,p,button,td,th'));
      const entries: any[] = [];

      for (const element of candidates) {
        const text = element.textContent?.trim() || '';
        if (!text) continue;

        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 0 || lines.length > 4) continue;
        if (text.length > 120) continue;

        const normalized = text.replace(/\s+/g, ' ').trim();
        const rect = element.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 20) continue;
        if (rect.top < rootRect.top - 20 || rect.left < rootRect.left - 20) continue;
        if (rect.bottom > rootRect.bottom + 20 || rect.right > rootRect.right + 20) continue;

        const isTeamLike =
          lines.length >= 2 ||
          normalized.includes('+') ||
          normalized.includes('/') ||
          /[A-ZÄÖÜ][a-zäöü]+\s+[A-ZÄÖÜ][a-zäöü]+/.test(normalized);

        if (!isTeamLike) continue;

        entries.push({
          label: lines.join(' / '),
          players: lines,
          top: rect.top - rootRect.top,
          left: rect.left - rootRect.left,
          width: rect.width,
          height: rect.height,
        });
      }

      return entries;
    }, rootSelector);

    const entries: PredictionEntry[] = [];
    const labelSet = new Set<string>();
    for (const item of rawEntries) {
      const label = String(item.label).trim();
      if (!label || labelSet.has(label)) continue;
      labelSet.add(label);
      entries.push({
        id: slugifyIdentifier(label),
        label,
        players: Array.isArray(item.players) ? item.players.map((player: unknown) => String(player).trim()) : [label],
        position: {
          top: Number(item.top) / mapHeight,
          left: Number(item.left) / mapWidth,
          width: Number(item.width) / mapWidth,
          height: Number(item.height) / mapHeight,
        },
      });
    }

    return {
      title: pageTitle || 'Prediction event',
      mapImageBase64: screenshotBuffer.toString('base64'),
      mapImageMime: 'image/png',
      mapWidth,
      mapHeight,
      entries,
    };
  } finally {
    await browser.close();
  }
}

export async function parseTournamentSource(tournamentUrl: string) {
  if (!/^https?:\/\//i.test(tournamentUrl)) {
    throw new Error('Tournament URL must include a valid protocol (https://).');
  }

  try {
    return await parseTournamentSourceWithPlaywright(tournamentUrl);
  } catch (error: unknown) {
    if (isPlaywrightMissingBrowserError(error)) {
      console.warn('Playwright browser missing, falling back to HTML-only parsing.');
    } else {
      console.warn('Playwright parsing failed, trying HTML-only parsing.', error);
    }
    return await parseTournamentSourceFromHtml(tournamentUrl);
  }
}

export async function createPredictionRecord(identifier: string, tournamentUrl: string) {
  const predictions = await readPredictionsData();
  const normalizedIdentifier = identifier.trim();
  const slug = slugifyIdentifier(normalizedIdentifier);
  if (!slug) {
    throw new Error('Identifier must contain alphanumeric characters.');
  }
  if (predictions.some((item) => item.slug === slug)) {
    throw new Error(`Prediction with identifier "${normalizedIdentifier}" already exists.`);
  }

  const parsed = await parseTournamentSource(tournamentUrl);
  const now = new Date().toISOString();

  const record: PredictionRecord = {
    slug,
    identifier: normalizedIdentifier,
    title: parsed.title || normalizedIdentifier,
    tournamentUrl,
    active: false,
    createdAt: now,
    updatedAt: now,
    mapImageBase64: parsed.mapImageBase64,
    mapImageMime: parsed.mapImageMime,
    mapWidth: parsed.mapWidth,
    mapHeight: parsed.mapHeight,
    entries: parsed.entries,
  };

  predictions.push(record);
  await writePredictionsData(predictions);
  return record;
}

export async function updatePredictionRecord(slug: string, updates: Partial<Pick<PredictionRecord, 'identifier' | 'tournamentUrl' | 'active' | 'title'>> & { reload?: boolean }) {
  const predictions = await readPredictionsData();
  const index = predictions.findIndex((prediction) => prediction.slug === slug);
  if (index === -1) {
    throw new Error('Prediction not found');
  }

  const existing = predictions[index];
  const next: PredictionRecord = { ...existing };

  if (updates.identifier) {
    const normalizedIdentifier = updates.identifier.trim();
    const newSlug = slugifyIdentifier(normalizedIdentifier);
    if (!newSlug) {
      throw new Error('Identifier must contain alphanumeric characters.');
    }
    if (newSlug !== slug && predictions.some((item) => item.slug === newSlug)) {
      throw new Error('A prediction with this identifier already exists.');
    }
    next.identifier = normalizedIdentifier;
    next.slug = newSlug;
  }

  if (typeof updates.tournamentUrl === 'string' && updates.tournamentUrl.trim()) {
    next.tournamentUrl = updates.tournamentUrl.trim();
  }

  if (typeof updates.active === 'boolean') {
    next.active = updates.active;
  }

  if (typeof updates.title === 'string') {
    next.title = updates.title.trim();
  }

  if (updates.reload) {
    const parsed = await parseTournamentSource(next.tournamentUrl);
    next.title = parsed.title || next.title;
    next.mapImageBase64 = parsed.mapImageBase64;
    next.mapImageMime = parsed.mapImageMime;
    next.mapWidth = parsed.mapWidth;
    next.mapHeight = parsed.mapHeight;
    next.entries = parsed.entries;
  }

  next.updatedAt = new Date().toISOString();

  predictions[index] = next;
  await writePredictionsData(predictions);

  return next;
}

export async function writePredictionSubmission(slug: string, slots: string[]) {
  const submissionsDir = path.join(DATEN_ORT, 'prediction-submissions');
  await fs.mkdir(submissionsDir, { recursive: true });
  const submissionFile = path.join(submissionsDir, `${slug}.json`);
  const current = await fs.readFile(submissionFile, 'utf-8').then((content) => JSON.parse(content) as any[]).catch(() => []);
  const newSubmission = {
    createdAt: new Date().toISOString(),
    slots,
  };
  await fs.writeFile(submissionFile, JSON.stringify([newSubmission, ...current], null, 2), 'utf-8');
}
