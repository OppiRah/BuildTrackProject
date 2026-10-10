// A single compact cluster with fixed media sizes. Clearance is sampled once at
// layout measurement, then interpolated while scrolling; no per-frame packing.
export type MediaSize = { width: number; height: number };
type Point = { x: number; y: number };
const phases = [-176, -116, -55, 4, 64, 124];
const count = 120;
const radians = Math.PI / 180;
// Matched to the supplied screenshot's seven frame centres (old progress 0.71333).
export const audienceFinalAngle = 300.65;

export function createAudienceComposition(sizes: MediaSize[], belowTitleSpace = 0) {
  const centre = sizes[0]!;
  const gap = 0.025 * centre.width;
  const base = (turn: number): Point[] => sizes.map((size, i) => {
    if (!i) return { x: 0, y: 0 };
    const angle = (phases[i - 1]! + turn) * radians;
    const x = Math.cos(angle), y = Math.sin(angle);
    const halfWidth = (centre.width + size.width) / 2 + gap;
    const halfHeight = (centre.height + size.height) / 2 + gap;
    // Smooth rectangular contour: upright media stay close to the centre,
    // rather than following a large, empty ellipse.
    const radius = (Math.pow(x / halfWidth, 8) + Math.pow(y / halfHeight, 8)) ** (-1 / 8);
    return { x: x * radius * 1.12, y: y * radius * 0.85 };
  });
  const poses = Array.from({ length: count }, (_, sample) => {
    const turn = sample * 360 / count;
    const targets = base(turn), points = targets.map(p => ({ ...p }));
    // Relax centre positions only, at measurement time. Stable identity/order,
    // fixed media dimensions and smoothed poses avoid the former fill solver's
    // per-frame size/order switches. A small radial attraction keeps one cluster.
    for (let step = 0; step < 420; step++) {
      points.forEach((p, i) => {
        if (!i) return;
        p.x += (targets[i]!.x - p.x) * 0.008 - p.x * 0.002;
        p.y += (targets[i]!.y - p.y) * 0.008 - p.y * 0.002;
      });
      for (let i = 0; i < sizes.length; i++) for (let j = i + 1; j < sizes.length; j++) {
        const a = sizes[i]!, b = sizes[j]!, p = points[i]!, q = points[j]!;
        const dx = q.x - p.x, dy = q.y - p.y;
        const ox = (a.width + b.width) / 2 + gap - Math.abs(dx);
        const oy = (a.height + b.height) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // Prefer lateral clearance so the portrait cannot stretch the entire
        // cluster into a narrow tower. This happens once per measured layout.
        const axis = ox < oy * 1.6 ? 'x' : 'y';
        const shift = (axis === 'x' ? ox : oy) * 0.52 * Math.sign(axis === 'x' ? dx : dy);
        if (i) { p[axis] -= shift; q[axis] += shift; }
        else q[axis] += shift * 2;
      }
    }
    return points;
  });
  const at = (values: Point[][], i: number) => values[(i + count) % count]!;
  const smooth = poses.map((_, i) => sizes.map((_size, j) => {
    const point = { x: 0, y: 0 };
    for (let n = -3; n <= 3; n++) {
      const weight = (4 - Math.abs(n)) / 16;
      point.x += at(poses, i + n)[j]!.x * weight;
      point.y += at(poses, i + n)[j]!.y * weight;
    }
    return point;
  }));
  // Preserve the reference's identities/relative placement: engineering and
  // government above, inspection left, estate right, portrait/equipment below.
  // Align the paired rows while retaining each media's natural proportions.
  const final: Point[] = sizes.map(() => ({ x: 0, y: 0 }));
  final[2] = { x: -(centre.width + sizes[2]!.width) / 2 - gap, y: 0 };
  final[5] = { x: (centre.width + sizes[5]!.width) / 2 + gap, y: 0 };
  const topBottom = -sizes[2]!.height / 2 - gap;
  final[3] = { x: -(sizes[4]!.width + gap) / 2, y: topBottom - sizes[3]!.height / 2 };
  final[4] = { x: (sizes[3]!.width + gap) / 2, y: topBottom - sizes[4]!.height / 2 };
  const bottom = Math.max(sizes[2]!.height / 2, centre.height / 2 + belowTitleSpace)
    + gap + Math.max(sizes[1]!.height, sizes[6]!.height);
  final[1] = { x: -(sizes[6]!.width + gap) / 2, y: bottom - sizes[1]!.height / 2 };
  final[6] = { x: (sizes[1]!.width + gap) / 2, y: bottom - sizes[6]!.height / 2 };
  const endpoint = audienceFinalAngle * count / 360;
  const endpointIndex = Math.floor(endpoint), t = endpoint - endpointIndex;
  const originalEndpoint = sizes.map((_size, j) => {
    const result = { x: 0, y: 0 };
    for (const axis of ['x', 'y'] as const) {
      const a = at(smooth, endpointIndex - 1)[j]![axis], b = at(smooth, endpointIndex)[j]![axis];
      const c = at(smooth, endpointIndex + 1)[j]![axis], d = at(smooth, endpointIndex + 2)[j]![axis];
      result[axis] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    }
    return result;
  });
  const correction = final.map((point, j) => ({ x: point.x - originalEndpoint[j]!.x, y: point.y - originalEndpoint[j]!.y }));
  const positions = (turn: number): Point[] => {
    const phase = ((turn % 360) + 360) % 360 * count / 360;
    const i = Math.floor(phase), t = phase - i;
    const distance = Math.min(Math.abs(phase - endpoint), count - Math.abs(phase - endpoint));
    const p = Math.max(0, 1 - distance / 28);
    const weight = p * p * (3 - 2 * p);
    return sizes.map((_size, j) => {
      const result = { x: 0, y: 0 };
      for (const axis of ['x', 'y'] as const) {
        const a = at(smooth, i - 1)[j]![axis], b = at(smooth, i)[j]![axis];
        const c = at(smooth, i + 1)[j]![axis], d = at(smooth, i + 2)[j]![axis];
        result[axis] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
        result[axis] += correction[j]![axis] * weight;
      }
      return result;
    });
  };
  return positions;
}
