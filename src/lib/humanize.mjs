import { sleep } from './utils.mjs';

// Box-Muller → standard normal. Used to build lognormal delays where most waits
// are short-ish but the tail stretches well past the mean — closer to actual
// human idle-time distributions than uniform random.
function randomNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Lognormal sample with median `median` and tail controlled by `sigma`.
// sigma=0.6 produces occasional spikes 3-5× the median; sigma=0.9 occasional 10×.
function lognormal(median, sigma) {
  const mu = Math.log(median);
  return Math.exp(mu + sigma * randomNormal());
}

export async function humanSleep({
  minMs,
  maxMs,
  longPauseProbability = 0.12,
  longPauseMinMs = 30_000,
  longPauseMaxMs = 180_000,
  label = null,
} = {}) {
  if (Math.random() < longPauseProbability) {
    const span = longPauseMaxMs - longPauseMinMs;
    const pauseMs = Math.floor(longPauseMinMs + Math.random() * span);
    const secs = Math.round(pauseMs / 1000);
    console.log(`[humanize] ${label ? label + ': ' : ''}long pause ${secs}s`);
    await sleep(pauseMs);
    return pauseMs;
  }
  // Lognormal around the geometric mean of [min, max]; clamp into range.
  const median = Math.sqrt(Math.max(minMs, 1) * Math.max(maxMs, 1));
  const sigma = 0.45;
  let pauseMs = Math.floor(lognormal(median, sigma));
  // Don't go below min; allow tail to exceed max up to 2× for realism, then hard-clip.
  if (pauseMs < minMs) pauseMs = minMs + Math.floor(Math.random() * (median - minMs));
  if (pauseMs > maxMs * 2) pauseMs = maxMs * 2;
  await sleep(pauseMs);
  return pauseMs;
}

export async function interCityPause() {
  return humanSleep({
    minMs: 15_000,
    maxMs: 35_000,
    longPauseProbability: 0.03,
    longPauseMinMs: 45_000,
    longPauseMaxMs: 90_000,
    label: 'switching city',
  });
}

export async function humanizeInteraction(page) {
  if (!page || page.isClosed()) return;
  try {
    // 70% scroll down some amount to simulate "reading the results"
    if (Math.random() < 0.7) {
      const delta = Math.floor(120 + Math.random() * 900);
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta);
      await sleep(Math.floor(250 + Math.random() * 900));
    }
    // 45% chance of second scroll (user continues down)
    if (Math.random() < 0.45) {
      const delta = Math.floor(80 + Math.random() * 600);
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta);
      await sleep(Math.floor(200 + Math.random() * 700));
    }
    // 35% jiggle the mouse
    if (Math.random() < 0.35) {
      const x = Math.floor(120 + Math.random() * 1100);
      const y = Math.floor(120 + Math.random() * 500);
      const steps = Math.floor(6 + Math.random() * 14);
      await page.mouse.move(x, y, { steps });
    }
    // 20% scroll back up a bit (re-reading)
    if (Math.random() < 0.2) {
      const delta = -Math.floor(60 + Math.random() * 300);
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta);
      await sleep(Math.floor(200 + Math.random() * 500));
    }
  } catch {
    // humanization is best-effort; page may have already navigated away
  }
}
