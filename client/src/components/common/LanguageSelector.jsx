import React, { useState, useRef, useEffect } from 'react';
import { FaGlobe, FaChevronDown, FaCheck, FaMagnifyingGlass } from 'react-icons/fa6';
import { SUPPORTED_LANGUAGES } from '../../utils/questionLibraryI18n';
import './LanguageSelector.css';

const LanguageSelector = ({ currentLang = 'en', onLanguageChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef(null);

    const activeLanguage = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    return (
        <div className="ql-lang-selector-wrapper" ref={dropdownRef}>
            <button 
                className={`ql-lang-trigger-btn ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                type="button"
                title={`Language: ${activeLanguage.name} (${activeLanguage.native})`}
            >
                <span className="ql-lang-icon-wrap"><FaGlobe /></span>
                <span className="ql-lang-flag">{activeLanguage.flag}</span>
                <span className="ql-lang-short-code">{activeLanguage.code.toUpperCase()}</span>
                <FaChevronDown className={`ql-lang-chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="ql-lang-dropdown-menu">
                    <div className="ql-lang-search-box">
                        <FaMagnifyingGlass className="ql-lang-search-icon" />
                        <input 
                            type="text" 
                            placeholder="Search language / भाषा खोजें..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="ql-lang-list">
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
            )}
        </div>
    );
};

export default LanguageSelector;
