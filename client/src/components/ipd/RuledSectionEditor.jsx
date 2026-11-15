import React, { useRef, useState, useEffect } from 'react';
import { FiMic } from 'react-icons/fi';
import toast from 'react-hot-toast';

const splitLinesForPreview = (text, count) => {
    const rawLines = (text ? String(text).split(/\r?\n/) : []).filter((l) => l.length > 0);
    const wrapped = [];
    rawLines.forEach((p) => {
        let rest = p;
        while (rest.length > 105) {
            let cut = rest.lastIndexOf(' ', 105);
            if (cut < 40) cut = 105;
            wrapped.push(rest.slice(0, cut));
            rest = rest.slice(cut).trimStart();
        }
        wrapped.push(rest);
    });
    const totalLines = Math.max(count, wrapped.length);
    return Array.from({ length: totalLines }, (_, idx) => wrapped[idx] || '');
};

const RuledSectionEditor = ({
    sectionKey,
    text = '',
    lineCount = 5,
    onChange,
    isReadOnly = false,
    placeholder = ''
}) => {
    const [lines, setLines] = useState(() => splitLinesForPreview(text, lineCount));
    const [activeLineIdx, setActiveLineIdx] = useState(null);
    const [dictatingLineIdx, setDictatingLineIdx] = useState(null);

    const inputsRef = useRef([]);
    const recognitionRef = useRef(null);

    // Keep lines in sync with parent text updates (e.g. from AI scribe or undo/redo)
    useEffect(() => {
        const nextLines = splitLinesForPreview(text, lineCount);
        setLines(nextLines);
    }, [text, lineCount]);

    const notifyParent = (newLines) => {
        setLines(newLines);
        // Find highest non-empty line
        let lastNonEmpty = -1;
        for (let i = newLines.length - 1; i >= 0; i--) {
            if (newLines[i] && newLines[i].trim().length > 0) {
                lastNonEmpty = i;
                break;
            }
        }
        const stringVal = lastNonEmpty === -1 ? '' : newLines.slice(0, lastNonEmpty + 1).join('\n');
        onChange(stringVal);
    };

    const handleLineChange = (index, value) => {
        if (isReadOnly) return;
        const newLines = [...lines];

        // Soft auto-wrap if typed string exceeds 105 characters
        if (value.length > 105 && value.includes(' ')) {
            const cut = value.lastIndexOf(' ', 105);
            const thisPart = value.slice(0, cut);
            const nextPart = value.slice(cut).trimStart();

            newLines[index] = thisPart;
            if (index + 1 < newLines.length) {
                newLines[index + 1] = nextPart + (newLines[index + 1] ? ' ' + newLines[index + 1] : '');
            } else {
                newLines.push(nextPart);
            }
            notifyParent(newLines);
            setTimeout(() => {
                inputsRef.current[index + 1]?.focus();
            }, 10);
            return;
        }

        newLines[index] = value;
        notifyParent(newLines);
    };

    const handleKeyDown = (e, index) => {
        if (isReadOnly) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.target;
            const cursorPos = input.selectionStart || 0;
            const curVal = lines[index] || '';

            const left = curVal.slice(0, cursorPos);
            const right = curVal.slice(cursorPos);

            const newLines = [...lines];
            newLines[index] = left;
            if (index + 1 < newLines.length) {
                newLines[index + 1] = right + (newLines[index + 1] ? ' ' + newLines[index + 1] : '');
            } else {
                newLines.push(right);
            }
            notifyParent(newLines);
            setTimeout(() => {
                const nextInput = inputsRef.current[index + 1];
                if (nextInput) {
                    nextInput.focus();
                    nextInput.setSelectionRange(0, 0);
                }
            }, 10);
        } else if (e.key === 'ArrowDown') {
            if (index + 1 < lines.length) {
                e.preventDefault();
                inputsRef.current[index + 1]?.focus();
            }
        } else if (e.key === 'ArrowUp') {
            if (index > 0) {
                e.preventDefault();
                inputsRef.current[index - 1]?.focus();
            }
        } else if (e.key === 'Backspace') {
            const input = e.target;
            if (input.selectionStart === 0 && input.selectionEnd === 0 && index > 0) {
                e.preventDefault();
                const prevInput = inputsRef.current[index - 1];
                const prevLen = (lines[index - 1] || '').length;
                const newLines = [...lines];
                newLines[index - 1] = (newLines[index - 1] || '') + (lines[index] || '');
                newLines.splice(index, 1);
                while (newLines.length < lineCount) newLines.push('');
                notifyParent(newLines);
                setTimeout(() => {
                    if (prevInput) {
                        prevInput.focus();
                        prevInput.setSelectionRange(prevLen, prevLen);
                    }
                }, 10);
            }
        }
    };

    // Single-line micro dictation with high responsiveness & minimal parent re-renders
    const handleStartLineDictation = (index) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Voice dictation not supported in this browser.');
            return;
        }

        if (dictatingLineIdx === index) {
            // Stop if already dictating
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) {}
            }
            setDictatingLineIdx(null);
            return;
        }

        try {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            const baseLineText = (lines[index] || '').trim();

            recognition.onstart = () => {
                setDictatingLineIdx(index);
                setActiveLineIdx(index);
            };

            recognition.onresult = (evt) => {
                let spoken = '';
                for (let i = 0; i < evt.results.length; i++) {
                    spoken += evt.results[i][0].transcript;
                }
                const updatedLine = baseLineText ? `${baseLineText} ${spoken}` : spoken;
                if (inputsRef.current[index]) {
                    inputsRef.current[index].value = updatedLine;
                }
                const newLines = [...lines];
                newLines[index] = updatedLine;
                setLines(newLines);
            };

            recognition.onend = () => {
                setDictatingLineIdx(null);
                const finalVal = inputsRef.current[index]?.value || lines[index] || '';
                const newLines = [...lines];
                newLines[index] = finalVal;
                notifyParent(newLines);
            };

            recognition.onerror = () => {
                setDictatingLineIdx(null);
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (err) {
            console.error('Line dictation error:', err);
            setDictatingLineIdx(null);
        }
    };

    return (
        <div className="ipn-doc-ruled-lines">
            {lines.map((line, idx) => {
                const isActive = activeLineIdx === idx;
                const isDictating = dictatingLineIdx === idx;

                return (
                    <div
                        key={idx}
                        className={`ipn-doc-ruled-line-interactive ${isActive ? 'focused' : ''} ${isDictating ? 'dictating' : ''}`}
                        onClick={() => {
                            inputsRef.current[idx]?.focus();
                        }}
                    >
                        <input
                            ref={(el) => (inputsRef.current[idx] = el)}
                            type="text"
                            className="ipn-inline-line-input"
                            value={line}
                            onChange={(e) => handleLineChange(idx, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, idx)}
                            onFocus={() => setActiveLineIdx(idx)}
                            onBlur={() => setActiveLineIdx(null)}
                            disabled={isReadOnly}
                            placeholder={idx === 0 && !line ? placeholder : ''}
                        />

                        {!isReadOnly && (
                            <button
                                type="button"
                                className={`ipn-line-mic-trigger ${isDictating ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartLineDictation(idx);
                                }}
                                title={isDictating ? 'Stop line dictation' : `Dictate into line ${idx + 1}`}
                            >
                                <FiMic size={11} />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default RuledSectionEditor;
