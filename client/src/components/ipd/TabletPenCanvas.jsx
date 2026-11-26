import React, { useRef, useEffect, useCallback } from 'react';
import { eraseStrokesAlongPath } from './penGeometry';

function cloneStrokeList(list) {
    if (!Array.isArray(list)) return [];
    return list.map((s) => ({
        ...s,
        points: Array.isArray(s.points) ? s.points.map((pt) => ({ ...pt })) : []
    }));
}

const TabletPenCanvas = ({
    pageKey,
    strokes = [],
    activeTool = 'type', // 'type' | 'pen' | 'eraser'
    penColor = '#1d4ed8', // Default Medical Blue
    penWidth = 2.5, // Default Medium (2.5px)
    zoom = 1,
    penSessionRef = null,
    onSaveStrokes
}) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const eraserCursorRef = useRef(null);

    // Synchronous state refs to prevent race conditions & stale React closures
    const strokesRef = useRef(strokes);
    const onSaveStrokesRef = useRef(onSaveStrokes);
    const activeToolRef = useRef(activeTool);
    const penColorRef = useRef(penColor);
    const penWidthRef = useRef(penWidth);
    const zoomRef = useRef(zoom);

    const isDrawingRef = useRef(false);
    const activePointerIdRef = useRef(null);
    const activePointerTypeRef = useRef(null);
    const currentStrokeRef = useRef(null);
    const preEraseSnapshotRef = useRef(null);
    const lastEraserPointRef = useRef(null);
    const eraserModifiedRef = useRef(false);
    const dprRef = useRef(1);
    const processedEventsRef = useRef(new WeakSet());
    const windowListenersCleanupRef = useRef(null);

    onSaveStrokesRef.current = onSaveStrokes;
    activeToolRef.current = activeTool;
    penColorRef.current = penColor;
    penWidthRef.current = penWidth;
    zoomRef.current = zoom;

    // Keep strokesRef in sync with incoming strokes prop (including Undo / Redo updates)
    useEffect(() => {
        strokesRef.current = strokes;
    }, [strokes]);

    // Imperatively update dark-grey (#555555) eraser boundary indicator without React re-renders
    const updateEraserCursor = useCallback((coords, visible, isPressing = false) => {
        const el = eraserCursorRef.current;
        if (!el) return;

        if (!visible || activeToolRef.current !== 'eraser' || !coords) {
            el.style.opacity = '0';
            return;
        }

        const radius = Math.max(14, (penWidthRef.current || 2.5) * 4);
        const diameter = radius * 2;

        el.style.width = `${diameter}px`;
        el.style.height = `${diameter}px`;
        el.style.transform = `translate3d(${coords.x - radius}px, ${coords.y - radius}px, 0)`;
        el.style.backgroundColor = isPressing ? 'rgba(85, 85, 85, 0.26)' : 'rgba(85, 85, 85, 0.12)';
        el.style.borderColor = '#555555';
        el.style.opacity = '1';
    }, []);

    // Hide eraser indicator immediately when switching out of eraser mode
    useEffect(() => {
        if (activeTool !== 'eraser') {
            updateEraserCursor(null, false, false);
        }
    }, [activeTool, updateEraserCursor]);

    // Redraw all strokes on canvas with DPR scaling (untouched stylus rendering quality)
    const renderAllStrokes = useCallback((strokeList) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = dprRef.current || window.devicePixelRatio || 1;
        const logicalWidth = container.offsetWidth || 794;
        const logicalHeight = container.offsetHeight || 1123;

        // Use setTransform to avoid accumulating scale
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        const listToRender = strokeList !== undefined ? strokeList : strokesRef.current;
        if (!Array.isArray(listToRender)) return;

        listToRender.forEach((stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;

            ctx.save();
            ctx.strokeStyle = stroke.color || '#1d4ed8';
            ctx.fillStyle = stroke.color || '#1d4ed8';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Support single-point strokes (e.g. dots, periods, i-dots)
            if (stroke.points.length === 1) {
                const pt = stroke.points[0];
                const radius = Math.max(1, ((stroke.width || 2.5) / 2) * (0.6 + (pt.pressure || 0.5) * 0.8));
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return;
            }

            // Draw multi-point continuous stroke
            for (let i = 1; i < stroke.points.length; i++) {
                const prev = stroke.points[i - 1];
                const curr = stroke.points[i];
                const avgPressure = ((prev.pressure || 0.5) + (curr.pressure || 0.5)) / 2;
                const dynamicWidth = (stroke.width || 2.5) * (0.6 + avgPressure * 0.8);

                ctx.lineWidth = dynamicWidth;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }
            ctx.restore();
        });
    }, []);

    // Resize canvas to match parent DOM node with Retina/HiDPI scaling & Zoom normalization
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const updateCanvasSize = () => {
            const logicalWidth = container.offsetWidth || 794;
            const logicalHeight = container.offsetHeight || 1123;
            if (logicalWidth === 0 || logicalHeight === 0) return;

            const dpr = window.devicePixelRatio || 1;
            dprRef.current = dpr;

            // Physical pixel buffer scaled by DPR to keep lines razor sharp
            const targetW = Math.round(logicalWidth * dpr);
            const targetH = Math.round(logicalHeight * dpr);
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }

            // CSS display size matches container 100% to avoid double-scaling under CSS zoom
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            renderAllStrokes(strokesRef.current);
        };

        updateCanvasSize();
        const ro = new ResizeObserver(updateCanvasSize);
        ro.observe(container);

        return () => ro.disconnect();
    }, [renderAllStrokes]);

    // Redraw whenever strokes change externally (including Undo & Redo)
    useEffect(() => {
        renderAllStrokes(strokes);
    }, [strokes, renderAllStrokes]);

    // Logical sheet coordinates extraction normalized across all CSS transform scale / zoom levels
    const getCanvasCoordinates = (e, customRect = null) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

        const rect = customRect || canvas.getBoundingClientRect();
        const logicalWidth = container?.offsetWidth || canvas.offsetWidth || 794;
        const logicalHeight = container?.offsetHeight || canvas.offsetHeight || 1123;

        const currentZoom = zoomRef.current || 1;
        const effectiveWidth = rect.width > 0 ? rect.width : logicalWidth * currentZoom;
        const effectiveHeight = rect.height > 0 ? rect.height : logicalHeight * currentZoom;
        const scaleX = effectiveWidth > 0 ? (logicalWidth / effectiveWidth) : 1;
        const scaleY = effectiveHeight > 0 ? (logicalHeight / effectiveHeight) : 1;

        const rawX = (e.clientX - rect.left) * scaleX;
        const rawY = (e.clientY - rect.top) * scaleY;
        const clampedX = Math.max(0, Math.min(logicalWidth, Number.isFinite(rawX) ? rawX : 0));
        const clampedY = Math.max(0, Math.min(logicalHeight, Number.isFinite(rawY) ? rawY : 0));
        const pressure = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5;

        return {
            x: Math.round(clampedX * 10) / 10,
            y: Math.round(clampedY * 10) / 10,
            pressure
        };
    };

    const detachWindowTracking = useCallback(() => {
        if (typeof windowListenersCleanupRef.current === 'function') {
            windowListenersCleanupRef.current();
            windowListenersCleanupRef.current = null;
        }
    }, []);

    // Clean up any active pointer session if component unmounts
    useEffect(() => {
        return () => {
            detachWindowTracking();
            if (penSessionRef?.current && activePointerTypeRef.current === 'pen') {
                penSessionRef.current.isPenDown = false;
            }
        };
    }, [detachWindowTracking, penSessionRef]);

    // Core pointer move processor (shared between canvas element and window capture fallback)
    const processActivePointerMove = useCallback((e) => {
        const pType = e.pointerType || 'mouse';
        if (pType === 'pen' && penSessionRef?.current) {
            penSessionRef.current.lastPenHoverTime = performance.now();
        }

        const rawEvt = e.nativeEvent || e;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Show dark-grey eraser hover preview when hovering with stylus or mouse
        if (!isDrawingRef.current) {
            if (activeToolRef.current === 'eraser' && (pType === 'pen' || pType === 'mouse')) {
                const hoverCoords = getCanvasCoordinates(e);
                updateEraserCursor(hoverCoords, true, false);
            }
            return;
        }

        // PALM REJECTION: Strictly ignore any pointer other than the locked active stylus/mouse pointer
        if (activePointerIdRef.current !== e.pointerId) {
            return;
        }

        // Prevent duplicate processing if both element & window listeners receive the same event
        if (rawEvt && typeof rawEvt === 'object') {
            if (processedEventsRef.current.has(rawEvt)) return;
            processedEventsRef.current.add(rawEvt);
        }

        if (e.cancelable) e.preventDefault();

        if (pType === 'pen' && penSessionRef?.current) {
            penSessionRef.current.lastPenTime = performance.now();
        }

        // Cache rect once per pointermove event to eliminate layout thrashing
        const rect = canvas.getBoundingClientRect();

        // Consume high-frequency coalesced events if available from stylus/Apple Pencil/S-Pen/Wacom
        const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
        const eventList = coalesced && coalesced.length > 0 ? coalesced : [e];

        if (activeToolRef.current === 'eraser') {
            const eraserRadius = Math.max(14, (penWidthRef.current || 2.5) * 4);
            let anyChange = false;
            let latestPt = null;

            for (let i = 0; i < eventList.length; i++) {
                const pt = getCanvasCoordinates(eventList[i], rect);
                latestPt = pt;
                const prev = lastEraserPointRef.current || pt;
                const res = eraseStrokesAlongPath(strokesRef.current, prev, pt, eraserRadius);
                if (res.changed) {
                    strokesRef.current = res.strokes;
                    anyChange = true;
                    eraserModifiedRef.current = true;
                }
                lastEraserPointRef.current = pt;
            }

            if (latestPt) {
                updateEraserCursor(latestPt, true, true);
            }
            if (anyChange) {
                renderAllStrokes(strokesRef.current);
            }
            return;
        }

        // PEN TOOL: Draw incremental line segments (exact zero-latency stylus pipeline)
        const curStroke = currentStrokeRef.current;
        if (!curStroke) return;

        const ctx = canvas.getContext('2d');
        const dpr = dprRef.current || window.devicePixelRatio || 1;

        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.strokeStyle = curStroke.color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }

        for (let i = 0; i < eventList.length; i++) {
            const coords = getCanvasCoordinates(eventList[i], rect);
            const prevPoint = curStroke.points[curStroke.points.length - 1];

            // Prevent adding identical redundant coordinates
            if (prevPoint && prevPoint.x === coords.x && prevPoint.y === coords.y) {
                continue;
            }

            curStroke.points.push(coords);

            if (ctx && prevPoint) {
                const avgPressure = (prevPoint.pressure + coords.pressure) / 2;
                ctx.lineWidth = curStroke.width * (0.6 + avgPressure * 0.8);
                ctx.beginPath();
                ctx.moveTo(prevPoint.x, prevPoint.y);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            }
        }

        if (ctx) {
            ctx.restore();
        }
    }, [penSessionRef, renderAllStrokes, updateEraserCursor]);

    // Finalize or cancel the active pointer session cleanly
    const finalizeActivePointer = useCallback((ptrId, isCancelled = false, e = null) => {
        if (activePointerIdRef.current === null || ptrId !== activePointerIdRef.current) {
            return;
        }

        detachWindowTracking();

        const canvas = canvasRef.current;
        if (canvas && typeof canvas.hasPointerCapture === 'function' && ptrId !== null) {
            try {
                if (canvas.hasPointerCapture(ptrId)) {
                    canvas.releasePointerCapture(ptrId);
                }
            } catch (_) {}
        }

        const wasDrawing = isDrawingRef.current;
        const endedType = activePointerTypeRef.current;

        isDrawingRef.current = false;
        activePointerIdRef.current = null;
        activePointerTypeRef.current = null;

        if (endedType === 'pen' && penSessionRef?.current) {
            penSessionRef.current.isPenDown = false;
            penSessionRef.current.lastPenTime = performance.now();
        }

        if (!wasDrawing) return;

        const tool = activeToolRef.current;

        if (tool === 'pen') {
            const finishedStroke = currentStrokeRef.current;
            currentStrokeRef.current = null;

            // Do not commit cancelled/aborted incomplete gestures as history entries
            if (isCancelled) {
                renderAllStrokes(strokesRef.current);
                return;
            }

            if (finishedStroke && finishedStroke.points.length >= 1) {
                const updatedStrokes = cloneStrokeList([...strokesRef.current, finishedStroke]);
                strokesRef.current = updatedStrokes;
                if (typeof onSaveStrokesRef.current === 'function') {
                    onSaveStrokesRef.current(updatedStrokes);
                }
            }
        } else if (tool === 'eraser') {
            lastEraserPointRef.current = null;
            if (e && (endedType === 'pen' || endedType === 'mouse')) {
                updateEraserCursor(getCanvasCoordinates(e), true, false);
            } else {
                updateEraserCursor(null, false, false);
            }

            if (isCancelled) {
                if (preEraseSnapshotRef.current) {
                    strokesRef.current = preEraseSnapshotRef.current;
                    renderAllStrokes(strokesRef.current);
                }
                preEraseSnapshotRef.current = null;
                eraserModifiedRef.current = false;
                return;
            }

            preEraseSnapshotRef.current = null;
            if (eraserModifiedRef.current) {
                eraserModifiedRef.current = false;
                const committed = cloneStrokeList(strokesRef.current);
                strokesRef.current = committed;
                if (typeof onSaveStrokesRef.current === 'function') {
                    onSaveStrokesRef.current(committed);
                }
            }
        }
    }, [detachWindowTracking, penSessionRef, renderAllStrokes, updateEraserCursor]);

    // POINTER DOWN: Stylus-priority input handling & palm rejection
    const handlePointerDown = (e) => {
        const tool = activeToolRef.current;
        if (tool === 'type') return;

        const rawEvt = e.nativeEvent || e;
        if (rawEvt && typeof rawEvt === 'object') {
            if (processedEventsRef.current.has(rawEvt)) return;
            processedEventsRef.current.add(rawEvt);
        }

        const pType = e.pointerType || 'mouse';

        // 1. PALM REJECTION & FINGER SCROLL SEPARATION:
        //    - Finger/palm touches (pointerType === "touch") NEVER interrupt an active stylus stroke,
        //      NEVER overwrite activePointerIdRef, and NEVER create stray strokes/erasures while scrolling or pinching.
        if (pType === 'touch') {
            return;
        }

        // Ignore secondary/context mouse buttons
        if (pType === 'mouse' && typeof e.button === 'number' && e.button !== 0) {
            return;
        }

        if (e.cancelable) e.preventDefault();

        // Clear any native browser selection to prevent drag artifacts during stylus drawing
        try {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel && sel.removeAllRanges) sel.removeAllRanges();
            }
        } catch (_) {}

        // If a previous pointer was somehow left open, close it cleanly first
        if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
            finalizeActivePointer(activePointerIdRef.current, false);
        }

        activePointerIdRef.current = e.pointerId;
        activePointerTypeRef.current = pType;
        isDrawingRef.current = true;

        if (pType === 'pen' && penSessionRef?.current) {
            penSessionRef.current.isPenDown = true;
            penSessionRef.current.lastPenTime = performance.now();
            penSessionRef.current.lastPenHoverTime = performance.now();
        }

        const canvas = canvasRef.current;
        if (canvas && typeof canvas.setPointerCapture === 'function') {
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
        }

        // Attach window-level fallback listeners so even if a palm touch causes a tablet browser
        // to drop element pointer capture mid-stroke, the stylus stroke continues uninterrupted
        detachWindowTracking();
        const lockedId = e.pointerId;
        const onWinMove = (winEvt) => {
            if (winEvt.pointerId === lockedId) processActivePointerMove(winEvt);
        };
        const onWinUp = (winEvt) => {
            if (winEvt.pointerId === lockedId) finalizeActivePointer(lockedId, false, winEvt);
        };
        const onWinCancel = (winEvt) => {
            if (winEvt.pointerId === lockedId) finalizeActivePointer(lockedId, true, winEvt);
        };
        window.addEventListener('pointermove', onWinMove, { passive: false });
        window.addEventListener('pointerup', onWinUp, true);
        window.addEventListener('pointercancel', onWinCancel, true);
        windowListenersCleanupRef.current = () => {
            window.removeEventListener('pointermove', onWinMove);
            window.removeEventListener('pointerup', onWinUp, true);
            window.removeEventListener('pointercancel', onWinCancel, true);
        };

        const rect = canvas ? canvas.getBoundingClientRect() : null;
        const coords = getCanvasCoordinates(e, rect);

        if (tool === 'eraser') {
            preEraseSnapshotRef.current = cloneStrokeList(strokesRef.current);
            lastEraserPointRef.current = coords;
            eraserModifiedRef.current = false;
            updateEraserCursor(coords, true, true);

            const eraserRadius = Math.max(14, (penWidthRef.current || 2.5) * 4);
            const eraseResult = eraseStrokesAlongPath(strokesRef.current, coords, coords, eraserRadius);
            if (eraseResult.changed) {
                strokesRef.current = eraseResult.strokes;
                eraserModifiedRef.current = true;
                renderAllStrokes(eraseResult.strokes);
            }
            return;
        }

        // PEN TOOL: Begin brand new stroke with isolated points array
        const container = containerRef.current;
        const logicalWidth = container?.offsetWidth || 794;
        const logicalHeight = container?.offsetHeight || 1123;
        const activeWidth = penWidthRef.current || 2.5;
        const activeColor = penColorRef.current || '#1d4ed8';

        const newStroke = {
            id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            color: activeColor,
            width: activeWidth,
            tool: 'pen',
            canvasWidth: logicalWidth,
            canvasHeight: logicalHeight,
            points: [coords]
        };
        currentStrokeRef.current = newStroke;

        // Draw initial point/dot immediately for crisp visual responsiveness
        const ctx = canvas?.getContext('2d');
        if (ctx) {
            const dpr = dprRef.current || window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.fillStyle = activeColor;
            const dotRadius = Math.max(1, (activeWidth / 2) * (0.6 + coords.pressure * 0.8));
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    const handlePointerUp = (e) => {
        finalizeActivePointer(e.pointerId, false, e);
    };

    const handlePointerCancel = (e) => {
        finalizeActivePointer(e.pointerId, true, e);
    };

    const handleLostPointerCapture = (e) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        // If stylus nib is still physically pressed when palm contact triggers lostpointercapture,
        // re-acquire capture and let window listeners maintain continuous stroke tracking!
        if (isDrawingRef.current && activePointerTypeRef.current === 'pen' && e.buttons > 0) {
            const canvas = canvasRef.current;
            if (canvas && typeof canvas.setPointerCapture === 'function') {
                try {
                    canvas.setPointerCapture(e.pointerId);
                    return;
                } catch (_) {}
            }
            return;
        }
        finalizeActivePointer(e.pointerId, false, e);
    };

    const handlePointerLeave = (e) => {
        if (!isDrawingRef.current && activeToolRef.current === 'eraser') {
            updateEraserCursor(null, false, false);
        }
    };

    const isInteractive = activeTool === 'pen' || activeTool === 'eraser';

    return (
        <div
            ref={containerRef}
            className="ipn-pen-canvas-container"
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: isInteractive ? 'auto' : 'none',
                touchAction: isInteractive ? 'none' : 'auto',
                userSelect: isInteractive ? 'none' : 'auto',
                WebkitUserSelect: isInteractive ? 'none' : 'auto',
                cursor: activeTool === 'pen' ? 'crosshair' : activeTool === 'eraser' ? 'none' : 'default',
                overflow: 'hidden',
                zIndex: 20
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={processActivePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={handleLostPointerCapture}
                onPointerLeave={handlePointerLeave}
            />

            {/* Dark Grey (#555555) Visual Eraser Boundary Indicator — DOM overlay only, never saved into document/PDF */}
            <div
                ref={eraserCursorRef}
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: '2px solid #555555',
                    backgroundColor: 'rgba(85, 85, 85, 0.14)',
                    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.85)',
                    pointerEvents: 'none',
                    opacity: 0,
                    willChange: 'transform, width, height, opacity',
                    zIndex: 25
                }}
            />
        </div>
    );
};

export default React.memo(TabletPenCanvas);
