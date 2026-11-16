import React, { useRef, useEffect, useState, useCallback } from 'react';

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
    const [isDrawing, setIsDrawing] = useState(false);
    const currentStrokeRef = useRef(null);

    // Redraw all strokes on canvas
    const renderAllStrokes = useCallback((canvas, strokeList) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        strokeList.forEach((stroke) => {
            if (!stroke.points || stroke.points.length < 2) return;

            ctx.save();
            ctx.strokeStyle = stroke.color || '#1d4ed8';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

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
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
            }
            renderAllStrokes(canvas, strokes);
        };

        updateCanvasSize();
        const ro = new ResizeObserver(updateCanvasSize);
        ro.observe(container);

        return () => ro.disconnect();
    }, [strokes, renderAllStrokes]);

    const getCanvasCoordinates = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            pressure: e.pressure > 0 ? e.pressure : 0.5
        };
    };

    const handlePointerDown = (e) => {
        if (activeTool === 'type') return;
        const coords = getCanvasCoordinates(e);

        if (activeTool === 'eraser') {
            // Find any stroke near click point (within 12px) and delete it
            const remaining = strokes.filter((st) => {
                const isNear = st.points?.some((pt) => {
                    const dx = pt.x - coords.x;
                    const dy = pt.y - coords.y;
                    return Math.sqrt(dx * dx + dy * dy) < 14;
                });
                return !isNear;
            });
            if (remaining.length !== strokes.length) {
                onSaveStrokes(remaining);
            }
            setIsDrawing(true);
            return;
        }

        setIsDrawing(true);
        currentStrokeRef.current = {
            id: Date.now() + Math.random(),
            color: penColor,
            width: penWidth,
            tool: activeTool,
            points: [coords]
        };

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
            ctx.save();
            ctx.fillStyle = penColor;
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, (penWidth / 2) * (0.6 + coords.pressure * 0.8), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    const handlePointerMove = (e) => {
        if (!isDrawing) return;
        const coords = getCanvasCoordinates(e);

        if (activeTool === 'eraser') {
            const remaining = strokes.filter((st) => {
                const isNear = st.points?.some((pt) => {
                    const dx = pt.x - coords.x;
                    const dy = pt.y - coords.y;
                    return Math.sqrt(dx * dx + dy * dy) < 14;
                });
                return !isNear;
            });
            if (remaining.length !== strokes.length) {
                onSaveStrokes(remaining);
            }
            return;
        }

        const curStroke = currentStrokeRef.current;
        if (!curStroke) return;

        const prevPoint = curStroke.points[curStroke.points.length - 1];
        curStroke.points.push(coords);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && prevPoint) {
            ctx.save();
            ctx.strokeStyle = curStroke.color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const avgPressure = (prevPoint.pressure + coords.pressure) / 2;
            ctx.lineWidth = curStroke.width * (0.6 + avgPressure * 0.8);

            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            ctx.restore();
        }
    };

    const handlePointerUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (activeTool === 'pen' && currentStrokeRef.current) {
            const finishedStroke = currentStrokeRef.current;
            currentStrokeRef.current = null;
            if (finishedStroke.points.length >= 1) {
                onSaveStrokes([...strokes, finishedStroke]);
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
                cursor: activeTool === 'pen' ? 'crosshair' : activeTool === 'eraser' ? 'cell' : 'default',
                zIndex: 20
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />
        </div>
    );
};

export default TabletPenCanvas;
