import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import {
    FiGrid, FiFileText, FiCreditCard, FiSearch,
    FiMenu, FiX, FiLogOut, FiEdit3, FiCheckSquare, FiAlertOctagon, FiClock
} from 'react-icons/fi';
import './LabAdminShell.css';

const LabAdminContext = createContext(null);

export const useLabAdminSummary = () => useContext(LabAdminContext);

// Crisp tilted test-tube / pipette icon for Test Catalogue
const TestTubeNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V2" />
        <path d="M8.5 2h7" />
        <path d="M14.5 16h-5" />
    </svg>
);

// Conical laboratory flask icon for Sample Collection "Samples" navigation
const ConicalFlaskNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6" />
        <path d="M10 3v5.4a2 2 0 0 1-.4 1.2L4.7 16.5A2.5 2.5 0 0 0 6.7 20.5h10.6a2.5 2.5 0 0 0 2-4L14.4 9.6a2 2 0 0 1-.4-1.2V3" />
        <path d="M7.5 15h9" />
    </svg>
);

const getInitials = (name) => {
    const parts = String(name || 'LA').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return String(parts[0] || 'LA').slice(0, 2).toUpperCase();
};

// Strictly the 4 required Laboratory Administrator sidebar items (NO Staff items)
const LAB_ADMIN_NAV_ITEMS = [
    {
        label: 'Dashboard',
        path: '/lab/dashboard',
        icon: <FiGrid size={17} />,
        matchPaths: ['/lab/dashboard', '/lab']
    },
    {
        label: 'Test Catalogue',
        path: '/lab/catalog',
        icon: <TestTubeNavIcon size={17} />,
        matchPaths: ['/lab/catalog']
    },
    {
        label: 'Reports',
        path: '/lab/reports',
        icon: <FiFileText size={17} />,
        matchPaths: ['/lab/reports', '/lab/completed']
    },
    {
        label: 'Billing & Ledger',
        path: '/lab/billing',
        icon: <FiCreditCard size={17} />,
        matchPaths: ['/lab/billing']
    }
];

// Dedicated Sample Collection sidebar items (Dashboard + Samples only)
const SAMPLE_COLLECTION_NAV_ITEMS = [
    {
        label: 'Dashboard',
        path: '/lab/collection',
        icon: <FiGrid size={17} />,
        exact: true
    },
    {
        label: 'Samples',
        path: '/lab/collection/samples',
        icon: <ConicalFlaskNavIcon size={17} />,
        accentGreen: true,
        matchPaths: ['/lab/collection/samples', '/lab/samples', '/lab/recollections']
    }
];

// Dedicated Lab Technician sidebar items (Dashboard + Result Entry)
const LAB_TECHNICIAN_NAV_ITEMS = [
    {
        label: 'Dashboard',
        path: '/lab/bench',
        icon: <FiGrid size={17} />,
        exact: true,
        matchPaths: ['/lab/bench']
    },
    {
        label: 'Result Entry',
        path: '/lab/results/entry',
        icon: <FiEdit3 size={17} />,
        matchPaths: ['/lab/results/entry']
    }
];

// Dedicated Pathologist sidebar items (Strictly permitted Phase 7 verification & history routes)
const PATHOLOGIST_NAV_ITEMS = [
    {
        label: 'Dashboard',
        path: '/lab/verification',
        icon: <FiGrid size={17} />,
        exact: true
    },
    {
        label: 'Verification Queue',
        path: '/lab/results/verification',
        icon: <FiCheckSquare size={17} />,
        matchPaths: ['/lab/results/verification']
    },
    {
        label: 'Critical Alerts',
        path: '/lab/results/critical-alerts',
        icon: <FiAlertOctagon size={17} />,
        matchPaths: ['/lab/results/critical-alerts']
    },
    {
        label: 'Verified Results / History',
        path: '/lab/results/history',
        icon: <FiClock size={17} />,
        matchPaths: ['/lab/results/history', '/lab/results']
    }
];

