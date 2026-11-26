import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import {
    FiGrid, FiFileText, FiCreditCard, FiSearch,
    FiMenu, FiX, FiLogOut
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

// Dedicated Lab Technician sidebar items (Dashboard only)
const LAB_TECHNICIAN_NAV_ITEMS = [
    {
        label: 'Dashboard',
        path: '/lab/bench',
        icon: <FiGrid size={17} />,
        matchPaths: ['/lab/bench']
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
    const hospitalLogoUrl = branding?.logoUrl || branding?.logo || summary?.logoUrl || '/assets/logo.png';

    const isItemActive = (item) => {
        if (item.exact) {
            return location.pathname === item.path;
        }
        if (Array.isArray(item.matchPaths) && item.matchPaths.some((mp) => (
            mp === '/lab'
                ? location.pathname === '/lab'
                : (location.pathname === mp || location.pathname.startsWith(`${mp}/`))
        ))) {
            return true;
        }
        return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    };

    return (
        <LabAdminContext.Provider value={{ summary, loading, refreshing, error, refreshSummary: () => fetchSummary(true) }}>
            <div className="lms-admin-shell">
                {/* Fixed Left Sidebar Using Actual Medical365 Hospital Branding */}
                <aside className={`lms-admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
                    <div className="lms-sidebar-brand">
                        <NavLink to={portalCfg.homePath} className="lms-brand-identity" onClick={() => setSidebarOpen(false)}>
                            <img
                                className="lms-brand-logo"
                                src={hospitalLogoUrl}
                                alt={actualHospitalName}
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = '/logo.png';
                                }}
                            />
                            <div className="lms-brand-meta">
                                <span className="lms-brand-name" title={actualHospitalName}>{actualHospitalName}</span>
                                <span className="lms-brand-sub">Medical365 HMS</span>
                            </div>
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
                            const active = isItemActive(item);
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={`lms-nav-link ${active ? 'active' : ''} ${active && item.accentGreen ? 'active-emerald' : ''}`}
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
