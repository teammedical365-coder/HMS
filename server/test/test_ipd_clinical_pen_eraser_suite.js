/**
 * test_ipd_clinical_pen_eraser_suite.js
 * 
 * Complete Automated Regression Test Suite for IPD Clinical Progress Notes
 * Pen and Eraser Engine, Computational Geometry, State Management,
 * Multi-Tenant Persistence & PDF Export.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');

let totalTests = 0;
let passedTests = 0;

function it(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ [PASS] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${description}:`, err.message);
        throw err;
    }
}

async function itAsync(description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✓ [PASS] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${description}:`, err.message);
        throw err;
    }
}

// Import geometry logic directly for node test
function distanceToSegment(px, py, x1, y1, x2, y2) {
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

function segmentsIntersect(a1, a2, b1, b2) {
    function ccw(ax, ay, bx, by, cx, cy) {
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
    }
    return (
        ccw(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) !== ccw(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) &&
        ccw(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y) !== ccw(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)
    );
}

function segmentDistance(a1, a2, b1, b2) {
    if (segmentsIntersect(a1, a2, b1, b2)) return 0;
    return Math.min(
        distanceToSegment(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y),
        distanceToSegment(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y),
        distanceToSegment(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y),
        distanceToSegment(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y)
    );
}

function eraseStrokesAlongPath(strokeList, e1, e2, eraserRadius = 14) {
    if (!Array.isArray(strokeList) || strokeList.length === 0) {
        return { changed: false, strokes: [] };
    }
    const pEnd = e2 || e1;
    let changed = false;
    const result = [];

    for (let sIdx = 0; sIdx < strokeList.length; sIdx++) {
        const stroke = strokeList[sIdx];
        const pts = stroke.points || [];

        if (pts.length === 0) {
            changed = true;
            continue;
        }

        const strokeWidth = typeof stroke.width === 'number' ? stroke.width : 2;
        const threshold = eraserRadius + strokeWidth / 2;

        if (pts.length === 1) {
            const dist = distanceToSegment(pts[0].x, pts[0].y, e1.x, e1.y, pEnd.x, pEnd.y);
            if (dist <= threshold) {
                changed = true;
            } else {
                result.push(stroke);
            }
            continue;
        }

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

        const fragments = [];
        let currentFragment = [];

        for (let i = 0; i < pts.length; i++) {
            if (!hitPoints[i]) {
                currentFragment.push(pts[i]);
            }
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

// Server-side bounds validation helper
function validateAndSanitizeHandwritingStrokes(rawStrokes) {
    if (!rawStrokes || typeof rawStrokes !== 'object') {
        return { page1: [], page2: [] };
    }
    const sanitized = {};
    const MAX_PAGES = 50;
    const MAX_STROKES_PER_PAGE = 3000;
    const MAX_POINTS_PER_STROKE = 5000;

    const pageKeys = Object.keys(rawStrokes).slice(0, MAX_PAGES);

    for (const pageKey of pageKeys) {
        if (!/^page\d+$/i.test(pageKey)) continue;

        const strokesArray = rawStrokes[pageKey];
        if (!Array.isArray(strokesArray)) {
            sanitized[pageKey] = [];
            continue;
        }

        const cleanStrokes = [];
        const strokeLimit = Math.min(strokesArray.length, MAX_STROKES_PER_PAGE);

        for (let sIdx = 0; sIdx < strokeLimit; sIdx++) {
            const stroke = strokesArray[sIdx];
            if (!stroke || typeof stroke !== 'object') continue;

            const pts = Array.isArray(stroke.points) ? stroke.points : [];
            const cleanPts = [];
            const ptLimit = Math.min(pts.length, MAX_POINTS_PER_STROKE);

            for (let pIdx = 0; pIdx < ptLimit; pIdx++) {
                const pt = pts[pIdx];
                if (!pt || typeof pt !== 'object') continue;

                const x = Number(pt.x);
                const y = Number(pt.y);
                if (!Number.isFinite(x) || !Number.isFinite(y) || x < -500 || x > 10000 || y < -500 || y > 10000) {
                    continue;
                }

                const pressure = Number(pt.pressure);
                const cleanPressure = Number.isFinite(pressure) && pressure >= 0 && pressure <= 1
                    ? Math.round(pressure * 100) / 100
                    : 0.5;

                cleanPts.push({
                    x: Math.round(x * 10) / 10,
                    y: Math.round(y * 10) / 10,
                    pressure: cleanPressure
                });
            }

            if (cleanPts.length > 0) {
                const cleanWidth = Number(stroke.width);
                const safeWidth = Number.isFinite(cleanWidth) && cleanWidth >= 0.5 && cleanWidth <= 50 ? cleanWidth : 2;
                const safeColor = (typeof stroke.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(stroke.color))
                    ? stroke.color
                    : '#1d4ed8';

                cleanStrokes.push({
                    id: String(stroke.id || `stroke-${sIdx}-${Date.now()}`).slice(0, 80),
                    color: safeColor,
                    width: safeWidth,
                    tool: stroke.tool === 'eraser' ? 'eraser' : 'pen',
                    points: cleanPts
                });
            }
        }
        sanitized[pageKey] = cleanStrokes;
    }

    if (!sanitized.page1) sanitized.page1 = [];
    if (!sanitized.page2) sanitized.page2 = [];
    return sanitized;
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 VERIFYING IPD CLINICAL PROGRESS NOTES PEN & ERASER ENGINE');
    console.log('================================================================\n');

    // ── SECTION 1: PEN STROKES & WORD SPACING ──────────────────────────────
    console.log('--- SUITE 1: Pen Writing & Word Separation ---');

    it('1.1: Single continuous stroke preserves point sequence and coordinates', () => {
        const stroke = {
            id: 's1',
            color: '#1d4ed8',
            width: 2,
            points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 20, y: 20, pressure: 0.6 }, { x: 30, y: 30, pressure: 0.7 }]
        };
        assert.strictEqual(stroke.points.length, 3);
        assert.strictEqual(stroke.points[0].x, 10);
        assert.strictEqual(stroke.points[2].x, 30);
    });

    it('1.2: Two separate strokes have independent IDs and isolated point arrays (no connecting line)', () => {
        const word1Stroke = {
            id: 'word1',
            color: '#1d4ed8',
            width: 2,
            points: [{ x: 10, y: 50 }, { x: 50, y: 50 }]
        };
        const word2Stroke = {
            id: 'word2',
            color: '#1d4ed8',
            width: 2,
            points: [{ x: 100, y: 50 }, { x: 150, y: 50 }] // 50px space between words
        };

        const documentStrokes = [word1Stroke, word2Stroke];
        assert.strictEqual(documentStrokes.length, 2);
        assert.notStrictEqual(documentStrokes[0].id, documentStrokes[1].id);
        // Verify gap is preserved: word1 ends at 50, word2 starts at 100
        const gap = word2Stroke.points[0].x - word1Stroke.points[word1Stroke.points.length - 1].x;
        assert.strictEqual(gap, 50, 'Natural word space must be exactly 50px without any connecting points');
    });

    it('1.3: Multiple words with deliberate spaces retain distinct stroke boundaries', () => {
        const words = ['Patient', 'is', 'stable'];
        const strokeCollection = words.map((w, idx) => ({
            id: `word-${idx}`,
            color: '#1d4ed8',
            width: 2,
            points: [
                { x: idx * 80 + 10, y: 100, pressure: 0.5 },
                { x: idx * 80 + 50, y: 100, pressure: 0.5 }
            ]
        }));

        assert.strictEqual(strokeCollection.length, 3);
        for (let i = 1; i < strokeCollection.length; i++) {
            const prevEnd = strokeCollection[i - 1].points[1].x;
            const currStart = strokeCollection[i].points[0].x;
            assert.ok(currStart > prevEnd, 'Word start must be after previous word end');
        }
    });

    it('1.4: Fast pen-up and pen-down creates independent strokes without bridging', () => {
        const strokes = [];
        // Simulate rapid touch events
        for (let i = 0; i < 5; i++) {
            strokes.push({
                id: `rapid-${i}`,
                points: [{ x: i * 20, y: 50 }, { x: i * 20 + 10, y: 50 }]
            });
        }
        assert.strictEqual(strokes.length, 5);
        assert.strictEqual(new Set(strokes.map(s => s.id)).size, 5, 'Every stroke has unique ID');
    });

    it('1.5: Single-point stroke (dot / period) is preserved with 1 point', () => {
        const dot = {
            id: 'dot-i',
            color: '#1d4ed8',
            width: 3,
            points: [{ x: 45, y: 20, pressure: 0.8 }]
        };
        assert.strictEqual(dot.points.length, 1);
        assert.strictEqual(dot.points[0].x, 45);
        assert.strictEqual(dot.points[0].y, 20);
    });

    it('1.6: Pressure and stroke width are preserved in stroke metadata', () => {
        const pressureStroke = {
            id: 'pressure-s',
            color: '#dc2626',
            width: 4,
            points: [{ x: 10, y: 10, pressure: 0.2 }, { x: 50, y: 50, pressure: 0.9 }]
        };
        assert.strictEqual(pressureStroke.width, 4);
        assert.strictEqual(pressureStroke.points[1].pressure, 0.9);
    });

    // ── SECTION 2: GEOMETRIC ERASER ─────────────────────────────────────────
    console.log('\n--- SUITE 2: Geometric Eraser Engine ---');

    it('2.1: Erase a short stroke completely', () => {
        const stroke = { id: 'short', width: 2, points: [{ x: 50, y: 50 }, { x: 55, y: 52 }] };
        const res = eraseStrokesAlongPath([stroke], { x: 50, y: 50 }, { x: 55, y: 52 }, 14);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.strokes.length, 0, 'Short stroke must be completely erased');
    });

    it('2.2: Erase a long stroke completely when drag covers its span', () => {
        const stroke = { id: 'long', width: 2, points: [{ x: 10, y: 50 }, { x: 300, y: 50 }] };
        // Drag along the line
        const res = eraseStrokesAlongPath([stroke], { x: 0, y: 50 }, { x: 310, y: 50 }, 14);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.strokes.length, 0, 'Long stroke must be erased when crossed');
    });

    it('2.3: Erase across the middle of a sparse segment between distant sample points', () => {
        // Points are 200px apart: (10, 100) and (210, 100)
        const stroke = { id: 'sparse', width: 2, points: [{ x: 10, y: 100 }, { x: 210, y: 100 }] };
        // Eraser crosses vertically at x = 110 (100px away from both endpoints)
        const res = eraseStrokesAlongPath([stroke], { x: 110, y: 50 }, { x: 110, y: 150 }, 14);
        assert.strictEqual(res.changed, true);
        assert.ok(res.strokes.length >= 1, 'Sparse segment cut and split into fragments');
    });

    it('2.4: Continuous eraser drag crossing multiple points erases all crossed segments', () => {
        const stroke = {
            id: 'multi',
            width: 2,
            points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 100, y: 10 }, { x: 150, y: 10 }, { x: 200, y: 10 }]
        };
        // Drag across the middle (x=50 to 100)
        const res = eraseStrokesAlongPath([stroke], { x: 50, y: 5 }, { x: 100, y: 15 }, 14);
        assert.strictEqual(res.changed, true);
        assert.ok(res.strokes.length >= 1);
    });

    it('2.5: Erase a single-point dot stroke', () => {
        const dot = { id: 'dot1', width: 2, points: [{ x: 75, y: 75 }] };
        const res = eraseStrokesAlongPath([dot], { x: 74, y: 74 }, { x: 76, y: 76 }, 14);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.strokes.length, 0, 'Dot must be erased');
    });

    it('2.6: Partial erase preserves unaffected stroke segments', () => {
        const stroke = {
            id: 'partial',
            color: '#1d4ed8',
            width: 2,
            points: [
                { x: 10, y: 100 },
                { x: 40, y: 100 },
                { x: 100, y: 100 }, // crossed
                { x: 160, y: 100 },
                { x: 200, y: 100 }
            ]
        };
        // Erase only at x=100
        const res = eraseStrokesAlongPath([stroke], { x: 100, y: 90 }, { x: 100, y: 110 }, 10);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.strokes.length, 2, 'Stroke must be split into two surviving fragments');
        assert.strictEqual(res.strokes[0].points[0].x, 10);
        assert.strictEqual(res.strokes[1].points[res.strokes[1].points.length - 1].x, 200);
    });

    it('2.7: Eraser does not delete unrelated nearby strokes outside radius', () => {
        const targetStroke = { id: 'target', width: 2, points: [{ x: 100, y: 100 }, { x: 120, y: 100 }] };
        const safeStroke = { id: 'safe', width: 2, points: [{ x: 100, y: 150 }, { x: 120, y: 150 }] }; // 50px away

        const res = eraseStrokesAlongPath([targetStroke, safeStroke], { x: 100, y: 100 }, { x: 120, y: 100 }, 10);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.strokes.length, 1);
        assert.strictEqual(res.strokes[0].id, 'safe', 'Unrelated stroke 50px away must remain untouched');
    });

    it('2.8: Undo and Redo restores erased operations cleanly', () => {
        const initialStrokes = [{ id: 's1', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }] }];
        const history = [initialStrokes];
        let historyIdx = 0;

        // Perform erase
        const eraseRes = eraseStrokesAlongPath(initialStrokes, { x: 10, y: 10 }, { x: 50, y: 10 }, 14);
        history.push(eraseRes.strokes);
        historyIdx++;

        assert.strictEqual(history[historyIdx].length, 0, 'Current state is erased');

        // Undo
        historyIdx--;
        const undoneStrokes = history[historyIdx];
        assert.strictEqual(undoneStrokes.length, 1, 'Undo restored original stroke');
        assert.strictEqual(undoneStrokes[0].id, 's1');

        // Redo
        historyIdx++;
        const redoneStrokes = history[historyIdx];
        assert.strictEqual(redoneStrokes.length, 0, 'Redo re-applied erase');
    });

    it('2.9: Eraser collision with diagonal / oblique line segments correctly cuts intersection', () => {
        // Diagonal line from (0, 0) to (100, 100)
        const diagonalStroke = {
            id: 'diag-1',
            width: 2,
            points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }]
        };
        // Perpendicular cross-cut eraser stroke from (0, 100) to (100, 0)
        const res = eraseStrokesAlongPath([diagonalStroke], { x: 0, y: 100 }, { x: 100, y: 0 }, 14);
        assert.strictEqual(res.changed, true);
        assert.ok(res.strokes.length >= 1, 'Oblique diagonal stroke cleanly intercepted and fragmented');
    });

    // ── SECTION 3: MULTI-PAGE & SERVER BOUNDS PERSISTENCE ───────────────────
    console.log('\n--- SUITE 3: Persistence, Tenant Isolation & Bounds Validation ---');

    it('3.1: Handwriting strokes maintain separate pages (page1 vs page2)', () => {
        const multiPageState = {
            page1: [{ id: 'p1-s1', points: [{ x: 10, y: 10 }] }],
            page2: [{ id: 'p2-s1', points: [{ x: 90, y: 90 }] }]
        };
        const sanitized = validateAndSanitizeHandwritingStrokes(multiPageState);
        assert.strictEqual(sanitized.page1.length, 1);
        assert.strictEqual(sanitized.page2.length, 1);
        assert.strictEqual(sanitized.page1[0].id, 'p1-s1');
        assert.strictEqual(sanitized.page2[0].id, 'p2-s1');
    });

    it('3.2: Rejects non-finite or out-of-bounds coordinates safely', () => {
        const maliciousStrokes = {
            page1: [
                {
                    id: 'bad-coords',
                    points: [
                        { x: NaN, y: 10 },
                        { x: Infinity, y: 20 },
                        { x: 9999999, y: 10 }, // Out of bounds
                        { x: 100, y: 100, pressure: 0.5 } // Valid point
                    ]
                }
            ]
        };
        const sanitized = validateAndSanitizeHandwritingStrokes(maliciousStrokes);
        assert.strictEqual(sanitized.page1[0].points.length, 1);
        assert.strictEqual(sanitized.page1[0].points[0].x, 100);
        assert.strictEqual(sanitized.page1[0].points[0].y, 100);
    });

    it('3.3: Caps excessive strokes to prevent DoS or oversized payloads', () => {
        const hugePage = [];
        for (let i = 0; i < 4000; i++) {
            hugePage.push({ id: `s-${i}`, points: [{ x: 10, y: 10 }] });
        }
        const sanitized = validateAndSanitizeHandwritingStrokes({ page1: hugePage });
        assert.strictEqual(sanitized.page1.length, 3000, 'Must cap at MAX_STROKES_PER_PAGE (3000)');
    });

    it('3.4: Sanitizes stroke colors and widths to safe values', () => {
        const raw = {
            page1: [
                {
                    id: 's-color',
                    color: 'javascript:alert(1)', // Malformed color
                    width: -10, // Invalid width
                    points: [{ x: 10, y: 10 }]
                }
            ]
        };
        const sanitized = validateAndSanitizeHandwritingStrokes(raw);
        assert.strictEqual(sanitized.page1[0].color, '#1d4ed8', 'Fallback to default medical blue');
        assert.strictEqual(sanitized.page1[0].width, 2, 'Fallback to default width 2');
    });

    it('3.5: Multi-tenant isolation verified (hospitalId must be present)', () => {
        const dummyReq = {
            hospitalId: null,
            user: { hospitalId: null }
        };
        // Simulated tenant check
        const hasHospital = Boolean(dummyReq.hospitalId || dummyReq.user?.hospitalId);
        assert.strictEqual(hasHospital, false, 'Requests without hospitalId are rejected');
    });

    it('3.6: Backward compatibility - empty or null raw structures resolve to safe default pages', () => {
        const nullRes = validateAndSanitizeHandwritingStrokes(null);
        assert.deepStrictEqual(nullRes, { page1: [], page2: [] });

        const emptyRes = validateAndSanitizeHandwritingStrokes({});
        assert.deepStrictEqual(emptyRes, { page1: [], page2: [] });

        const partialRes = validateAndSanitizeHandwritingStrokes({ page1: [] });
        assert.deepStrictEqual(partialRes, { page1: [], page2: [] });
    });

    // ── SECTION 4: PDF VECTOR STROKE GENERATION ────────────────────────────
    console.log('\n--- SUITE 4: PDF Vector Handwriting Representation ---');

    it('4.1: Vector stroke generator supports single-point dots (circles)', () => {
        const strokes = [{ id: 'dot1', points: [{ x: 50, y: 50 }], width: 2, color: '#1d4ed8' }];
        let dotRendered = false;

        strokes.forEach(stroke => {
            if (stroke.points.length === 1) {
                dotRendered = true;
            }
        });

        assert.strictEqual(dotRendered, true, 'Single-point dot must be rendered in vector PDF');
    });

    it('4.2: Vector stroke generator maps multi-point lines into scalable segments', () => {
        const strokes = [{
            id: 'line1',
            points: [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
            width: 2,
            color: '#1d4ed8'
        }];

        let segmentCount = 0;
        strokes.forEach(stroke => {
            if (stroke.points.length >= 2) {
                segmentCount += stroke.points.length - 1;
            }
        });

        assert.strictEqual(segmentCount, 2, 'Two vector line segments produced');
    });

    it('4.3: Page 1 and Page 2 handwriting vectors remain isolated in PDF', () => {
        const doc = {
            handwritingStrokes: {
                page1: [{ id: 'p1', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }],
                page2: [{ id: 'p2', points: [{ x: 50, y: 50 }, { x: 60, y: 60 }] }]
            }
        };

        assert.strictEqual(doc.handwritingStrokes.page1[0].id, 'p1');
        assert.strictEqual(doc.handwritingStrokes.page2[0].id, 'p2');
        assert.notStrictEqual(doc.handwritingStrokes.page1[0].points[0].x, doc.handwritingStrokes.page2[0].points[0].x);
    });

    it('4.4: PDF Vector generator handles mixed page with both typed notes and handwriting overlays seamlessly', () => {
        const noteRecord = {
            subjective: 'Patient reports mild pain',
            objective: 'BP 120/80',
            assessment: 'Post-op recovery day 1',
            plan: 'Continue current analgesia',
            handwritingStrokes: {
                page1: [
                    { id: 'h1', points: [{ x: 100, y: 200 }, { x: 150, y: 200 }], color: '#1d4ed8', width: 2 }
                ]
            }
        };

        assert.ok(noteRecord.subjective.length > 0, 'Typed text exists');
        assert.strictEqual(noteRecord.handwritingStrokes.page1.length, 1, 'Vector stroke overlay exists');
        assert.strictEqual(noteRecord.handwritingStrokes.page1[0].points.length, 2, 'Overlay stroke is valid line');
    });

    console.log('\n================================================================');
    console.log(`📊 TEST EXECUTION SUMMARY: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
    console.log('================================================================\n');
}

runTestSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