const resolvePortalConfig = (user) => {
    const roleRaw = String(user?.roleName || user?._roleData?.name || user?.role || '').toLowerCase().trim();
    const isCollectionRole = (
        roleRaw.includes('phlebotomist') ||
        roleRaw.includes('sample collector') ||
        roleRaw === 'sample collection'
    );
    const isTechnicianRole = (
        (roleRaw.includes('technician') || roleRaw.includes('lab tech')) &&
        !roleRaw.includes('admin')
    );
    const isPathologistRole = (
        roleRaw.includes('pathologist') &&
        !roleRaw.includes('admin')
    );

    if (isCollectionRole) {
        return {
            mode: 'collection',
            portalTitle: 'Sample Collection',
            rolePillLabel: 'Sample Collection',
            footerRoleLabel: 'SAMPLE COLLECTION',
            homePath: '/lab/collection',
            searchFallbackPath: '/lab/collection/samples',
            navItems: SAMPLE_COLLECTION_NAV_ITEMS,
            showTenantFooter: true
        };
    }

    if (isTechnicianRole) {
        return {
            mode: 'technician',
            portalTitle: 'Lab Technician',
            rolePillLabel: 'Lab Technician',
            footerRoleLabel: 'LAB TECHNICIAN',
            homePath: '/lab/bench',
            searchFallbackPath: '/lab/bench',
            navItems: LAB_TECHNICIAN_NAV_ITEMS,
            showTenantFooter: true
        };
    }

    if (isPathologistRole) {
        return {
            mode: 'pathologist',
            portalTitle: 'Pathologist',
            rolePillLabel: 'Pathologist',
            footerRoleLabel: 'PATHOLOGIST',
            homePath: '/lab/verification',
            searchFallbackPath: '/lab/results/verification',
            navItems: PATHOLOGIST_NAV_ITEMS,
            showTenantFooter: true
        };
    }

    return {
        mode: 'admin',
        portalTitle: 'Laboratory Administrator',
        rolePillLabel: 'Laboratory Administrator',
        footerRoleLabel: 'LAB ADMIN',
        homePath: '/lab/dashboard',
        searchFallbackPath: '/lab/orders',
        navItems: LAB_ADMIN_NAV_ITEMS,
        showTenantFooter: false
    };
};

