import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiChevronDown, FiChevronUp, FiShield, FiCheckCircle, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { policyAPI } from '../utils/api';
import { useBranding } from '../context/BrandingContext';
import './HospitalPolicyModal.css';

const HospitalPolicyModal = ({
    isOpen,
    onClose,
    onAccept,
    onAgree,
    hospitalId: propHospitalId,
    applicableTo = 'ALL',
    alreadyAccepted = false
}) => {
    const { hospitalName: contextHospitalName, branding, hospitalId: contextHospitalId } = useBranding();
    const activeHospitalId = propHospitalId || contextHospitalId || localStorage.getItem('hospitalBrandingId');

    const [policies, setPolicies] = useState([]);
    const [hospitalInfo, setHospitalInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [expandedPolicyIds, setExpandedPolicyIds] = useState(new Set());
    const [isAgreedChecked, setIsAgreedChecked] = useState(alreadyAccepted);

    const categoryBarRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        setIsAgreedChecked(alreadyAccepted);
    }, [alreadyAccepted]);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const fetchPolicies = async () => {
            setLoading(true);
            setError('');
            try {
                const params = {};
                if (activeHospitalId) params.hospitalId = activeHospitalId;
                if (applicableTo && applicableTo !== 'ALL') params.applicableTo = applicableTo;

                const res = await policyAPI.getActivePolicies(params);
                if (isMounted) {
                    if (res && res.success) {
                        const fetched = res.policies || [];
                        setPolicies(fetched);
                        setHospitalInfo(res.hospital || null);
                        // Expand all policies by default so full content is immediately visible
                        setExpandedPolicyIds(new Set(fetched.map((p, idx) => String(p?._id || p?.id || p?.slug || idx))));
                    } else {
                        setError(res?.message || 'Failed to load policies.');
                    }
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Failed to load active policies:', err);
                    setError('Policies currently unavailable. Please check your network.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchPolicies();

        return () => {
            isMounted = false;
        };
    }, [isOpen, activeHospitalId, applicableTo]);

    const hospitalDisplayName = hospitalInfo?.name || contextHospitalName || 'Hospital';
    const hospitalLogo = hospitalInfo?.logo || branding?.logoUrl || branding?.logo;

    const getPolicyKey = (p, idx) => String(p?._id || p?.id || p?.slug || idx);

    // Filter by selected category chip
    const filteredPolicies = selectedCategory === 'ALL'
        ? policies
        : policies.filter(p => p.category === selectedCategory);

    const categories = ['ALL', ...new Set(policies.map(p => p.category).filter(Boolean))];

    const togglePolicy = (id) => {
        setExpandedPolicyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const areAllExpanded = filteredPolicies.length > 0 && filteredPolicies.every((p, idx) => expandedPolicyIds.has(getPolicyKey(p, idx)));

    const toggleExpandAll = () => {
        if (areAllExpanded) {
            setExpandedPolicyIds(new Set());
        } else {
            setExpandedPolicyIds(new Set(filteredPolicies.map((p, idx) => getPolicyKey(p, idx))));
        }
    };

    const checkCategoryScroll = () => {
        if (categoryBarRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = categoryBarRef.current;
            setCanScrollLeft(scrollLeft > 6);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(checkCategoryScroll, 120);
        const el = categoryBarRef.current;
        if (el) {
            el.addEventListener('scroll', checkCategoryScroll, { passive: true });
            window.addEventListener('resize', checkCategoryScroll);
            return () => {
                clearTimeout(timer);
                el.removeEventListener('scroll', checkCategoryScroll);
                window.removeEventListener('resize', checkCategoryScroll);
            };
        }
        return () => clearTimeout(timer);
    }, [isOpen, categories, selectedCategory]);

    const scrollCategories = (direction) => {
        if (categoryBarRef.current) {
            const scrollAmount = direction === 'left' ? -220 : 220;
            categoryBarRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    const handleCategoryWheel = (e) => {
        if (categoryBarRef.current) {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                categoryBarRef.current.scrollLeft += e.deltaY;
                checkCategoryScroll();
            }
        }
    };

    const handleAcceptAndClose = () => {
        if (onAccept) {
            onAccept(policies);
        }
        if (onAgree) {
            onAgree(policies);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="hpm-overlay" onClick={onClose} role="dialog" aria-modal="true" data-lenis-prevent="true">
            <div className="hpm-container" onClick={(e) => e.stopPropagation()} data-lenis-prevent="true">
                {/* Header */}
                <div className="hpm-header">
                    <div className="hpm-header-left">
                        {hospitalLogo ? (
                            <img src={hospitalLogo} alt={hospitalDisplayName} className="hpm-hospital-logo" />
                        ) : (
                            <div className="hpm-hospital-icon-fallback">🏥</div>
                        )}
                        <div className="hpm-title-group">
                            <h2>{hospitalDisplayName}</h2>
                            <p>
                                <span>Terms of Service & Hospital Policies</span>
                                <span className="hpm-badge-count">{policies.length} Active Policies</span>
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {filteredPolicies.length > 0 && (
                            <button
                                type="button"
                                className="hpm-expand-all-btn"
                                onClick={toggleExpandAll}
                                title={areAllExpanded ? 'Collapse All Policies' : 'Expand All Policies'}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    color: '#ffffff',
                                    borderRadius: '8px',
                                    padding: '5px 12px',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {areAllExpanded ? '⊟ Collapse All' : '⊞ Expand All'}
                            </button>
                        )}
                        <button className="hpm-close-btn" onClick={onClose} aria-label="Close modal">
                            <FiX size={20} />
                        </button>
                    </div>
                </div>

                {/* Category filter bar (if multiple categories present) */}
                {categories.length > 2 && (
                    <div className="hpm-category-nav-wrapper" data-lenis-prevent="true">
                        {canScrollLeft && (
                            <button
                                type="button"
                                className="hpm-cat-arrow-btn left"
                                onClick={() => scrollCategories('left')}
                                title="Scroll categories left"
                                aria-label="Scroll categories left"
                            >
                                <FiChevronLeft size={16} />
                            </button>
                        )}
                        <div
                            ref={categoryBarRef}
                            className="hpm-category-bar"
                            onWheel={handleCategoryWheel}
                            data-lenis-prevent="true"
                        >
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    className={`hpm-cat-chip ${selectedCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                >
                                    {cat === 'ALL' ? 'All Policies' : cat}
                                </button>
                            ))}
                        </div>
                        {canScrollRight && (
                            <button
                                type="button"
                                className="hpm-cat-arrow-btn right"
                                onClick={() => scrollCategories('right')}
                                title="Scroll categories right"
                                aria-label="Scroll categories right"
                            >
                                <FiChevronRight size={16} />
                            </button>
                        )}
                    </div>
                )}

                {/* Body / Policy Items */}
                <div className="hpm-body" data-lenis-prevent="true">
                    {loading ? (
                        <div className="hpm-empty-state">
                            <div className="ha-ai-spinner" style={{ margin: '0 auto 12px' }} />
                            <p>Loading {hospitalDisplayName} policies...</p>
                        </div>
                    ) : error ? (
                        <div className="hpm-empty-state" style={{ color: '#b91c1c' }}>
                            <p>{error}</p>
                        </div>
                    ) : filteredPolicies.length === 0 ? (
                        <div className="hpm-empty-state">
                            <div className="hpm-empty-icon">📜</div>
                            <p>No active policies configured for {hospitalDisplayName}.</p>
                        </div>
                    ) : (
                        filteredPolicies.map((policy, idx) => {
                            const policyKey = getPolicyKey(policy, idx);
                            const isExpanded = expandedPolicyIds.has(policyKey);
                            return (
                                <div key={policyKey} className={`hpm-policy-card ${isExpanded ? 'is-expanded' : ''}`}>
                                    <div
                                        className="hpm-policy-card-header"
                                        onClick={() => togglePolicy(policyKey)}
                                    >
                                        <div className="hpm-policy-card-title">
                                            <span className="hpm-policy-index">{idx + 1}</span>
                                            <h4 className="hpm-policy-name">{policy.title}</h4>
                                        </div>
                                        <div className="hpm-policy-tags">
                                            <span className="hpm-tag-category">{policy.category}</span>
                                            {policy.isMandatory && (
                                                <span className="hpm-tag-mandatory">Mandatory</span>
                                            )}
                                            <span className="hpm-tag-version">v{policy.version || 1}</span>
                                            {isExpanded ? <FiChevronUp size={18} color="#64748b" /> : <FiChevronDown size={18} color="#64748b" />}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <>
                                            <div className="hpm-policy-content">
                                                {policy.content}
                                            </div>
                                            <div className="hpm-policy-footer">
                                                <span>Version {policy.version || 1}</span>
                                                <span>Last updated: {policy.updatedAt ? new Date(policy.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Action Bar */}
                <div className="hpm-footer">
                    <label className="hpm-agreement-confirm">
                        <input
                            type="checkbox"
                            checked={isAgreedChecked}
                            onChange={(e) => setIsAgreedChecked(e.target.checked)}
                        />
                        <span>I have read and agree to {hospitalDisplayName}'s policies</span>
                    </label>

                    <div className="hpm-btn-group">
                        <button type="button" className="hpm-btn-secondary" onClick={onClose}>
                            Close
                        </button>
                        <button
                            type="button"
                            className="hpm-btn-primary"
                            disabled={!isAgreedChecked}
                            onClick={handleAcceptAndClose}
                        >
                            <FiCheckCircle style={{ marginRight: '6px' }} />
                            Confirm Agreement
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HospitalPolicyModal;
