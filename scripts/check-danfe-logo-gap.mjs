#!/usr/bin/env node
/**
 * Verifica geometria da cauda do Q: deve começar em x <= círculo.x_right(y)
 * para todo y da faixa da cauda (sem vão).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/lib/pdf/danfe-logo.ts'), 'utf8');

const circle = src.match(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/);
const tail = src.match(/<path fill="#000" d="M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?) H(\d+(?:\.\d+)?) V(\d+(?:\.\d+)?) H/);
if (!circle || !tail) {
  console.error('PARSE_FAIL');
  process.exit(2);
}

const cx = Number(circle[1]);
const cy = Number(circle[2]);
const r = Number(circle[3]);
const tailX0 = Number(tail[1]);
const tailY0 = Number(tail[2]);
const tailX1 = Number(tail[3]);
const tailY1 = Number(tail[4]);

const gaps = [];
for (let y = tailY0; y <= tailY1; y += 1) {
  const dy = y - cy;
  const inside = r * r - dy * dy;
  if (inside < 0) {
    gaps.push({ y, reason: 'tail_y_outside_circle_band' });
    continue;
  }
  const xRight = cx + Math.sqrt(inside);
  if (tailX0 > xRight + 0.5) {
    gaps.push({ y, tailX0, xRight: Number(xRight.toFixed(2)), gap: Number((tailX0 - xRight).toFixed(2)) });
  }
}

// L foot must abut tail (foot end ≈ tail start)
const foot = src.match(/d="M(\d+) (\d+) h(\d+) v(\d+) h(\d+) v(\d+)/);
if (foot) {
  const footEndX = Number(foot[1]) + Number(foot[3]) + Number(foot[5]);
  const overlap = footEndX - tailX0;
  if (overlap < 0 || overlap > 8) {
    console.error('FOOT_TAIL_MISALIGN', { footEndX, tailX0, overlap });
    process.exit(1);
  }
}

if (gaps.length) {
  console.error('GAP_FOUND', gaps.slice(0, 6));
  process.exit(1);
}
console.log('NO_GAP', { tailX0, tailY0, tailY1, tailX1 });
