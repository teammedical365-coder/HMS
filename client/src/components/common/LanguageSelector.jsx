import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaGlobe, FaChevronDown, FaCheck, FaMagnifyingGlass } from 'react-icons/fa6';
import { SUPPORTED_LANGUAGES } from '../../utils/questionLibraryI18n';
import './LanguageSelector.css';

const LanguageSelector = ({ currentLang = 'en', onLanguageChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [menuPos, setMenuPos] = useState(null);
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    const portalMenuRef = useRef(null);

    const activeLanguage = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

    const isTabletViewport = () => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth >= 768 && window.innerWidth <= 1366;
    };

    const updateMenuPosition = useCallback(() => {
        if (!triggerRef.current || typeof window === 'undefined') return;
        const rect = triggerRef.current.getBoundingClientRect();
        const vw = window.visualViewport?.width || window.innerWidth;
        const vh = window.visualViewport?.height || window.innerHeight;
        const offsetTop = window.visualViewport?.offsetTop || 0;
        const menuWidth = 268;
        const margin = 12;

        const left = Math.max(margin, Math.min(rect.right - menuWidth, vw - menuWidth - margin));
        const spaceBelow = vh - (rect.bottom - offsetTop) - margin;
        const spaceAbove = (rect.top - offsetTop) - margin;
        const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;
        const availableHeight = Math.max(180, Math.min(340, (openUpward ? spaceAbove : spaceBelow) - 8));
        const listMaxHeight = Math.max(130, availableHeight - 48);

        setMenuPos({
            top: openUpward ? undefined : Math.round(rect.bottom + 6),
            bottom: openUpward ? Math.round(window.innerHeight - rect.top + 6) : undefined,
            left: Math.round(left),
            width: menuWidth,
            listMaxHeight
        });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        if (isTabletViewport()) {
            updateMenuPosition();
        } else {
            setMenuPos(null);
        }

        const handleClickOutside = (event) => {
            const clickedTrigger = dropdownRef.current && dropdownRef.current.contains(event.target);
            const clickedPortal = portalMenuRef.current && portalMenuRef.current.contains(event.target);
            if (!clickedTrigger && !clickedPortal) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        const handleReposition = () => {
            if (isTabletViewport()) updateMenuPosition();
        };

        document.addEventListener('pointerdown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, true);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleReposition);
        }

        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleReposition);
            window.removeEventListener('scroll', handleReposition, true);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleReposition);
            }
        };
    }, [isOpen, updateMenuPosition]);

    const filteredLanguages = SUPPORTED_LANGUAGES.filter(lang => 
        lang.name.toLowerCase().includes(search.toLowerCase()) || 
        lang.native.toLowerCase().includes(search.toLowerCase()) ||
        lang.code.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (code) => {
        onLanguageChange(code);
        setIsOpen(false);
        setSearch('');
    };

    const useTabletPortal = isOpen && isTabletViewport() && menuPos;

    const menuContent = (
        <div
            ref={portalMenuRef}
            className={`ql-lang-dropdown-menu ${useTabletPortal ? 'ql-lang-portal-tablet' : ''}`}
            style={useTabletPortal ? {
                position: 'fixed',
                top: menuPos.top !== undefined ? `${menuPos.top}px` : 'auto',
                bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : 'auto',
                left: `${menuPos.left}px`,
                right: 'auto',
                width: `${menuPos.width}px`,
                zIndex: 100050
            } : undefined}
            data-lenis-prevent
        >
            <div className="ql-lang-search-box">
                <FaMagnifyingGlass className="ql-lang-search-icon" />
                <input 
                    type="text" 
                    placeholder="Search language / भाषा खोजें..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus={!isTabletViewport()}
                />
            </div>
            <div 
                className="ql-lang-list" 
                style={useTabletPortal ? { maxHeight: `${menuPos.listMaxHeight}px` } : undefined}
                data-lenis-prevent
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
            >
                {filteredLanguages.map(lang => {
                    const isSelected = lang.code === currentLang;
                    return (
                        <button
                            key={lang.code}
                            type="button"
                            className={`ql-lang-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelect(lang.code)}
                        >
                            <span className="ql-lang-item-flag">{lang.flag}</span>
                            <div className="ql-lang-item-info">
                                <span className="ql-lang-item-native">{lang.native}</span>
                                <span className="ql-lang-item-english">{lang.name}</span>
                            </div>
                            {isSelected && <FaCheck className="ql-lang-check-icon" />}
                        </button>
                    );
                })}
                {filteredLanguages.length === 0 && (
                    <div className="ql-lang-no-results">No languages found</div>
                )}
            </div>
        </div>
    );

    return (
        <div className="ql-lang-selector-wrapper" ref={dropdownRef}>
            <button 
                ref={triggerRef}
                className={`ql-lang-trigger-btn ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                title={`Language: ${activeLanguage.name} (${activeLanguage.native})`}
            >
                <span className="ql-lang-icon-wrap"><FaGlobe /></span>
                <span className="ql-lang-flag">{activeLanguage.flag}</span>
                <span className="ql-lang-short-code">{activeLanguage.code.toUpperCase()}</span>
                <FaChevronDown className={`ql-lang-chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (useTabletPortal ? createPortal(menuContent, document.body) : menuContent)}
        </div>
    );
};

export default LanguageSelector;