const LabAdminShell = ({ children }) => {
    const { user } = useAuth();
    const { branding, hospitalName: brandingHospitalName, hospitalId: brandingHospitalId, loadBranding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();

    useEffect(() => {
        if (user?.hospitalId && typeof loadBranding === 'function' && String(brandingHospitalId || '') !== String(user.hospitalId)) {
            loadBranding(user.hospitalId);
        }
    }, [user?.hospitalId, brandingHospitalId, loadBranding]);

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef(null);

    // Profile popover state
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);

    const fetchSummary = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res?.success && res.summary) {
                setSummary(res.summary);
            }
        } catch (err) {
            console.error('[LabAdminShell] summary fetch error:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load laboratory summary.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchSummary(false);
    }, [fetchSummary]);

    // Close popovers on outside click
    useEffect(() => {
        const onDocClick = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setSearchOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    // Live debounced search across Orders, Patient MRN, and Sample Barcodes
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (trimmed.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await labAPI.searchDashboard(trimmed);
                if (!cancelled && res?.success) {
                    setSearchResults(res.results || []);
                    setSearchOpen(true);
                }
            } catch (_) {
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 260);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [searchQuery]);

    const portalCfg = resolvePortalConfig(user);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const trimmed = searchQuery.trim();
        if (!trimmed) return;
        setSearchOpen(false);
        if (searchResults.length > 0 && searchResults[0]?.path) {
            navigate(searchResults[0].path);
        } else {
            navigate(`${portalCfg.searchFallbackPath}?search=${encodeURIComponent(trimmed)}`);
        }
    };

    const handleLogout = () => {
        setProfileOpen(false);
        try {
            localStorage.removeItem('loginTime');
        } catch (_) {}
        dispatch(logout());
        navigate('/login');
    };

    const actualHospitalName = (brandingHospitalName && brandingHospitalName !== 'Medical 365')
        ? brandingHospitalName
        : (summary?.hospitalName || brandingHospitalName || 'Medical 365');
    const customTenantLogo = branding?.logoUrl || branding?.logo || summary?.logoUrl || '';
    const [logoFallbackStep, setLogoFallbackStep] = useState(0);

    useEffect(() => {
        setLogoFallbackStep(0);
    }, [customTenantLogo]);

    const resolvedLogoSrc = logoFallbackStep === 0
        ? (customTenantLogo || '/assets/logo.png')
        : logoFallbackStep === 1
            ? '/assets/logo.png'
            : '/logo.png';

    // Single-winner active route matcher (prevents parent + child routes from ever highlighting together)
    const activeItemPath = (() => {
        const pathname = location.pathname;
        let bestPath = null;
        let bestScore = -1;

        for (const item of portalCfg.navItems) {
            if (item.exact) {
                if (pathname === item.path && 1000 > bestScore) {
                    bestScore = 1000;
                    bestPath = item.path;
                }
                continue;
            }

            const candidates = Array.isArray(item.matchPaths) && item.matchPaths.length > 0
                ? item.matchPaths
                : [item.path];

            for (const mp of candidates) {
                if (mp === '/lab') {
                    if (pathname === '/lab' && 900 > bestScore) {
                        bestScore = 900;
                        bestPath = item.path;
                    }
                } else if (pathname === mp) {
                    const score = 1000 + mp.length;
                    if (score > bestScore) {
                        bestScore = score;
                        bestPath = item.path;
                    }
                } else if (pathname.startsWith(`${mp}/`)) {
                    const score = mp.length;
                    if (score > bestScore) {
                        bestScore = score;
                        bestPath = item.path;
                    }
                }
            }
        }
        return bestPath;
    })();

    return (
        <LabAdminContext.Provider value={{ summary, loading, refreshing, error, refreshSummary: () => fetchSummary(true) }}>
            <div className="lms-admin-shell">
                {/* Fixed Left Sidebar Using Actual Medical365 Hospital Branding */}
                <aside className={`lms-admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
                    <div className="lms-sidebar-brand">
                        <NavLink to={portalCfg.homePath} end className={() => 'lms-brand-identity'} onClick={() => setSidebarOpen(false)}>
                            {logoFallbackStep < 3 ? (
                                <img
                                    className={`lms-brand-logo ${!customTenantLogo ? 'lms-brand-logo-default' : ''}`}
                                    src={resolvedLogoSrc}
                                    alt={actualHospitalName}
                                    onError={() => setLogoFallbackStep((prev) => prev + 1)}
                                    style={!customTenantLogo ? { width: 'auto', maxWidth: '148px', height: '32px', borderRadius: 0, background: 'transparent', border: 'none', padding: 0 } : undefined}
                                />
                            ) : (
                                <span
                                    className="lms-brand-fallback-mark"
                                    aria-hidden="true"
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '34px', padding: '0 10px', borderRadius: '8px', background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: '12px' }}
                                >
                                    M365
                                </span>
                            )}
                            {(customTenantLogo || actualHospitalName !== 'Medical 365') && (
                                <div className="lms-brand-meta">
                                    <span className="lms-brand-name" title={actualHospitalName}>{actualHospitalName}</span>
                                </div>
                            )}
                        </NavLink>
                        <button
                            type="button"
                            className="lms-sidebar-close-mobile"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close navigation"
                        >
                            <FiX size={20} />
                        </button>
                    </div>

                    <nav className="lms-sidebar-nav" aria-label={`${portalCfg.portalTitle} Navigation`}>
                        {portalCfg.navItems.map((item) => {
                            const active = activeItemPath === item.path;
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    end
                                    className={() => `lms-nav-link ${active ? 'active' : ''} ${active && item.accentGreen ? 'active-emerald' : ''}`}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <span className="lms-nav-icon">{item.icon}</span>
                                    <span>{item.label}</span>
                                </NavLink>
                            );
                        })}
                    </nav>

                    {portalCfg.showTenantFooter && (
                        <div className="lms-sidebar-footer">
                            <div className="lms-sidebar-tenant-pill">
                                <span className="lms-tenant-live-dot" aria-hidden="true" />
                                <div className="lms-tenant-texts">
                                    <span className="lms-tenant-title" title={actualHospitalName}>{actualHospitalName}</span>
                                    <span className="lms-tenant-role">{portalCfg.footerRoleLabel}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Mobile Backdrop */}
                <div
                    className={`lms-mobile-backdrop ${sidebarOpen ? 'show' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                />

                {/* Right Main Column */}
                <div className="lms-admin-main">
                    {/* Top Header */}
                    <header className="lms-admin-topbar">
                        <div className="lms-topbar-left">
                            <button
                                type="button"
                                className="lms-mobile-menu-btn"
                                onClick={() => setSidebarOpen(true)}
                                aria-label="Open laboratory menu"
                            >
                                <FiMenu size={19} />
                            </button>
                            <div className="lms-topbar-title-group">
                                <h1 className="lms-topbar-title">{portalCfg.portalTitle}</h1>
                                <span className="lms-portal-badge">PORTAL</span>
                            </div>
                        </div>

                        <div className="lms-topbar-right">
                            {/* Global Lab Search Bar */}
                            <div className="lms-search-wrap" ref={searchRef}>
                                <form className="lms-search-form" onSubmit={handleSearchSubmit}>
                                    <FiSearch className="lms-search-icon" />
                                    <input
                                        type="text"
                                        className="lms-search-input"
                                        placeholder="Search orders, patient MRN, sample barcode"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            if (e.target.value.trim().length >= 2) setSearchOpen(true);
                                        }}
                                        onFocus={() => {
                                            if (searchQuery.trim().length >= 2) setSearchOpen(true);
                                        }}
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            className="lms-search-clear"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setSearchResults([]);
                                                setSearchOpen(false);
                                            }}
                                            aria-label="Clear search"
                                        >
                                            <FiX size={14} />
                                        </button>
                                    )}
                                </form>

                                {searchOpen && searchQuery.trim().length >= 2 && (
                                    <div className="lms-search-dropdown">
                                        {searching ? (
                                            <div className="lms-search-empty">Searching laboratory records...</div>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map((item) => (
                                                <button
                                                    key={`${item.category}-${item.id}`}
                                                    type="button"
                                                    className="lms-search-item"
                                                    onClick={() => {
                                                        setSearchOpen(false);
                                                        navigate(item.path);
                                                    }}
                                                >
                                                    <div>
                                                        <div className="lms-search-item-title">{item.title}</div>
                                                        <div className="lms-search-item-sub">{item.subtitle}</div>
                                                    </div>
                                                    <span className="lms-search-cat-tag">{item.category}</span>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="lms-search-empty">
                                                No matching orders, MRNs or barcodes found.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* User Profile Avatar */}
                            <div className="lms-profile-wrap lms-topbar-right-avatar-slot" ref={profileRef}>
                                <button
                                    type="button"
                                    className="lms-avatar-btn"
                                    onClick={() => setProfileOpen((prev) => !prev)}
                                    title={user?.name || portalCfg.portalTitle}
                                    aria-label="User profile menu"
                                >
                                    {user?.avatar ? (
                                        <img src={user.avatar} alt={user.name || 'User'} />
                                    ) : (
                                        <span>{getInitials(user?.name)}</span>
                                    )}
                                </button>

                                {profileOpen && (
                                    <div className="lms-profile-popover">
                                        <div className="lms-profile-head">
                                            <div className="lms-profile-name">{user?.name || portalCfg.portalTitle}</div>
                                            {user?.email && <div className="lms-profile-email">{user.email}</div>}
                                            <span className="lms-profile-role-pill">{portalCfg.rolePillLabel}</span>
                                        </div>
                                        <button type="button" className="lms-logout-btn" onClick={handleLogout}>
                                            <FiLogOut size={14} />
                                            <span>Sign Out</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Main Page Content */}
                    <main className="lms-admin-canvas">
                        {children}
                    </main>
                </div>
            </div>
        </LabAdminContext.Provider>
    );
};

export default LabAdminShell;
