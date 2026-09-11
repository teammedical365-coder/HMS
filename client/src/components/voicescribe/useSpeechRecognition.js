import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useSpeechRecognition — Custom hook for Web Speech API live transcription preview.
 * 
 * Provides real-time interim + final transcript from the browser's speech recognition.
 * Works seamlessly on Chrome and Edge. Gracefully falls back on unsupported browsers.
 * Multilingual clinical intelligence and code-switching is processed server-side by Gemini.
 */

const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

export default function useSpeechRecognition() {
    const [isSupported] = useState(() => !!SpeechRecognition);
    const [isListening, setIsListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [error, setError] = useState(null);
    const [detectedLang, setDetectedLang] = useState('');

    const recognitionRef = useRef(null);
    const isStoppedRef = useRef(false);
    const selectedLangRef = useRef('hi-IN');

    // Language code mapping for Web Speech API
    const langCodes = {
        'auto': 'hi-IN', // Defaults to Hindi/English Indian context
        'en-in': 'en-IN',
        'english': 'en-IN',
        'hi-in': 'hi-IN',
        'hindi': 'hi-IN',
        'bn-in': 'bn-IN',
        'bengali': 'bn-IN',
        'mr-in': 'mr-IN',
        'marathi': 'mr-IN',
        'gu-in': 'gu-IN',
        'gujarati': 'gu-IN',
        'punjabi': 'pa-IN',
        'pa-in': 'pa-IN',
        'tamil': 'ta-IN',
        'ta-in': 'ta-IN',
        'telugu': 'te-IN',
        'te-in': 'te-IN',
        'kannada': 'kn-IN',
        'kn-in': 'kn-IN',
        'malayalam': 'ml-IN',
        'ml-in': 'ml-IN',
        'urdu': 'ur-IN',
        'odia': 'or-IN',
        'assamese': 'as-IN',
    };

    const setLanguage = useCallback((lang) => {
        if (!lang) return;
        const normalized = lang.toLowerCase();
        const code = langCodes[normalized] || lang;
        selectedLangRef.current = code;
        setDetectedLang(lang);
        if (recognitionRef.current && isListening) {
            try {
                recognitionRef.current.lang = code;
            } catch (e) {}
        }
    }, [isListening]);

    const startListening = useCallback((inputLanguage = 'auto') => {
        if (!SpeechRecognition) {
            // Not supported, fail gracefully without throwing
            console.log('[SpeechRecognition] Browser does not support Web Speech API');
            return;
        }

        // Clean up any existing recognition instance
        if (recognitionRef.current) {
            try {
                recognitionRef.current.abort();
            } catch (e) {}
            recognitionRef.current = null;
        }

        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            isStoppedRef.current = false;

            // Configuration
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            const langKey = (inputLanguage || 'auto').toLowerCase();
            const code = langCodes[langKey] || 'hi-IN';
            selectedLangRef.current = code;
            recognition.lang = code;
            setDetectedLang(inputLanguage);

            recognition.onstart = () => {
                setIsListening(true);
                setError(null);
            };

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        final += result[0].transcript + ' ';
                    } else {
                        interim += result[0].transcript;
                    }
                }

                if (final) {
                    setFinalTranscript(prev => prev + final);
                }
                setInterimTranscript(interim);
            };

            recognition.onerror = (event) => {
                // Ignore transient browser speech events
                if (event.error === 'aborted' || event.error === 'no-speech') {
                    return;
                }
                if (event.error === 'not-allowed') {
                    setError('Microphone permission denied for speech recognition.');
                } else if (event.error === 'network') {
                    // Non-fatal network glitch in Web Speech API
                    console.warn('[SpeechRecognition] Network warning in Web Speech API');
                } else {
                    console.warn('[SpeechRecognition] Event error:', event.error);
                }
            };

            recognition.onend = () => {
                // Automatically restart if user hasn't stopped (Chrome times out after silence)
                if (!isStoppedRef.current && recognitionRef.current) {
                    try {
                        recognition.start();
                    } catch (e) {
                        setIsListening(false);
                    }
                } else {
                    setIsListening(false);
                }
            };

            recognition.start();
        } catch (err) {
            console.warn('[SpeechRecognition] start error:', err);
            setIsListening(false);
        }
    }, []);

    const stopListening = useCallback(() => {
        isStoppedRef.current = true;
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {}
            recognitionRef.current = null;
        }
        setIsListening(false);
        setInterimTranscript('');
    }, []);

    const resetTranscript = useCallback(() => {
        stopListening();
        setFinalTranscript('');
        setInterimTranscript('');
        setError(null);
        setDetectedLang('');
    }, [stopListening]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isStoppedRef.current = true;
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
        };
    }, []);

    return {
        isSupported,
        isListening,
        interimTranscript,
        finalTranscript,
        fullTranscript: (finalTranscript + ' ' + interimTranscript).trim(),
        detectedLang,
        error,
        start: startListening,
        startListening,
        stop: stopListening,
        stopListening,
        reset: resetTranscript,
        resetTranscript,
        setLanguage,
        setSpeechLanguage: setLanguage,
    };
}
