import React, {
    useState,
    useEffect,
    useLayoutEffect,
    useRef,
    useCallback,
    forwardRef,
    useImperativeHandle
} from 'react';
import './TabletSheetWorkspace.css';

export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 2.0;
const PINCH_MAX_DELTA = 0.04; // Smooth proportional pinch capped at 4% per frame
const MANUAL_STEP = 0.05; // Gentle 5% step for manual + / - buttons
const LOGICAL_SHEET_WIDTH = 794;
const LOGICAL_SHEET_HEIGHT = 1123;

export function clampSheetZoom(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 1;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, num));
    return Math.round(clamped * 100) / 100;
}

/**
 * Reusable Horizontal Zoom Controls Group for the Top Document Toolbar.
 * Renders: [ − ] [ 100% ] [ + ] [ Fit to Screen ]
 */
export const SheetZoomToolbarControls = ({ zoom = 1, setZoom, workspaceRef }) => {
    const safeZoom = clampSheetZoom(zoom);

    const onZoomOut = () => {
        if (workspaceRef?.current?.zoomOut) {
            workspaceRef.current.zoomOut();
        } else if (setZoom) {
            setZoom(clampSheetZoom(safeZoom - MANUAL_STEP));
        }
    };

    const onZoomIn = () => {
        if (workspaceRef?.current?.zoomIn) {
            workspaceRef.current.zoomIn();
        } else if (setZoom) {
            setZoom(clampSheetZoom(safeZoom + MANUAL_STEP));
        }
    };

    const onResetZoom = () => {
        if (workspaceRef?.current?.resetZoom) {
            workspaceRef.current.resetZoom();
        } else if (setZoom) {
            setZoom(1);
        }
    };

    const onFitToScreen = () => {
        if (workspaceRef?.current?.fitToScreen) {
            workspaceRef.current.fitToScreen();
        } else if (setZoom) {
            setZoom(1);
        }
    };

    return (
        <div className="tsw-top-zoom-group" role="group" aria-label="Sheet zoom controls">
            <button
                type="button"
                className="tsw-top-zoom-btn"
                onClick={onZoomOut}
                disabled={safeZoom <= MIN_ZOOM + 0.001}
                aria-label="Zoom Out"
                title="Zoom Out (−)"
            >
                −
            </button>
            <button
                type="button"
                className="tsw-top-zoom-pct"
                onClick={onResetZoom}
                aria-live="polite"
                title="Click to reset zoom to 100%"
            >
                {Math.round(safeZoom * 100)}%
            </button>
            <button
                type="button"
                className="tsw-top-zoom-btn"
                onClick={onZoomIn}
                disabled={safeZoom >= MAX_ZOOM - 0.001}
                aria-label="Zoom In"
                title="Zoom In (+)"
            >
                +
            </button>
            <button
                type="button"
                className="tsw-top-zoom-fit"
                onClick={onFitToScreen}
                aria-label="Fit to Screen"
                title="Fit entire clinical sheet inside viewing area"
            >
                Fit to Screen
            </button>
        </div>
    );
};

