import React, { useRef, useEffect, useCallback } from 'react';
import { eraseStrokesAlongPath } from './penGeometry';

const TabletPenCanvas = ({
    pageKey,
    strokes = [],
    activeTool = 'type', // 'type' | 'pen' | 'eraser'
    penColor = '#1d4ed8', // Default Medical Blue
    penWidth = 2,
    onSaveStrokes
}) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Synchronous state refs to prevent race conditions & stale React closures
    const strokesRef = useRef(strokes);
    const isDrawingRef = useRef(false);
    const activePointerIdRef = useRef(null);
    const currentStrokeRef = useRef(null);
    const lastEraserPointRef = useRef(null);
    const eraserModifiedRef = useRef(false);
    const dprRef = useRef(1);

    // Keep strokesRef in sync with incoming strokes prop
    useEffect(() => {
        strokesRef.current = strokes;
    }, [strokes]);

    // Redraw all strokes on canvas with DPR scaling
    const renderAllStrokes = useCallback((strokeList) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = dprRef.current || window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();

        // Use setTransform to avoid accumulating scale
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

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
                const radius = Math.max(1, ((stroke.width || 2) / 2) * (0.6 + (pt.pressure || 0.5) * 0.8));
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
                const dynamicWidth = (stroke.width || 2) * (0.6 + avgPressure * 0.8);

                ctx.lineWidth = dynamicWidth;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }
            ctx.restore();
        });
    }, []);

    // Resize canvas to match parent DOM node with Retina/HiDPI scaling
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const updateCanvasSize = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const dpr = window.devicePixelRatio || 1;
            dprRef.current = dpr;

            // Physical pixel buffer
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);

            // CSS display size
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            renderAllStrokes(strokesRef.current);
        };

        updateCanvasSize();
        const ro = new ResizeObserver(updateCanvasSize);
        ro.observe(container);

        return () => ro.disconnect();
    }, [renderAllStrokes]);

    // Redraw whenever strokes change externally
    useEffect(() => {
        renderAllStrokes(strokes);
    }, [strokes, renderAllStrokes]);

    // Logical CSS pixel coordinates extraction
    const getCanvasCoordinates = (e, customRect = null) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
        const rect = customRect || canvas.getBoundingClientRect();
        const pressure = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5;
        return {
            x: Math.round((e.clientX - rect.left) * 10) / 10,
            y: Math.round((e.clientY - rect.top) * 10) / 10,
            pressure
        };
    };

    // POINTER DOWN: Start new independent stroke or eraser session
    const handlePointerDown = (e) => {
        if (activeTool === 'type') return;
        if (e.cancelable) e.preventDefault();

        // Clear any native browser selection to prevent drag artifacts during stylus drawing
        try {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel && sel.removeAllRanges) sel.removeAllRanges();
            }
        } catch (_) {}

        // If an abandoned previous pointer was active, finalize it safely
        if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
            handlePointerEnd({ pointerId: activePointerIdRef.current });
        }

        activePointerIdRef.current = e.pointerId;
        isDrawingRef.current = true;

        const canvas = canvasRef.current;
        if (canvas && typeof canvas.setPointerCapture === 'function') {
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
        }

        const rect = canvas ? canvas.getBoundingClientRect() : null;
        const coords = getCanvasCoordinates(e, rect);

        if (activeTool === 'eraser') {
            lastEraserPointRef.current = coords;
            eraserModifiedRef.current = false;

            const eraserRadius = Math.max(14, penWidth * 4);
            const eraseResult = eraseStrokesAlongPath(strokesRef.current, coords, coords, eraserRadius);
            if (eraseResult.changed) {
                strokesRef.current = eraseResult.strokes;
                eraserModifiedRef.current = true;
                renderAllStrokes(eraseResult.strokes);
            }
            return;
        }

        // PEN TOOL: Begin brand new stroke with isolated points array
        const newStroke = {
            id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            color: penColor,
            width: penWidth,
            tool: 'pen',
            points: [coords]
        };
        currentStrokeRef.current = newStroke;

        // Draw initial point/dot immediately for crisp visual responsiveness
        const ctx = canvas?.getContext('2d');
        if (ctx) {
            const dpr = dprRef.current || window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.fillStyle = penColor;
            const dotRadius = Math.max(1, (penWidth / 2) * (0.6 + coords.pressure * 0.8));
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    // POINTER MOVE: Append points to active stroke or drag-erase
    const handlePointerMove = (e) => {
        if (!isDrawingRef.current || activePointerIdRef.current !== e.pointerId) return;
        if (e.cancelable) e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Cache rect once per pointermove event to eliminate layout thrashing
        const rect = canvas.getBoundingClientRect();

        // Consume high-frequency coalesced events if available from stylus/Apple Pencil/Wacom
        const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
        const eventList = coalesced && coalesced.length > 0 ? coalesced : [e];

        if (activeTool === 'eraser') {
            const eraserRadius = Math.max(14, penWidth * 4);
            let anyChange = false;

            for (let i = 0; i < eventList.length; i++) {
                const pt = getCanvasCoordinates(eventList[i], rect);
                const prev = lastEraserPointRef.current || pt;
                const res = eraseStrokesAlongPath(strokesRef.current, prev, pt, eraserRadius);
                if (res.changed) {
                    strokesRef.current = res.strokes;
                    anyChange = true;
                    eraserModifiedRef.current = true;
                }
                lastEraserPointRef.current = pt;
            }

            if (anyChange) {
                renderAllStrokes(strokesRef.current);
            }
            return;
        }

        // PEN TOOL: Draw incremental line segments
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
    };

    // POINTER UP / CANCEL: Finalize stroke cleanly exactly once
    const handlePointerEnd = (e) => {
        const ptrId = e?.pointerId !== undefined ? e.pointerId : activePointerIdRef.current;
        if (activePointerIdRef.current !== null && ptrId !== activePointerIdRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        if (canvas && typeof canvas.hasPointerCapture === 'function' && ptrId !== null) {
            try {
                if (canvas.hasPointerCapture(ptrId)) {
                    canvas.releasePointerCapture(ptrId);
                }
            } catch (_) {}
        }

        const wasDrawing = isDrawingRef.current;
        isDrawingRef.current = false;
        activePointerIdRef.current = null;

        if (!wasDrawing) return;

        if (activeTool === 'pen') {
            const finishedStroke = currentStrokeRef.current;
            currentStrokeRef.current = null;

            if (finishedStroke && finishedStroke.points.length >= 1) {
                const updatedStrokes = [...strokesRef.current, finishedStroke];
                strokesRef.current = updatedStrokes;
                if (typeof onSaveStrokes === 'function') {
                    onSaveStrokes(updatedStrokes);
                }
            }
        } else if (activeTool === 'eraser') {
            lastEraserPointRef.current = null;
            if (eraserModifiedRef.current) {
                eraserModifiedRef.current = false;
                if (typeof onSaveStrokes === 'function') {
                    onSaveStrokes(strokesRef.current);
                }
            }
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
                cursor: activeTool === 'pen' ? 'crosshair' : activeTool === 'eraser' ? 'cell' : 'default',
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
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onLostPointerCapture={handlePointerEnd}
            />
        </div>
    );
};

export default TabletPenCanvas;
