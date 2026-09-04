const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldLoadLiveStatus, normalizeLiveStatusUsername, detectTwitchLiveStatusFromHtml } = require('./liveStatus.ts');

test('loads live status for guests once the dashboard is mounted', () => {
  assert.equal(shouldLoadLiveStatus({ isMounted: true, isGuest: true }), true);
  assert.equal(shouldLoadLiveStatus({ isMounted: false, isGuest: false }), false);
});

test('normalizes streamer names consistently for live-status lookups', () => {
  assert.equal(normalizeLiveStatusUsername(' Vadeal '), 'vadeal');
  assert.equal(normalizeLiveStatusUsername('MIXWELL'), 'mixwell');
});

test('detects live status from Twitch HTML metadata', () => {
  const liveHtml = '<html><head><title>Vadeal - Live on Twitch</title><meta property="og:title" content="Vadeal - Live on Twitch" /></head></html>';
  assert.deepEqual(detectTwitchLiveStatusFromHtml(liveHtml, 'vadeal'), { isLive: true, viewers: 0 });

  const offlineHtml = '<html><head><title>Vadeal - Twitch</title><meta property="og:title" content="Vadeal - Twitch" /></head></html>';
  assert.deepEqual(detectTwitchLiveStatusFromHtml(offlineHtml, 'vadeal'), { isLive: false, viewers: 0 });
});
