import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useVoiceRecorder — Custom hook for recording consultation audio via MediaRecorder API.
 * 
 * Captures audio from the microphone as WebM/Opus or fallback format.
 * Provides start/pause/resume/stop/cancel controls with accurate recording timer.
 * stop() returns a Promise that resolves with { blob, mimeType, base64 } for reliable AI upload.
 */

export default function useVoiceRecorder() {
    const [state, setState] = useState('IDLE'); // IDLE | RECORDING | PAUSED | STOPPED | ERROR
    const [durationSeconds, setDurationSeconds] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [mimeType, setMimeType] = useState('audio/webm');
    const [error, setError] = useState(null);
    const [micPermission, setMicPermission] = useState('prompt'); // prompt | granted | denied

    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const pausedDurationRef = useRef(0);
    const pauseTimeRef = useRef(null);
    const currentBlobRef = useRef(null);
    const currentBase64Ref = useRef(null);
    const mimeTypeRef = useRef('audio/webm');

    // Check mic permission on mount
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'microphone' })
                .then(result => {
                    setMicPermission(result.state);
                    result.onchange = () => setMicPermission(result.state);
                })
                .catch(() => { /* permissions API not available in some browsers */ });
        }
    }, []);

    // Timer updater
    const startTimer = useCallback(() => {
        startTimeRef.current = Date.now();
        pausedDurationRef.current = 0;
        timerRef.current = setInterval(() => {
            const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000));
            setDurationSeconds(elapsed);
        }, 250);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // Select best available MIME type supported by browser
    const selectMimeType = useCallback(() => {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/aac',
        ];
        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
            for (const type of types) {
                if (MediaRecorder.isTypeSupported(type)) {
                    return type;
                }
            }
        }
        return 'audio/webm';
    }, []);

    // ── Start Recording ──────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        try {
            setError(null);
            setAudioBlob(null);
            currentBlobRef.current = null;
            currentBase64Ref.current = null;
            chunksRef.current = [];
            pausedDurationRef.current = 0;
            pauseTimeRef.current = null;
            setDurationSeconds(0);

            // Verify getUserMedia support (must be localhost or HTTPS)
            if (!navigator?.mediaDevices?.getUserMedia) {
                const errMsg = 'Microphone access is unavailable. Please ensure you are running on http://localhost or HTTPS, and using a modern browser (Chrome/Edge/Firefox).';
                setError(errMsg);
                setState('ERROR');
                throw new Error(errMsg);
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                }
            });

            streamRef.current = stream;
            setMicPermission('granted');

            const mime = selectMimeType();
            mimeTypeRef.current = mime.split(';')[0];
            setMimeType(mimeTypeRef.current);

            const recorder = new MediaRecorder(stream, { mimeType: mime });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onerror = (event) => {
                console.error('[VoiceRecorder] MediaRecorder error:', event);
                setError('Microphone recording error occurred.');
                setState('ERROR');
                stopTimer();
            };

            // Capture chunks every 500ms
            recorder.start(500);
            setState('RECORDING');
            startTimer();
            return true;

        } catch (err) {
            console.error('[VoiceRecorder] start error:', err);
            let userMsg = err.message || 'Failed to start recording';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                userMsg = 'Microphone permission was denied. Please click the camera/lock icon in your browser address bar and allow Microphone access.';
                setMicPermission('denied');
            } else if (err.name === 'NotFoundError') {
                userMsg = 'No microphone device found. Please connect a working microphone.';
            } else if (err.name === 'NotReadableError') {
                userMsg = 'Microphone is already in use by another application.';
            }
            setError(userMsg);
            setState('ERROR');
            throw new Error(userMsg);
        }
    }, [selectMimeType, startTimer, stopTimer]);

    // ── Pause Recording ──────────────────────────────────────────────────────
    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
                mediaRecorderRef.current.pause();
                pauseTimeRef.current = Date.now();
                setState('PAUSED');
            } catch (e) {
                console.warn('[VoiceRecorder] Pause error:', e);
            }
        }
    }, []);

    // ── Resume Recording ─────────────────────────────────────────────────────
    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            try {
                if (pauseTimeRef.current) {
                    pausedDurationRef.current += (Date.now() - pauseTimeRef.current);
                    pauseTimeRef.current = null;
                }
                mediaRecorderRef.current.resume();
                setState('RECORDING');
            } catch (e) {
                console.warn('[VoiceRecorder] Resume error:', e);
            }
        }
    }, []);

    // ── Stop Recording (returns Promise with blob & base64) ───────────────────
    const stopRecording = useCallback(() => {
        return new Promise((resolve, reject) => {
            stopTimer();
            const recorder = mediaRecorderRef.current;

            // Helper to build result from chunks
            const finalize = (rawChunks) => {
                const cleanMime = mimeTypeRef.current || 'audio/webm';
                const blob = new Blob(rawChunks, { type: cleanMime });
                setAudioBlob(blob);
                currentBlobRef.current = blob;
                setState('STOPPED');

                // Stop all audio tracks to release microphone
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => {
                        try { track.stop(); } catch (e) {}
                    });
                    streamRef.current = null;
                }

                // Convert to base64
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result || '').split(',')[1] || '';
                    currentBase64Ref.current = base64;
                    resolve({ blob, mimeType: cleanMime, base64 });
                };
                reader.onerror = () => {
                    resolve({ blob, mimeType: cleanMime, base64: '' });
                };
                reader.readAsDataURL(blob);
            };

            if (!recorder || recorder.state === 'inactive') {
                // If already stopped or had previously collected chunks
                if (chunksRef.current.length > 0) {
                    finalize(chunksRef.current);
                } else if (currentBlobRef.current) {
                    resolve({
                        blob: currentBlobRef.current,
                        mimeType: mimeTypeRef.current || 'audio/webm',
                        base64: currentBase64Ref.current || ''
                    });
                } else {
                    reject(new Error('No audio was captured. Please try recording again.'));
                }
                return;
            }

            recorder.onstop = () => {
                try {
                    finalize(chunksRef.current);
                } catch (err) {
                    reject(err);
                }
            };

            try {
                // Request any final data chunk before stopping
                if (typeof recorder.requestData === 'function') {
                    try { recorder.requestData(); } catch (e) {}
                }
                recorder.stop();
            } catch (e) {
                console.warn('[VoiceRecorder] Error calling recorder.stop():', e);
                if (chunksRef.current.length > 0) {
                    finalize(chunksRef.current);
                } else {
                    reject(e);
                }
            }
        });
    }, [stopTimer]);

    // ── Cancel Recording ─────────────────────────────────────────────────────
    const cancelRecording = useCallback(() => {
        stopTimer();
        if (mediaRecorderRef.current) {
            try { mediaRecorderRef.current.stop(); } catch (e) {}
            mediaRecorderRef.current = null;
        }
        if (streamRef.current) {
            try {
                streamRef.current.getTracks().forEach(t => t.stop());
            } catch (e) {}
            streamRef.current = null;
        }
        chunksRef.current = [];
        currentBlobRef.current = null;
        currentBase64Ref.current = null;
        setAudioBlob(null);
        setDurationSeconds(0);
        pausedDurationRef.current = 0;
        pauseTimeRef.current = null;
        setState('IDLE');
        setError(null);
    }, [stopTimer]);

    // ── Get Base64 ───────────────────────────────────────────────────────────
    const getAudioBase64 = useCallback(async () => {
        if (currentBase64Ref.current) return currentBase64Ref.current;
        const blob = currentBlobRef.current || audioBlob;
        if (!blob) return '';
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const b64 = (reader.result || '').split(',')[1] || '';
                currentBase64Ref.current = b64;
                resolve(b64);
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    }, [audioBlob]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopTimer();
            if (mediaRecorderRef.current) {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
            if (streamRef.current) {
                try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
            }
        };
    }, [stopTimer]);

    const formattedDuration = `${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`;

    return {
        state,
        durationSeconds,
        formattedDuration,
        formatDuration: (sec) => {
            const s = typeof sec === 'number' ? sec : durationSeconds;
            return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        },
        audioBlob,
        mimeType,
        error,
        micPermission,
        start: startRecording,
        startRecording,
        pause: pauseRecording,
        pauseRecording,
        resume: resumeRecording,
        resumeRecording,
        stop: stopRecording,
        stopRecording,
        cancel: cancelRecording,
        cancelRecording,
        reset: cancelRecording,
        getBase64: getAudioBase64,
        getAudioBase64,
    };
}
