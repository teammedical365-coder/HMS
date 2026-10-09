import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaChevronDown } from 'react-icons/fa6';
import './CustomSelect.css';

const CustomSelect = ({
    value,
    onChange,
    name,
    id,
    className = '',
    style = {},
    placeholder = 'Select...',
    disabled = false,
    options,
    children,
    maxVisibleItems = 3
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [openUpward, setOpenUpward] = useState(false);
    const containerRef = useRef(null);
    const dropdownRef = useRef(null);

    // Extract options from either props.options or props.children (<option> elements)
    const items = useMemo(() => {
        if (options && options.length > 0) {
            return options.map(opt => {
                if (typeof opt === 'object' && opt !== null) {
                    return {
                        value: opt.value !== undefined ? opt.value : opt.label,
                        label: opt.label !== undefined ? opt.label : opt.value,
                        disabled: !!opt.disabled
                    };
                }
                return { value: opt, label: String(opt), disabled: false };
            });
        }

        const parsed = [];
        const extractOptions = (node) => {
            if (!node) return;
            React.Children.forEach(node, child => {
                if (!child) return;
                // Handle fragments or nested arrays/containers
                if (child.type === React.Fragment || (child.props && child.props.children && child.type !== 'option')) {
                    if (child.type === React.Fragment || !child.type) {
                        extractOptions(child.props.children);
                        return;
                    }
                }
                if (child.type === 'option') {
                    const val = child.props.value !== undefined ? child.props.value : child.props.children;
                    parsed.push({
                        value: val,
                        label: child.props.children !== undefined ? child.props.children : val,
                        disabled: !!child.props.disabled
                    });
                }
            });
        };
        extractOptions(children);
        return parsed;
    }, [options, children]);

    // Dynamically elevate parent card and field so dropdown never hides behind subsequent cards
    useEffect(() => {
        if (containerRef.current) {
            const card = containerRef.current.closest('.reg-form-card');
            const field = containerRef.current.closest('.reg-field');
            if (isOpen) {
                if (card) {
                    card.classList.add('has-open-select');
                    card.style.zIndex = '50';
                }
                if (field) {
                    field.classList.add('has-open-select');
                    field.style.zIndex = '60';
                }
            } else {
                if (card) {
                    card.classList.remove('has-open-select');
                    card.style.zIndex = '';
                }
                if (field) {
                    field.classList.remove('has-open-select');
                    field.style.zIndex = '';
                }
            }
        }
    }, [isOpen]);

    // Check if dropdown should open upward or downward based on viewport space
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = (maxVisibleItems * 38) + 10;
            if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
                setOpenUpward(true);
            } else {
                setOpenUpward(false);
            }

            // Scroll to the selected item if any
            if (dropdownRef.current) {
                const selectedEl = dropdownRef.current.querySelector('.custom-select-option.selected');
                if (selectedEl) {
                    selectedEl.scrollIntoView({ block: 'nearest' });
                }
            }
        }
    }, [isOpen, maxVisibleItems]);

    // Enable direct mouse wheel scrolling on the dropdown menu
    useEffect(() => {
        if (!isOpen) return;

        const el = dropdownRef.current;
        if (!el) return;

        const handleDropdownWheel = (e) => {
            e.stopPropagation();
            el.scrollTop += e.deltaY;
            e.preventDefault();
        };

        el.addEventListener('wheel', handleDropdownWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleDropdownWheel);
        };
    }, [isOpen]);

    // Close on click outside or escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Find currently selected item
    const selectedItem = items.find(item => String(item.value) === String(value));
    const displayText = selectedItem ? selectedItem.label : (placeholder || (items[0]?.label) || 'Select...');

    const handleSelect = (item) => {
        if (item.disabled || disabled) return;
        setIsOpen(false);
        if (onChange) {
            onChange({
                target: {
                    name,
                    value: item.value
                }
            });
        }
    };

    return (
        <div 
            className={`custom-select-container ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''} ${className}`}
            style={{ position: 'relative', width: '100%', zIndex: isOpen ? 1000 : 'auto', ...style }}
            ref={containerRef}
            id={id}
        >
            <div 
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => !disabled && setIsOpen(prev => !prev)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!disabled) setIsOpen(prev => !prev);
                    }
                }}
            >
                <span className="custom-select-display">{displayText}</span>
                <FaChevronDown className={`custom-select-chevron ${isOpen ? 'rotate' : ''}`} />
            </div>

            {isOpen && (
                <div 
                    ref={dropdownRef}
                    className={`custom-select-dropdown ${openUpward ? 'upward' : ''}`}
                    style={{
                        // Exactly 3 items visible: each item is 38px + 2px borders = 116px
                        maxHeight: `${(maxVisibleItems * 38) + 2}px`
                    }}
                >
                    {items.map((item, idx) => {
                        const isSelected = String(item.value) === String(value);
                        return (
                            <div
                                key={`${item.value}-${idx}`}
                                className={`custom-select-option ${isSelected ? 'selected' : ''} ${item.disabled ? 'disabled' : ''}`}
                                onClick={() => handleSelect(item)}
                                title={typeof item.label === 'string' ? item.label : undefined}
                            >
                                {item.label}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
