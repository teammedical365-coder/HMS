import React, { useState, useMemo } from 'react';
import {
    FiShield, FiUserCheck, FiActivity, FiClipboard,
    FiGrid, FiDollarSign, FiArrowRight, FiLock, FiInfo, FiSearch, FiUsers
} from 'react-icons/fi';
import { PACIFIC_ROLE_FILTERS, PACIFIC_CATEGORY_STYLE } from '../../utils/pacificDemo';
import './PacificDemoLogin.css';

const ROLE_ICONS = {
    hospitaladmin: <FiGrid size={18} />,
    doctor: <FiActivity size={18} />,
    reception: <FiClipboard size={18} />,
    lab: <FiUserCheck size={18} />,
    accountant: <FiDollarSign size={18} />
};

const CORE_CATEGORIES = new Set(['hospitaladmin', 'doctor', 'reception', 'lab', 'accountant', 'nurse', 'pharmacy']);

/**
 * PacificDemoLogin — Direct Account Selection Portal for Pacific Hospital ONLY.
 * Dynamically lists every active existing Pacific Hospital staff & doctor account
 * so visitors can access each user's ORIGINAL Medical365 dashboard with 1 click.
 */
const PacificDemoLogin = ({
    hospital,
    accounts = [],
    loading = false,
    error = null,
    onSelectAccount,
    onShowStandardLogin
}) => {
    const [pendingUserId, setPendingUserId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const handleAccountClick = (account) => {
        if (loading) return;
        setPendingUserId(account.userId);
        if (onSelectAccount) onSelectAccount(account);
    };

    const filteredAccounts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return accounts.filter((acc) => {
            if (roleFilter === 'other') {
                if (CORE_CATEGORIES.has(acc.roleCategory)) return false;
            } else if (roleFilter !== 'all' && acc.roleCategory !== roleFilter) {
                return false;
            }
            if (!q) return true;
            const hay = `${acc.name} ${acc.roleName} ${(acc.departments || []).join(' ')} ${acc.specialty || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [accounts, roleFilter, searchQuery]);

    const availableFilters = useMemo(() => {
        return PACIFIC_ROLE_FILTERS.filter((f) => {
            if (f.key === 'all') return true;
            if (f.key === 'other') return accounts.some((a) => !CORE_CATEGORIES.has(a.roleCategory));
            return accounts.some((a) => a.roleCategory === f.key);
        });
    }, [accounts]);

    const hospitalName = hospital?.name || 'Pacific Hospital';
    const logoUrl = hospital?.branding?.logoUrl || '/assets/logo.png';

    return (
        <div className="pacific-demo-page">
            <div className="pacific-demo-bg-glow pacific-glow-1" aria-hidden="true" />
            <div className="pacific-demo-bg-glow pacific-glow-2" aria-hidden="true" />

            <div className="pacific-demo-container pacific-demo-container-wide">
                {/* Left Overview Panel */}
                <div className="pacific-demo-hero">
                    <div className="pacific-demo-brand-row">
                        <img
                            src={logoUrl}
                            alt={hospitalName}
                            className="pacific-demo-logo"
                            onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/assets/logo.png';
                            }}
                        />
                        <div className="pacific-demo-live-pill">
                            <span className="pacific-live-dot" />
                            <span>LIVE INTERACTIVE DEMO</span>
                        </div>
                    </div>

                    <h1 className="pacific-demo-title">
                        {hospitalName}
                        <span>Direct Staff &amp; Doctor Portal Access</span>
                    </h1>

                    <p className="pacific-demo-subtitle">
                        Select any registered {hospitalName} account to open its original Medical365 dashboard with live hospital data — no OTP, username, or password entry required.
                    </p>

                    <div className="pacific-demo-highlights">
                        <div className="pacific-highlight-item">
                            <FiShield className="pacific-hl-icon" />
                            <div>
                                <strong>Tenant-Isolated Sandbox</strong>
                                <span>Exclusively enabled for Pacific Hospital with persistent sidebar account switching.</span>
                            </div>
                        </div>
                        <div className="pacific-highlight-item">
                            <FiLock className="pacific-hl-icon" />
                            <div>
                                <strong>Backend-Verified Demo Sessions</strong>
                                <span>Uses original database accounts, role permissions, and real hospital records.</span>
                            </div>
                        </div>
                    </div>

                    <div className="pacific-demo-sandbox-note">
                        <FiInfo size={16} />
                        <span>
                            External SMS/WhatsApp dispatches and live payment processing are safely disabled in this demo environment.
                        </span>
                    </div>
                </div>

                {/* Right Dynamic Account Selection Panel */}
                <div className="pacific-demo-card">
                    <div className="pacific-card-head">
                        <div>
                            <span className="pacific-card-eyebrow">PACIFIC HOSPITAL ACCOUNTS ({accounts.length})</span>
                            <h2>Select Account to Access Dashboard</h2>
                        </div>
                        <span className="pacific-no-otp-chip">OTP-Free Demo</span>
                    </div>

                    {error && (
                        <div className="pacific-demo-error" role="alert">
                            {typeof error === 'string' ? error : (error?.message || 'Unable to launch demo session.')}
                        </div>
                    )}

                    {/* Search & Role Filter Controls */}
                    <div className="pacific-account-toolbar">
                        <div className="pacific-account-search">
                            <FiSearch size={15} className="pacific-search-icon" />
                            <input
                                type="text"
                                placeholder="Search by name, role, or department..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                aria-label="Search Pacific Hospital accounts"
                            />
                        </div>
                        <div className="pacific-filter-pills" role="tablist" aria-label="Filter by role">
                            {availableFilters.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    className={`pacific-filter-pill ${roleFilter === f.key ? 'active' : ''}`}
                                    onClick={() => setRoleFilter(f.key)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pacific-account-list">
                        {filteredAccounts.length === 0 ? (
                            <div className="pacific-account-empty">
                                No matching Pacific Hospital users found.
                            </div>
                        ) : (
                            filteredAccounts.map((acc) => {
                                const styleMeta = PACIFIC_CATEGORY_STYLE[acc.roleCategory] || PACIFIC_CATEGORY_STYLE.staff;
                                const isBusy = loading && pendingUserId === acc.userId;
                                const deptLabel = acc.departments?.length > 0
                                    ? acc.departments.join(', ')
                                    : (acc.specialty || 'Hospital Operations');

                                return (
                                    <div key={acc.userId} className="pacific-account-row">
                                        <div
                                            className="pacific-role-icon"
                                            style={{ backgroundColor: `${styleMeta.accent}15`, color: styleMeta.accent }}
                                        >
                                            {ROLE_ICONS[acc.roleCategory] || <FiUsers size={18} />}
                                        </div>
                                        <div className="pacific-role-body">
                                            <div className="pacific-role-top">
                                                <span className="pacific-role-name">{acc.name}</span>
                                                <span
                                                    className="pacific-role-badge"
                                                    style={{ color: styleMeta.accent, backgroundColor: `${styleMeta.accent}15` }}
                                                >
                                                    {acc.roleName}
                                                </span>
                                            </div>
                                            <p className="pacific-role-desc">{deptLabel}</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="pacific-access-btn"
                                            disabled={loading}
                                            onClick={() => handleAccountClick(acc)}
                                            data-user-id={acc.userId}
                                        >
                                            {isBusy ? (
                                                <span className="pacific-spinner" aria-label="Signing in" />
                                            ) : (
                                                <>
                                                    <span>Access Dashboard</span>
                                                    <FiArrowRight size={14} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {onShowStandardLogin && (
                        <div className="pacific-card-footer">
                            <button
                                type="button"
                                className="pacific-staff-login-link"
                                onClick={onShowStandardLogin}
                            >
                                Pacific Hospital Staff? Sign in manually with Email &amp; OTP →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PacificDemoLogin;
