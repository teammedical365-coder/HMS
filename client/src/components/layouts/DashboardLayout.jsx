import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import {
    FiHome, FiUsers, FiCalendar, FiActivity, FiPackage,
    FiSettings, FiLogOut, FiPieChart, FiClipboard,
    FiFileText, FiPlusSquare, FiDatabase, FiGrid, FiShield, FiMenu, FiX,
    FiClock, FiBox, FiUserCheck, FiHeart, FiCheckCircle, FiUser,
    FiChevronDown, FiChevronRight
} from 'react-icons/fi';
import GlobalSearch from '../GlobalSearch';
import './DashboardLayout.css';

const DashboardSidebar = memo(({ isOpen, setOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const role = (user?.role || '').toLowerCase();
    const location = useLocation();
    const navigate = useNavigate();
    const isCentralAdmin = (role === 'centraladmin' || role === 'superadmin');
    
    // Memoized Categorized Menus
    const menuItems = useMemo(() => {
        const isOTRoute = location.pathname.startsWith('/ot') || location.pathname === '/ot-dashboard';
        const roleClean = role.replace(/\s+/g, '');

        if (roleClean === 'otmanager' || roleClean === 'otstaff' || (isOTRoute && (role === 'hospitaladmin' || role === 'centraladmin' || role === 'superadmin' || role === 'doctor'))) {
            return [
                { label: 'OT Dashboard', path: '/ot/dashboard', icon: <FiHome /> },
                { label: 'Planned Surgeries', path: '/ot/planned', icon: <FiClock /> },
                { label: 'OT Schedule', path: '/ot/schedule', icon: <FiCalendar /> },
                { label: 'OT Rooms', path: '/ot/rooms', icon: <FiBox /> },
                { label: 'Pre-Op Patients', path: '/ot/pre-op', icon: <FiUserCheck /> },
                { label: 'In OT', path: '/ot/in-progress', icon: <FiActivity /> },
                { label: 'Post-Op', path: '/ot/post-op', icon: <FiHeart /> },
                { label: 'Completed Surgeries', path: '/ot/completed', icon: <FiCheckCircle /> },
                { label: 'Surgeons', path: '/ot/surgeons', icon: <FiUser /> },
                { label: 'OT Reports', path: '/ot/reports', icon: <FiFileText /> }
            ];
        }

        if (role === 'centraladmin' || role === 'superadmin') {
            return [
                { label: 'System Overview', path: '/supremeadmin', icon: <FiHome /> },
                { label: 'Question Library', path: '/admin/question-library', icon: <FiFileText /> },
                { label: 'Consent Hub', path: '/admin/consent', icon: <FiClipboard /> },
                { label: 'Role & Permissions', path: '/admin/roles', icon: <FiShield /> },
                { label: 'Manage All Staff', path: '/admin/users', icon: <FiUsers /> },
            ];
        }
        if (role === 'hospitaladmin') {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            if (u.clinicType === 'clinic' || u.subscriptionPlan === 'starter') {
                // Simple clinic or starter plan — single hub page with built-in role switcher
                return [
                    { label: 'Clinic Hub', path: '/hospitaladmin', icon: <FiHome /> },
                    { label: 'Vial Management', path: '/hospitaladmin/vials', icon: <FiBox /> },
                ];
            }
            return [
                { label: 'Hospital Overview', path: '/hospitaladmin', icon: <FiHome /> },
                { label: 'Vial Management', path: '/hospitaladmin/vials', icon: <FiBox /> },
                { label: 'Clinical Questions', path: '/hospitaladmin/question-library', icon: <FiFileText /> },
                { label: 'Staff Management', path: '/admin/users', icon: <FiUsers /> },
                { label: 'Doctors Feed', path: '/admin/doctors', icon: <FiActivity /> },
                { label: 'Pharma Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
            ];
        }
        if (role === 'doctor' || role === 'clinic doctor') {
            return [
                { label: 'Dashboard', path: '/my-dashboard', icon: <FiHome /> },
                { label: 'My Patients', path: '/doctor/patients', icon: <FiUsers /> },
                { label: 'AI Assistant', path: '/doctor/ai-assistant', icon: <FiFileText /> },
                { label: 'Reports', path: '/lab-reports', icon: <FiFileText /> },
            ];
        }
        if (role === 'reception' || role === 'receptionist') {
            return [
                { label: 'Reception Dashboard', path: '/reception/dashboard', icon: <FiHome /> },
                { label: 'Patient Registration', path: '/reception/dashboard?view=intake', icon: <FiPlusSquare /> },
                { label: 'Patient Billing', path: '/billing/patient', icon: <FiFileText /> },
            ];
        }
        if (role === 'lab') {
            return [
                { label: 'Lab Dashboard', path: '/lab/dashboard', icon: <FiActivity /> },
                { label: 'Assigned Tests', path: '/lab/tests', icon: <FiFileText /> },
            ];
        }
        if (role.includes('pharmac')) {
            return [
                { label: 'Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
                { label: 'Pharmacy Orders', path: '/pharmacy/orders', icon: <FiClipboard /> },
                { label: 'Purchase Invoices', path: '/pharmacy/purchase-invoices', icon: <FiFileText /> },
                { label: 'Returns', path: '/pharmacy/returns', icon: <FiActivity /> },
                { label: 'Vendor Returns', path: '/pharmacy/vendor-returns', icon: <FiActivity /> },
                { label: 'Collections', path: '/pharmacy/collections', icon: <FiPieChart /> },
                { label: 'Departments', path: '/pharmacy/departments', icon: <FiGrid /> },
            ];
        }

        if (role === 'accountant') {
            return [
                { label: 'Finance Dashboard', path: '/accountant/dashboard', icon: <FiPieChart /> },
            ];
        }
        if (role === 'cashier') {
            return [
                { label: 'Billing/Payments', path: '/cashier/billing', icon: <FiFileText /> },
            ];
        }
        if (role === 'nurse') {
            return [
                { label: 'Patient Queue', path: '/doctor/patients', icon: <FiUsers /> },
                { label: 'Appointments', path: '/appointment', icon: <FiCalendar /> },
            ];
        }
        if (role === 'billing') {
            return [
                { label: 'Patient Billing', path: '/cashier/billing', icon: <FiFileText /> },
            ];
        }
        return [
            { label: 'My Dashboard', path: '/my-dashboard', icon: <FiHome /> },
        ];
    }, [role, location.pathname, user?.clinicType]);

    return (
        <aside className={`erp-sidebar ${isOpen ? 'open' : 'collapsed'} ${isCentralAdmin ? 'ca-erp-sidebar' : ''}`}>
            <div className={`sidebar-brand ${isCentralAdmin ? 'ca-sidebar-brand' : ''}`}>
                <div className="ca-brand-container">
                    <img
                        src={(isCentralAdmin ? '/assets/medical365-logo.png' : (branding?.logoUrl || branding?.logo || '/assets/medical365-logo.png'))}
                        alt={hospitalName || "Medical 365"}
                        style={{ height: '36px', maxWidth: '175px', width: 'auto', objectFit: 'contain' }}
                    />
                </div>
                <button 
                    className="block lg:hidden p-1 rounded-md hover:bg-gray-100 transition-colors" 
                    onClick={() => setOpen(false)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                    <FiX size={24} color="#64748b" />
                </button>
            </div>
            
            <nav className="sidebar-nav">
                {menuItems.map((item, idx) => {
                    const isItemActive = () => {
                        const currentPath = location.pathname;
                        const currentSearch = location.search;
                        
                        if (item.path.includes('?')) {
                            const [basePath, searchPart] = item.path.split('?');
                            return currentPath === basePath && currentSearch.includes(searchPart);
                        }
                        
                        if (item.path === '/reception/dashboard') {
                            const searchParams = new URLSearchParams(currentSearch);
                            const view = searchParams.get('view');
                            return currentPath === '/reception/dashboard' && (!view || view === 'welcome');
                        }

                        if (item.path === '/ot/dashboard' && currentPath === '/ot-dashboard') {
                            return true;
                        }
                        
                        return currentPath === item.path;
                    };

                    const caThemes = ['theme-green', 'theme-blue', 'theme-teal', 'theme-purple', 'theme-pink'];
                    const currentThemeClass = `ca-sidebar-link ${caThemes[idx % caThemes.length]}`;

                    return (
                        <NavLink 
                            key={idx} 
                            to={item.path} 
                            className={() => `sidebar-link ${isItemActive() ? 'active' : ''} ${currentThemeClass}`}
                        >
                            <span className="sidebar-link-icon">{item.icon}</span>
                            <span className="sidebar-link-text">{item.label}</span>
                        </NavLink>
                    );
                })}

                {/* AI Assistant Card inside Sidebar (Image + AI Assistant title only) */}
                {(role === 'hospitaladmin' || isCentralAdmin) && isOpen && (
                    <div className="ha-sidebar-ai-card">
                        {/* Cute 3D AI Robot Illustration with glowing pedestal */}
                        <div className="ha-sidebar-ai-bot-wrap">
                            <svg className="ha-sidebar-ai-bot-svg" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <radialGradient id="haBotGlow" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                                    </radialGradient>
                                    <linearGradient id="haBotBody" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#ffffff" />
                                        <stop offset="100%" stopColor="#e0f2fe" />
                                    </linearGradient>
                                    <linearGradient id="haBotVisor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0f172a" />
                                        <stop offset="100%" stopColor="#1e293b" />
                                    </linearGradient>
                                </defs>
                                <ellipse cx="80" cy="125" rx="55" ry="12" fill="url(#haBotGlow)" />
                                <ellipse cx="80" cy="125" rx="42" ry="8" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 3" />
                                <ellipse cx="80" cy="122" rx="30" ry="6" stroke="#0ea5e9" strokeWidth="1.8" />
                                <ellipse cx="80" cy="92" rx="26" ry="20" fill="url(#haBotBody)" stroke="#93c5fd" strokeWidth="1.2" />
                                <path d="M 68 86 Q 80 94 92 86" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
                                <ellipse cx="44" cy="85" rx="7" ry="14" fill="#ffffff" stroke="#93c5fd" strokeWidth="1.2" />
                                <ellipse cx="116" cy="85" rx="7" ry="14" fill="#ffffff" stroke="#93c5fd" strokeWidth="1.2" />
                                <rect x="52" y="38" width="56" height="42" rx="18" fill="url(#haBotBody)" stroke="#93c5fd" strokeWidth="1.4" />
                                <rect x="58" y="44" width="44" height="26" rx="12" fill="url(#haBotVisor)" />
                                <ellipse cx="68" cy="56" rx="5" ry="6" fill="#38bdf8" />
                                <ellipse cx="92" cy="56" rx="5" ry="6" fill="#38bdf8" />
                                <ellipse cx="69" cy="54" rx="2" ry="2" fill="#ffffff" />
                                <ellipse cx="93" cy="54" rx="2" ry="2" fill="#ffffff" />
                                <line x1="80" y1="38" x2="80" y2="28" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
                                <circle cx="80" cy="26" r="4" fill="#0ea5e9" />
                                <circle cx="80" cy="26" r="2" fill="#ffffff" />
                            </svg>
                        </div>

                        <div className="ha-sidebar-ai-footer">
                            <h4 className="ha-sidebar-ai-title">AI Assistant</h4>
                        </div>
                    </div>
                )}
            </nav>

            {/* Collapse button for Central Admin */}
            {isCentralAdmin && (
                <div className="ca-sidebar-footer">
                    <button className="ca-sidebar-collapse-btn" onClick={() => setOpen(!isOpen)} title={isOpen ? "Collapse sidebar" : "Expand sidebar"}>
                        {isOpen ? '«' : '»'}
                    </button>
                </div>
            )}
        </aside>
    );
});

const TopBar = ({ toggleSidebar, sidebarOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const role = (user?.role || '').toLowerCase();
    const isCentralAdmin = (role === 'centraladmin' || role === 'superadmin');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    // Helper to get initials
    const getInitials = (name) => {
        return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const getCentralAdminTag = () => {
        const path = location.pathname;
        if (path === '/supremeadmin') return 'CENTRAL ADMIN';
        if (path.includes('question-library')) return 'QUESTION LIBRARY';
        if (path.includes('consent')) return 'CONSENT HUB';
        if (path.includes('roles')) return 'ROLES & PERMISSIONS';
        if (path.includes('users')) return 'MANAGE STAFF';
        if (path.includes('revenue')) return 'REVENUE ANALYTICS';
        return 'CENTRAL ADMIN';
    };

    return (
        <header className={`erp-topbar ${isCentralAdmin ? 'ca-erp-topbar' : ''}`}>
            <div className="topbar-left">
                <button className="sidebar-toggle" onClick={toggleSidebar}>
                    <div className={`hamburger ${sidebarOpen ? 'active' : ''}`}>
                        <FiMenu size={24} color="#1e293b" />
                    </div>
                </button>
                {isCentralAdmin ? (
                    <div className="ca-topbar-breadcrumb">
                        <span className="ca-bc-user-type">Superadmin</span>
                        <span className="ca-bc-divider">/</span>
                        <span className="ca-bc-tag">{getCentralAdminTag()}</span>
                    </div>
                ) : (
                    <div className="breadcrumb-wrap flex flex-nowrap whitespace-nowrap overflow-x-auto overflow-y-hidden items-center">
                        <span className="curr-page-name">
                            {location.pathname.includes('/patient/') 
                                ? 'Patient Profile' 
                                : decodeURIComponent(location.pathname.split('/').pop()).replace(/-/g, ' ') || 'Dashboard'}
                        </span>
                        <span className="path-slash">/</span>
                        <span className="path-user-role">{user?.role}</span>
                    </div>
                )}
            </div>

            <div className="topbar-right">
                <div className="ca-topbar-actions" ref={dropdownRef}>
                    <GlobalSearch />

                    <button className="ca-action-circle-btn ca-notif-btn" title="Notifications">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                        </svg>
                        <span className="ca-notif-badge">3</span>
                    </button>

                    <div 
                        className={`ca-user-profile-circle-btn ${dropdownOpen ? 'active' : ''}`}
                        onClick={() => setDropdownOpen(prev => !prev)}
                        title={user?.name ? `${user.name} (${user.role || 'User'})` : 'Account & Profile'}
                    >
                        <div className="ca-avatar-wrapper">
                            <div className="ca-avatar-circle">
                                {user?.avatar ? (
                                    <img src={user.avatar} alt={user.name} />
                                ) : (
                                    <span>{getInitials(user?.name) || 'PH'}</span>
                                )}
                            </div>
                            <div className="ca-avatar-online" />
                        </div>

                        {/* Dropdown Modal Card (Compact & Clean) */}
                        {dropdownOpen && (
                            <div className="ca-profile-dropdown-card" onClick={(e) => e.stopPropagation()}>
                                {/* Speech Bubble Pointer Arrow */}
                                <div className="ca-dropdown-pointer" />

                                {/* Header Row with Cyber Avatar & Security Graphic */}
                                <div className="ca-drop-header">
                                    {/* Wave Watermark Background */}
                                    <div className="ca-drop-cyber-wave" />

                                    {/* Left Avatar with Orbital Ring and Shield */}
                                    <div className="ca-drop-avatar-wrap">
                                        <div className="ca-avatar-orbital-ring">
                                            <span className="ca-orbital-node node-1" />
                                            <span className="ca-orbital-node node-2" />
                                        </div>
                                        <div className="ca-drop-avatar">
                                            {user?.avatar ? (
                                                <img src={user.avatar} alt={user.name} />
                                            ) : (
                                                <span>{getInitials(user?.name) || 'PH'}</span>
                                            )}
                                        </div>
                                        <div className="ca-avatar-shield-badge" title="Security Verified">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                                <path d="M9 12l2 2 4-4"/>
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Center User Info */}
                                    <div className="ca-drop-user-info">
                                        <h3 className="ca-drop-name">{user?.name || 'Pawan Harish'}</h3>
                                        <p className="ca-drop-email">{user?.email || 'pawanharish2@gmail.com'}</p>
                                        <div className="ca-drop-badge-tag">
                                            <span className="ca-crown-icon">👑</span>
                                            <span className="ca-badge-text">{(user?.role || 'CENTRALADMIN').toUpperCase().replace(/\s+/g, '')}</span>
                                        </div>
                                    </div>

                                    {/* Right 3D Security Shield Graphic */}
                                    <div className="ca-drop-shield-graphic">
                                        <div className="ca-shield-orbit-ring">
                                            <span className="ca-shield-particle" />
                                        </div>
                                        <div className="ca-shield-hex-box">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                                <path d="M12 2L3 6.5v6c0 5.55 3.84 10.74 9 12.5 5.16-1.76 9-6.95 9-12.5v-6L12 2z" fill="url(#shieldCyberGrad)" />
                                                <path d="M12 7.5a2 2 0 0 0-2 2v1.5h4V9.5a2 2 0 0 0-2-2z" stroke="#ffffff" strokeWidth="1.3" />
                                                <rect x="8.5" y="11" width="7" height="5" rx="1.2" fill="#ffffff" />
                                                <circle cx="12" cy="13.5" r="0.8" fill="#4338ca" />
                                                <defs>
                                                    <linearGradient id="shieldCyberGrad" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                                                        <stop stopColor="#38bdf8"/>
                                                        <stop offset="0.5" stopColor="#6366f1"/>
                                                        <stop offset="1" stopColor="#a855f7"/>
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Single Compact Last Login Card */}
                                <div className="ca-drop-login-card">
                                    <div className="ca-login-icon-box">
                                        <FiClock size={15} />
                                    </div>
                                    <div className="ca-login-texts">
                                        <span className="ca-login-label">Last Login</span>
                                        <span className="ca-login-value">Today, 09:42 AM</span>
                                    </div>
                                </div>

                                {/* Logout Session Button */}
                                <button onClick={handleLogout} className="ca-drop-logout-btn">
                                    <FiLogOut size={15} />
                                    <span>Logout</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

const DashboardLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth > 1024 : true);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 1024) {
                setSidebarOpen(false);
            } else {
                setSidebarOpen(true);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="erp-layout">
            <DashboardSidebar isOpen={sidebarOpen} setOpen={setSidebarOpen} />
            <div 
                className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} 
                onClick={() => setSidebarOpen(false)}
            />
            <div className={`erp-main-area ${sidebarOpen ? 'shifted' : 'full'}`}>
                <TopBar sidebarOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
                <main className="erp-page-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export { TopBar, DashboardSidebar };
export default DashboardLayout;