const TabletSheetWorkspace = forwardRef(({
    children,
    zoom: propZoom,
    setZoom: propSetZoom,
    activeTool = 'type',
    penSessionRef = null
}, ref) => {
    const [internalZoom, setInternalZoom] = useState(1);
    const rawZoom = propZoom !== undefined ? propZoom : internalZoom;
    const safeZoom = clampSheetZoom(rawZoom);
    const updateZoomState = propSetZoom || setInternalZoom;

    const viewportRef = useRef(null);
    const sizerRef = useRef(null);
    const contentRef = useRef(null);
    const railRef = useRef(null);

    const zoomRef = useRef(safeZoom);
    zoomRef.current = safeZoom;

    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;

    const [naturalSize, setNaturalSize] = useState({ width: LOGICAL_SHEET_WIDTH, height: LOGICAL_SHEET_HEIGHT });
    const naturalSizeRef = useRef({ width: LOGICAL_SHEET_WIDTH, height: LOGICAL_SHEET_HEIGHT });

    // Anchor target applied synchronously before browser paint in useLayoutEffect
    const pendingAnchorRef = useRef(null);

    // Touch gesture tracking (2-finger smooth pinch-zoom + 1-finger scroll in Pen/Eraser mode)
    const gestureRef = useRef({
        mode: 'idle', // 'idle' | 'pinch' | 'pan'
        lastDist: 0,
        lastMidX: 0,
        lastMidY: 0,
        panStartX: 0,
        panStartY: 0,
        lastPanX: 0,
        lastPanY: 0,
        panMoved: false
    });

    // Dedicated right-edge scroll rail state
    const [isRailDragging, setIsRailDragging] = useState(false);
    const railDragRef = useRef({
        active: false,
        pointerId: null,
        startClientY: 0,
        startScrollTop: 0
    });
    const [scrollMetrics, setScrollMetrics] = useState({
        canScroll: false,
        thumbHeightPct: 100,
        thumbTopPct: 0,
        progress: 0
    });

    const syncScrollMetrics = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const { scrollTop, scrollHeight, clientHeight } = vp;
        const canScroll = scrollHeight > clientHeight + 2;
        if (!canScroll) {
            setScrollMetrics((prev) => (
                !prev.canScroll && prev.thumbHeightPct === 100 && prev.thumbTopPct === 0
                    ? prev
                    : { canScroll: false, thumbHeightPct: 100, thumbTopPct: 0, progress: 0 }
            ));
            return;
        }
        const thumbHeightPct = Math.max(10, Math.min(92, (clientHeight / scrollHeight) * 100));
        const maxScroll = Math.max(1, scrollHeight - clientHeight);
        const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        const thumbTopPct = progress * (100 - thumbHeightPct);

        setScrollMetrics({
            canScroll: true,
            thumbHeightPct,
            thumbTopPct,
            progress
        });
    }, []);

    // Observe intrinsic unscaled sheet stack dimensions once (never tearing down per zoom frame)
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;

        const measure = () => {
            const w = el.offsetWidth || LOGICAL_SHEET_WIDTH;
            const h = el.offsetHeight || 0;
            if (w <= 0 || h <= 0) return;

            const prev = naturalSizeRef.current;
            if (Math.abs(prev.width - w) > 1 || Math.abs(prev.height - h) > 1) {
                const next = { width: w, height: h };
                naturalSizeRef.current = next;
                setNaturalSize(next);
            }
            requestAnimationFrame(syncScrollMetrics);
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);

        const vp = viewportRef.current;
        if (vp) ro.observe(vp);

        return () => ro.disconnect();
    }, [syncScrollMetrics]);

    // Apply anchored zoom change so the sheet point at (anchorClientX, anchorClientY) stays visually locked
    const applyAnchoredZoom = useCallback((targetZoomRaw, anchorClientX, anchorClientY, extraPanDx = 0, extraPanDy = 0) => {
        const nextZoom = clampSheetZoom(targetZoomRaw);
        const prevZoom = zoomRef.current;
        const vp = viewportRef.current;
        const sizer = sizerRef.current;

        if (!vp || !sizer || Math.abs(nextZoom - prevZoom) < 0.001) {
            if (vp && (extraPanDx !== 0 || extraPanDy !== 0)) {
                vp.scrollLeft -= extraPanDx;
                vp.scrollTop -= extraPanDy;
            }
            return;
        }

        const vpRect = vp.getBoundingClientRect();
        const sizerRect = sizer.getBoundingClientRect();
        const nat = naturalSizeRef.current;

        const clientX = Number.isFinite(anchorClientX) ? anchorClientX : (vpRect.left + vpRect.width / 2);
        const clientY = Number.isFinite(anchorClientY) ? anchorClientY : (vpRect.top + vpRect.height / 2);

        const vx = clientX - vpRect.left;
        const vy = clientY - vpRect.top;

        // Logical unscaled document coordinates under the anchor point
        const docX = Math.max(0, Math.min(nat.width, (clientX - sizerRect.left) / prevZoom));
        const docY = Math.max(0, Math.min(nat.height, (clientY - sizerRect.top) / prevZoom));

        pendingAnchorRef.current = {
            docX,
            docY,
            vx,
            vy,
            extraPanDx,
            extraPanDy,
            targetZoom: nextZoom
        };

        zoomRef.current = nextZoom;
        updateZoomState(nextZoom);
    }, [updateZoomState]);

    // Synchronously adjust scrollLeft & scrollTop BEFORE browser paint when zoom changes
    useLayoutEffect(() => {
        const anchor = pendingAnchorRef.current;
        const vp = viewportRef.current;
        const sizer = sizerRef.current;

        if (anchor && vp && sizer) {
            pendingAnchorRef.current = null;
            const z = clampSheetZoom(anchor.targetZoom);
            const sizerOffsetLeft = sizer.offsetLeft || 0;
            const sizerOffsetTop = sizer.offsetTop || 0;

            const desiredScrollLeft = sizerOffsetLeft + anchor.docX * z - anchor.vx - (anchor.extraPanDx || 0);
            const desiredScrollTop = sizerOffsetTop + anchor.docY * z - anchor.vy - (anchor.extraPanDy || 0);

            const maxScrollLeft = Math.max(0, vp.scrollWidth - vp.clientWidth);
            const maxScrollTop = Math.max(0, vp.scrollHeight - vp.clientHeight);

            if (Number.isFinite(desiredScrollLeft)) {
                vp.scrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));
            }
            if (Number.isFinite(desiredScrollTop)) {
                vp.scrollTop = Math.max(0, Math.min(maxScrollTop, desiredScrollTop));
            }
        }
        syncScrollMetrics();
    }, [safeZoom, naturalSize, syncScrollMetrics]);

    // Touch gesture handlers on the scrollable viewport (2-finger smooth pinch-zoom + 1-finger scroll in Pen/Eraser mode)
    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;

        const isStylusActiveOrRecent = () => {
            const sess = penSessionRef?.current;
            if (!sess) return false;
            if (sess.isPenDown) return true;
            const now = performance.now();
            if (sess.lastPenTime && now - sess.lastPenTime < 450) return true;
            if (sess.lastPenHoverTime && now - sess.lastPenHoverTime < 220) return true;
            return false;
        };

        const getFingerTouches = (touchList) => {
            const out = [];
            for (let i = 0; i < touchList.length; i += 1) {
                const t = touchList[i];
                if (t.touchType === 'stylus') continue;
                out.push(t);
            }
            return out;
        };

        const onTouchStart = (e) => {
            if (isStylusActiveOrRecent()) {
                gestureRef.current.mode = 'idle';
                if (activeToolRef.current !== 'type' && e.cancelable) {
                    e.preventDefault();
                }
                return;
            }

            const fingers = getFingerTouches(e.touches);

            if (fingers.length === 2) {
                if (e.cancelable) e.preventDefault();
                const dx = fingers[0].clientX - fingers[1].clientX;
                const dy = fingers[0].clientY - fingers[1].clientY;
                const dist = Math.hypot(dx, dy);
                const midX = (fingers[0].clientX + fingers[1].clientX) / 2;
                const midY = (fingers[0].clientY + fingers[1].clientY) / 2;

                gestureRef.current = {
                    ...gestureRef.current,
                    mode: 'pinch',
                    lastDist: Math.max(20, dist),
                    lastMidX: midX,
                    lastMidY: midY
                };
                return;
            }

            if (fingers.length === 1 && activeToolRef.current !== 'type') {
                gestureRef.current = {
                    ...gestureRef.current,
                    mode: 'pan',
                    panStartX: fingers[0].clientX,
                    panStartY: fingers[0].clientY,
                    lastPanX: fingers[0].clientX,
                    lastPanY: fingers[0].clientY,
                    panMoved: false
                };
            } else {
                gestureRef.current.mode = 'idle';
            }
        };

        const onTouchMove = (e) => {
            if (isStylusActiveOrRecent()) {
                gestureRef.current.mode = 'idle';
                if (activeToolRef.current !== 'type' && e.cancelable) {
                    e.preventDefault();
                }
                return;
            }

            const fingers = getFingerTouches(e.touches);

            // 1. Two-finger smooth proportional pinch-to-zoom + two-finger pan
            if (fingers.length === 2) {
                if (e.cancelable) e.preventDefault();

                const dx = fingers[0].clientX - fingers[1].clientX;
                const dy = fingers[0].clientY - fingers[1].clientY;
                const dist = Math.hypot(dx, dy);
                const midX = (fingers[0].clientX + fingers[1].clientX) / 2;
                const midY = (fingers[0].clientY + fingers[1].clientY) / 2;

                if (!Number.isFinite(dist) || dist < 12) return;

                if (gestureRef.current.mode !== 'pinch' || gestureRef.current.lastDist <= 0) {
                    gestureRef.current.mode = 'pinch';
                    gestureRef.current.lastDist = Math.max(20, dist);
                    gestureRef.current.lastMidX = midX;
                    gestureRef.current.lastMidY = midY;
                    return;
                }

                const panDx = midX - gestureRef.current.lastMidX;
                const panDy = midY - gestureRef.current.lastMidY;
                gestureRef.current.lastMidX = midX;
                gestureRef.current.lastMidY = midY;

                const baseDist = gestureRef.current.lastDist;
                const scaleFactor = dist / baseDist;
                const rawDelta = zoomRef.current * (scaleFactor - 1);

                // Smoothly apply zoom once pinch changes by >= 1%, capped at 4% per frame to prevent sudden jumps
                if (Math.abs(rawDelta) >= 0.01) {
                    const boundedDelta = Math.max(-PINCH_MAX_DELTA, Math.min(PINCH_MAX_DELTA, rawDelta));
                    gestureRef.current.lastDist = Math.max(20, dist);
                    applyAnchoredZoom(zoomRef.current + boundedDelta, midX, midY, panDx, panDy);
                } else if (Math.abs(panDx) > 0.5 || Math.abs(panDy) > 0.5) {
                    vp.scrollLeft -= panDx;
                    vp.scrollTop -= panDy;
                }
                return;
            }

            // 2. Single-finger touch scrolling when Pen or Eraser tool is selected (and stylus is not active)
            if (fingers.length === 1 && gestureRef.current.mode === 'pan' && activeToolRef.current !== 'type') {
                const curX = fingers[0].clientX;
                const curY = fingers[0].clientY;
                const totalMove = Math.hypot(
                    curX - gestureRef.current.panStartX,
                    curY - gestureRef.current.panStartY
                );

                if (!gestureRef.current.panMoved && totalMove < 5) {
                    return;
                }

                if (e.cancelable) e.preventDefault();
                gestureRef.current.panMoved = true;

                const dx = curX - gestureRef.current.lastPanX;
                const dy = curY - gestureRef.current.lastPanY;
                gestureRef.current.lastPanX = curX;
                gestureRef.current.lastPanY = curY;

                vp.scrollLeft -= dx;
                vp.scrollTop -= dy;
            }
        };

        const onTouchEnd = (e) => {
            const fingers = getFingerTouches(e.touches);
            if (fingers.length < 2 && gestureRef.current.mode === 'pinch') {
                gestureRef.current.mode = 'idle';
                gestureRef.current.lastDist = 0;
            }
            if (fingers.length === 0) {
                gestureRef.current.mode = 'idle';
            }
        };

        // Also support Ctrl + Wheel smooth anchored zoom on desktop/trackpad
        const onWheel = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (e.cancelable) e.preventDefault();
            const step = e.deltaY < 0 ? MANUAL_STEP : -MANUAL_STEP;
            applyAnchoredZoom(zoomRef.current + step, e.clientX, e.clientY);
        };

        vp.addEventListener('touchstart', onTouchStart, { passive: false });
        vp.addEventListener('touchmove', onTouchMove, { passive: false });
        vp.addEventListener('touchend', onTouchEnd);
        vp.addEventListener('touchcancel', onTouchEnd);
        vp.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            vp.removeEventListener('touchstart', onTouchStart);
            vp.removeEventListener('touchmove', onTouchMove);
            vp.removeEventListener('touchend', onTouchEnd);
            vp.removeEventListener('touchcancel', onTouchEnd);
            vp.removeEventListener('wheel', onWheel);
        };
    }, [applyAnchoredZoom, penSessionRef]);

    const handleZoomIn = useCallback(() => {
        const vp = viewportRef.current;
        const rect = vp ? vp.getBoundingClientRect() : null;
        applyAnchoredZoom(
            zoomRef.current + MANUAL_STEP,
            rect ? rect.left + rect.width / 2 : undefined,
            rect ? rect.top + rect.height / 2 : undefined
        );
    }, [applyAnchoredZoom]);

    const handleZoomOut = useCallback(() => {
        const vp = viewportRef.current;
        const rect = vp ? vp.getBoundingClientRect() : null;
        applyAnchoredZoom(
            zoomRef.current - MANUAL_STEP,
            rect ? rect.left + rect.width / 2 : undefined,
            rect ? rect.top + rect.height / 2 : undefined
        );
    }, [applyAnchoredZoom]);

    const handleResetZoom = useCallback(() => {
        const vp = viewportRef.current;
        const rect = vp ? vp.getBoundingClientRect() : null;
        applyAnchoredZoom(
            1,
            rect ? rect.left + rect.width / 2 : undefined,
            rect ? rect.top + rect.height / 2 : undefined
        );
    }, [applyAnchoredZoom]);

    const handleFitToScreen = useCallback(() => {
        const vp = viewportRef.current;
        const content = contentRef.current;
        if (!vp) {
            updateZoomState(1);
            return;
        }

        // Measure a single A4 sheet inside the stack so Fit to Screen fits the entire sheet cleanly
        const sheets = content
            ? Array.from(content.querySelectorAll('.ipdc-a4-sheet, .ipn-sheet-paper'))
            : [];
        const activeSheet = (content && content.querySelector('.is-active-sheet')) || sheets[0] || null;

        const sheetW = (activeSheet && activeSheet.offsetWidth) || naturalSizeRef.current.width || LOGICAL_SHEET_WIDTH;
        const sheetH = (activeSheet && activeSheet.offsetHeight) || LOGICAL_SHEET_HEIGHT;

        const availW = Math.max(240, vp.clientWidth - 32);
        const availH = Math.max(240, vp.clientHeight - 28);

        const scaleX = availW / sheetW;
        const scaleY = availH / sheetH;
        const rawFit = Math.min(scaleX, scaleY, 1.0);
        const fitZoom = clampSheetZoom(Math.floor(rawFit * 100) / 100);

        const targetOffsetTop = activeSheet ? activeSheet.offsetTop : 0;

        pendingAnchorRef.current = null;
        zoomRef.current = fitZoom;
        updateZoomState(fitZoom);

        requestAnimationFrame(() => {
            const curVp = viewportRef.current;
            if (curVp) {
                curVp.scrollLeft = 0;
                curVp.scrollTop = Math.max(0, Math.round(targetOffsetTop * fitZoom));
                syncScrollMetrics();
            }
        });
    }, [updateZoomState, syncScrollMetrics]);

    useImperativeHandle(ref, () => ({
        zoomIn: handleZoomIn,
        zoomOut: handleZoomOut,
        resetZoom: handleResetZoom,
        fitToScreen: handleFitToScreen
    }), [handleZoomIn, handleZoomOut, handleResetZoom, handleFitToScreen]);

    // Dedicated Right-Edge Vertical Scroll Rail Handlers (Works in Pen, Eraser & Type modes)
    const scrollRailToClientY = (clientY, isInitialJump = false) => {
        const vp = viewportRef.current;
        const rail = railRef.current;
        if (!vp || !rail) return;

        const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight);
        if (maxScroll <= 0) return;

        const railRect = rail.getBoundingClientRect();
        const pad = 10;
        const trackHeight = Math.max(40, railRect.height - pad * 2);
        const thumbPx = Math.max(36, (scrollMetrics.thumbHeightPct / 100) * trackHeight);
        const usableTrack = Math.max(1, trackHeight - thumbPx);

        if (isInitialJump) {
            const relY = clientY - railRect.top - pad - thumbPx / 2;
            const ratio = Math.max(0, Math.min(1, relY / usableTrack));
            vp.scrollTop = ratio * maxScroll;
            railDragRef.current.startClientY = clientY;
            railDragRef.current.startScrollTop = vp.scrollTop;
        } else {
            const deltaY = clientY - railDragRef.current.startClientY;
            const scrollDelta = (deltaY / usableTrack) * maxScroll;
            vp.scrollTop = Math.max(0, Math.min(maxScroll, railDragRef.current.startScrollTop + scrollDelta));
        }
    };

    const handleRailPointerDown = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        const vp = viewportRef.current;
        const rail = railRef.current;
        if (!vp || !rail) return;

        try {
            rail.setPointerCapture(e.pointerId);
        } catch (_) {}

        const clickedThumb = e.target && e.target.classList && e.target.classList.contains('tsw-scroll-rail-thumb');
        railDragRef.current = {
            active: true,
            pointerId: e.pointerId,
            startClientY: e.clientY,
            startScrollTop: vp.scrollTop
        };
        setIsRailDragging(true);

        if (!clickedThumb) {
            scrollRailToClientY(e.clientY, true);
        }
    };

    const handleRailPointerMove = (e) => {
        if (!railDragRef.current.active || railDragRef.current.pointerId !== e.pointerId) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        scrollRailToClientY(e.clientY, false);
    };

    const handleRailPointerEnd = (e) => {
        if (!railDragRef.current.active || (e?.pointerId !== undefined && railDragRef.current.pointerId !== e.pointerId)) {
            return;
        }
        const rail = railRef.current;
        if (rail && e?.pointerId !== undefined) {
            try {
                if (rail.hasPointerCapture(e.pointerId)) {
                    rail.releasePointerCapture(e.pointerId);
                }
            } catch (_) {}
        }
        railDragRef.current.active = false;
        railDragRef.current.pointerId = null;
        setIsRailDragging(false);
    };

    const scaledWidth = Math.round((naturalSize.width || LOGICAL_SHEET_WIDTH) * safeZoom);
    const scaledHeight = Math.round((naturalSize.height || LOGICAL_SHEET_HEIGHT) * safeZoom);

    return (
        <div className="tsw-workspace-shell">
            {/* 1. Scrollable Sheet Area */}
            <div
                ref={viewportRef}
                className="tsw-scroll-viewport"
                onScroll={syncScrollMetrics}
            >
                <div
                    ref={sizerRef}
                    className="tsw-zoom-sizer"
                    style={{
                        width: `${scaledWidth}px`,
                        height: `${scaledHeight}px`
                    }}
                >
                    <div
                        ref={contentRef}
                        className="tsw-zoom-content"
                        style={{
                            transform: safeZoom === 1 ? 'none' : `scale(${safeZoom})`,
                            transformOrigin: '0 0'
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>

            {/* 2. Dedicated Right-Edge Vertical Scroll Rail */}
            <div
                ref={railRef}
                className={`tsw-scroll-rail ${isRailDragging ? 'dragging' : ''} ${!scrollMetrics.canScroll ? 'is-unscrollable' : ''}`}
                onPointerDown={handleRailPointerDown}
                onPointerMove={handleRailPointerMove}
                onPointerUp={handleRailPointerEnd}
                onPointerCancel={handleRailPointerEnd}
                onLostPointerCapture={handleRailPointerEnd}
                role="scrollbar"
                aria-orientation="vertical"
                aria-label="Medical sheet scroll rail"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(scrollMetrics.progress * 100)}
                title="Drag rail to scroll sheet in any tool mode"
            >
                <div className="tsw-scroll-rail-track">
                    <div
                        className="tsw-scroll-rail-thumb"
                        style={{
                            height: `${scrollMetrics.thumbHeightPct}%`,
                            top: `${scrollMetrics.thumbTopPct}%`
                        }}
                    />
                </div>
            </div>
        </div>
    );
});

TabletSheetWorkspace.displayName = 'TabletSheetWorkspace';

export default TabletSheetWorkspace;
