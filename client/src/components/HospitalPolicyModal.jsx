import React, { useState, useEffect } from 'react';
import { FiX, FiChevronDown, FiChevronUp, FiShield, FiCheckCircle } from 'react-icons/fi';
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
                        setExpandedPolicyIds(new Set(fetched.map(p => p._id)));
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

    if (!isOpen) return null;

    const hospitalDisplayName = hospitalInfo?.name || contextHospitalName || 'Hospital';
    const hospitalLogo = hospitalInfo?.logo || branding?.logoUrl || branding?.logo;

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

    const areAllExpanded = filteredPolicies.length > 0 && filteredPolicies.every(p => expandedPolicyIds.has(p._id));

    const toggleExpandAll = () => {
        if (areAllExpanded) {
            setExpandedPolicyIds(new Set());
        } else {
            setExpandedPolicyIds(new Set(filteredPolicies.map(p => p._id)));
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

    return (
        <div className="hpm-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="hpm-container" onClick={(e) => e.stopPropagation()}>
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
                    <div className="hpm-category-bar">
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
                )}

                {/* Body / Policy Items */}
                <div className="hpm-body">
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
                            const isExpanded = expandedPolicyIds.has(policy._id);
                            return (
                                <div key={policy._id || idx} className="hpm-policy-card">
                                    <div
                                        className="hpm-policy-card-header"
                                        onClick={() => togglePolicy(policy._id)}
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
