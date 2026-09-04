import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePath(relativePath) {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.join(__dirname, relativePath);
}

export async function readJsonFile(filePath) {
  const resolved = resolvePath(filePath);
  try {
    const content = await fs.readFile(resolved, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, data) {
  const resolved = resolvePath(filePath);
  await fs.writeFile(resolved, JSON.stringify(data, null, 2), 'utf-8');
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function generateKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 7; i += 1) {
    key += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return key;
}

export function findDashboardUser(dashboardData, username) {
  const normalized = normalizeUsername(username);
  if (!dashboardData || !Array.isArray(dashboardData.folders)) {
    return null;
  }

  for (const folder of dashboardData.folders) {
    if (!Array.isArray(folder.streamers)) continue;
    for (const streamer of folder.streamers) {
      const twitch = normalizeUsername(streamer.twitch);
      const twitter = normalizeUsername(streamer.twitter);
      if (twitch === normalized || twitter === normalized) {
        return { streamer, folderId: folder.id };
      }
    }
  }
  return null;
}

export function findStreamersUser(streamersData, username) {
  const normalized = normalizeUsername(username);
  if (!streamersData || !streamersData.streamers) {
    return null;
  }

  const regions = ['EU', 'NA'];
  for (const region of regions) {
    const list = Array.isArray(streamersData.streamers?.[region]) ? streamersData.streamers[region] : [];
    for (const streamer of list) {
      const twitch = normalizeUsername(streamer.twitch);
      const twitter = normalizeUsername(streamer.twitter);
      if (twitch === normalized || twitter === normalized) {
        return { streamer, region };
      }
    }
  }
  return null;
}

export function findAnyStreamerUser(data, username) {
  return findDashboardUser(data, username) || findStreamersUser(data, username);
}

export function findOrCreateKeyStore(storeData) {
  if (!storeData || typeof storeData !== 'object') {
    return { keys: [] };
  }
  if (!Array.isArray(storeData.keys)) {
    return { ...storeData, keys: [] };
  }
  return storeData;
}

export function markOldKeysInactive(storeData, username) {
  const normalized = normalizeUsername(username);
  if (!Array.isArray(storeData.keys)) return storeData;
  const now = new Date().toISOString();
  storeData.keys = storeData.keys.map((entry) => {
    if (normalizeUsername(entry.username) === normalized && entry.status === 'active') {
      return { ...entry, status: 'inactive', deactivatedAt: now };
    }
    return entry;
  });
  return storeData;
}

export function createKeyEntry(username, key) {
  const now = new Date().toISOString();
  return {
    username: normalizeUsername(username),
    key,
    status: 'active',
    createdAt: now,
  };
}
