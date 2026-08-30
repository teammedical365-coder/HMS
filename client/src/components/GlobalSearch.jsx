import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiX, FiLoader, FiArrowLeft } from 'react-icons/fi';
import api from '../utils/api';

const GlobalSearch = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [mobileExpanded, setMobileExpanded] = useState(false);
    const searchRef = useRef(null);
    const mobileInputRef = useRef(null);
    const desktopInputRef = useRef(null);
    const navigate = useNavigate();

    // Debounce effect with AbortController for instant cancellation
    useEffect(() => {
        const controller = new AbortController();

        const fetchResults = async () => {
            if (query.trim().length < 2) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setIsLoading(true);
            try {
                const response = await api.get(`/api/search`, {
                    params: { q: query },
                    signal: controller.signal
                });
                
                if (response.data.success) {
                    setResults(response.data.data);
                    setIsOpen(true);
                    setHighlightedIndex(-1);
                }
            } catch (error) {
                if (error.name !== 'CanceledError' && error.name !== 'AbortError' && !api.isCancel?.(error)) {
                    console.error("Search error:", error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        const timeoutId = setTimeout(() => {
            fetchResults();
        }, 200);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [query]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
                if (mobileExpanded) {
                    setMobileExpanded(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [mobileExpanded, query]);

    // Handle Keyboard Navigation
    const handleKeyDown = (e) => {
        if (!isOpen) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                handleResultClick(results[highlightedIndex]);
            } else if (results.length > 0) {
                handleResultClick(results[0]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setMobileExpanded(false);
        }
    };

    const handleResultClick = (result) => {
        setIsOpen(false);
        setMobileExpanded(false);
        setQuery('');
        navigate(result.route);
    };

    const toggleMobileSearch = () => {
        setMobileExpanded(prev => {
            const next = !prev;
            if (next) {
                setTimeout(() => mobileInputRef.current?.focus(), 100);
            }
            return next;
        });
    };

    // Group results by type
    const groupedResults = results.reduce((acc, result) => {
        if (!acc[result.type]) acc[result.type] = [];
        acc[result.type].push(result);
        return acc;
    }, {});

    let flatIndex = 0;

    return (
        <div className={`global-search-container ${mobileExpanded ? 'mobile-active' : ''}`} ref={searchRef}>
            {/* Mobile Search Icon Button (Trigger) */}
            <button 
                type="button" 
                className="global-search-mobile-btn"
                onClick={toggleMobileSearch}
                title="Search"
            >
                <FiSearch size={18} />
            </button>

            {/* Main Search Input (Desktop bar & Mobile Overlay) */}
            <div className={`global-search-input-wrapper ${mobileExpanded ? 'mobile-expanded-bar' : ''}`}>
                {mobileExpanded && (
                    <button 
                        type="button" 
                        className="mobile-search-back-btn"
                        onClick={() => { setMobileExpanded(false); setIsOpen(false); }}
                    >
                        <FiArrowLeft size={18} />
                    </button>
                )}
                <div className="global-search-icon-left">
                    <FiSearch size={16} />
                </div>
                <input
                    ref={mobileExpanded ? mobileInputRef : desktopInputRef}
                    type="text"
                    className="global-search-input"
                    placeholder="Search patients, doctors, staff, records..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => { if (results.length > 0) setIsOpen(true); }}
                />
                <div className="global-search-icon-right">
                    {isLoading ? (
                        <FiLoader className="clear-icon animate-spin" size={16} />
                    ) : query ? (
                        <FiX className="clear-icon" size={16} onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }} />
                    ) : mobileExpanded ? (
                        <FiX className="clear-icon" size={16} onClick={() => { setMobileExpanded(false); setIsOpen(false); }} />
                    ) : null}
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && query.length >= 2 && (
                <div className="global-search-dropdown">
                    {results.length === 0 && !isLoading ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                            No matching results found.
                        </div>
                    ) : (
                        Object.keys(groupedResults).map(type => (
                            <div key={type} className="global-search-group">
                                <div className="global-search-group-title">{type}s</div>
                                {groupedResults[type].map(result => {
                                    const currentIndex = flatIndex++;
                                    return (
                                        <div
                                            key={result.id}
                                            className={`global-search-item ${currentIndex === highlightedIndex ? 'highlighted' : ''}`}
                                            onClick={() => handleResultClick(result)}
                                            onMouseEnter={() => setHighlightedIndex(currentIndex)}
                                        >
                                            <div className="global-search-item-title">{result.title}</div>
                                            <div className="global-search-item-subtitle">{result.subtitle}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
