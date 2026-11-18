/**
 * penGeometry.js
 * 
 * Precise 2D computational geometry utilities for tablet pen input and eraser hit-testing.
 * Supports:
 * - Point-to-segment distance
 * - Segment-to-segment distance and intersection
 * - Continuous eraser drag path collision
 * - Partial stroke erasing with path splitting and fragment preservation
 */

/**
 * Calculates the shortest Euclidean distance from point P(px, py)
 * to line segment A(x1, y1) -> B(x2, y2).
 */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        const dpx = px - x1;
        const dpy = py - y1;
        return Math.sqrt(dpx * dpx + dpy * dpy);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);

    return Math.sqrt(distSq);
}

/**
 * Checks whether two 2D segments A1A2 and B1B2 intersect.
 */
export function segmentsIntersect(a1, a2, b1, b2) {
    function ccw(ax, ay, bx, by, cx, cy) {
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
    }

    return (
        ccw(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) !== ccw(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) &&
        ccw(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y) !== ccw(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)
    );
}

/**
 * Calculates the minimum distance between two line segments A1A2 and B1B2.
 * Returns 0 if the segments intersect.
 */
export function segmentDistance(a1, a2, b1, b2) {
    if (segmentsIntersect(a1, a2, b1, b2)) {
        return 0;
    }

    return Math.min(
        distanceToSegment(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y),
        distanceToSegment(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y),
        distanceToSegment(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y),
        distanceToSegment(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y)
    );
}

/**
 * Erases strokes crossed by an eraser path from e1 to e2 with radius eraserRadius.
 * Performs partial stroke splitting:
 * - Single-point dots inside the eraser zone are deleted.
 * - Multi-point strokes crossed by the eraser have the intersected points/segments removed,
 *   splitting surviving points into independent stroke fragments.
 * - Unrelated strokes outside the eraser radius are preserved unmodified.
 * 
 * @param {Array} strokeList - Array of stroke objects
 * @param {Object} e1 - Starting eraser point { x, y }
 * @param {Object} e2 - Ending eraser point { x, y }
 * @param {number} eraserRadius - Effective eraser collision radius in CSS pixels
 * @returns {Object} { changed: boolean, strokes: Array }
 */
export function eraseStrokesAlongPath(strokeList, e1, e2, eraserRadius = 14) {
    if (!Array.isArray(strokeList) || strokeList.length === 0) {
        return { changed: false, strokes: [] };
    }

    // Default e2 to e1 if stationary tap
    const pEnd = e2 || e1;
    let changed = false;
    const result = [];

    for (let sIdx = 0; sIdx < strokeList.length; sIdx++) {
        const stroke = strokeList[sIdx];
        const pts = stroke.points || [];

        if (pts.length === 0) {
            changed = true;
            continue; // Remove empty stroke
        }

        const strokeWidth = typeof stroke.width === 'number' ? stroke.width : 2;
        const threshold = eraserRadius + strokeWidth / 2;

        // 1. Single-point stroke (e.g. dot, period, i-dot)
        if (pts.length === 1) {
            const dist = distanceToSegment(pts[0].x, pts[0].y, e1.x, e1.y, pEnd.x, pEnd.y);
            if (dist <= threshold) {
                changed = true; // Dot erased
            } else {
                result.push(stroke);
            }
            continue;
        }

        // 2. Multi-point stroke: check point hits and segment cuts
        const hitPoints = new Array(pts.length).fill(false);
        const hitSegments = new Array(pts.length - 1).fill(false);
        let hasHit = false;

        for (let i = 0; i < pts.length; i++) {
            const dist = distanceToSegment(pts[i].x, pts[i].y, e1.x, e1.y, pEnd.x, pEnd.y);
            if (dist <= threshold) {
                hitPoints[i] = true;
                hasHit = true;
            }
        }

        for (let i = 0; i < pts.length - 1; i++) {
            const dist = segmentDistance(pts[i], pts[i + 1], e1, pEnd);
            if (dist <= threshold) {
                hitSegments[i] = true;
                hasHit = true;
            }
        }

        if (!hasHit) {
            result.push(stroke);
            continue;
        }

        changed = true;

        // 3. Split stroke into surviving fragments
        const fragments = [];
        let currentFragment = [];

        for (let i = 0; i < pts.length; i++) {
            if (!hitPoints[i]) {
                currentFragment.push(pts[i]);
            }

            // If outgoing segment from i was cut, close current fragment
            if (i < pts.length - 1 && hitSegments[i]) {
                if (currentFragment.length > 0) {
                    fragments.push(currentFragment);
                    currentFragment = [];
                }
            }
        }

        if (currentFragment.length > 0) {
            fragments.push(currentFragment);
        }

        // 4. Preserve surviving fragments with stable metadata
        for (let f = 0; f < fragments.length; f++) {
            const fragPoints = fragments[f];
            if (fragPoints.length > 0) {
                result.push({
                    ...stroke,
                    id: fragments.length === 1 && fragPoints.length === pts.length
                        ? stroke.id
                        : `${stroke.id}-frag-${f}-${sIdx}`,
                    points: fragPoints
                });
            }
        }
    }

    return { changed, strokes: result };
}

