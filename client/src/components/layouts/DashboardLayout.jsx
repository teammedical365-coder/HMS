import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import {
    FiHome, FiUsers, FiCalendar, FiActivity, FiPackage,
    FiSettings, FiLogOut, FiPieChart, FiClipboard,
    FiFileText, FiPlusSquare, FiDatabase, FiGrid, FiShield, FiMenu, FiX,
    FiClock, FiBox, FiUserCheck, FiHeart, FiCheckCircle, FiUser
} from 'react-icons/fi';
import GlobalSearch from '../GlobalSearch';
import './DashboardLayout.css';

const DashboardSidebar = ({ isOpen, setOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const role = (user?.role || '').toLowerCase();
    const location = useLocation();
    const isCentralAdmin = location.pathname === '/supremeadmin' && (role === 'centraladmin' || role === 'superadmin');
    
    // Categorized Menus
    const getMenu = () => {
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
                ];
            }
            return [
                { label: 'Hospital Overview', path: '/hospitaladmin', icon: <FiPieChart /> },
                { label: 'OT Operations', path: '/ot/dashboard', icon: <FiActivity /> },
                { label: 'Clinical Questions', path: '/hospitaladmin/question-library', icon: <FiFileText /> },
                { label: 'Staff Management', path: '/admin/users', icon: <FiUsers /> },
                { label: 'Doctors Feed', path: '/admin/doctors', icon: <FiActivity /> },
                { label: 'Pharma Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
            ];
        }
        if (role === 'doctor' || role === 'clinic doctor') {
            const localUser = JSON.parse(localStorage.getItem('user') || '{}');
            if (user?.clinicType === 'clinic' || localUser?.clinicType === 'clinic') {
                return [
                    { label: 'Doctor Dashboard', path: '/doctor/dashboard', icon: <FiHome /> },
                ];
            }
            return [
                { label: 'Dashboard', path: '/doctor/cases', icon: <FiClipboard /> },
                { label: 'My Patients', path: '/doctor/dashboard', icon: <FiUsers /> },
                { label: '🤖 AI Assistant', path: '/doctor/ai-assistant', icon: <FiFileText /> },
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
    };

    const menuItems = getMenu();

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

                    return (
                        <NavLink 
                            key={idx} 
                            to={item.path} 
                            className={() => `sidebar-link ${isItemActive() ? 'active' : ''} ${isCentralAdmin ? 'ca-sidebar-link' : ''}`}
                        >
                            <span className="sidebar-link-icon">{item.icon}</span>
                            <span className="sidebar-link-text">{item.label}</span>
                        </NavLink>
                    );
                })}

                {/* Need Help Widget Card inside Sidebar for Central Admin */}
                {isCentralAdmin && isOpen && (
                    <div className="ca-sidebar-help-card">
                        <div className="ca-sidebar-help-avatar-wrap">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                            </svg>
                        </div>
                        <h4 className="ca-sidebar-help-title">Need Help?</h4>
                        <p className="ca-sidebar-help-desc">
                            Check our documentation or contact support.
                        </p>
                        <button className="ca-sidebar-help-btn" onClick={() => window.open('mailto:teammedical365@gmail.com')}>
                            <span style={{ fontSize: '13px' }}>🎧</span> Contact Support
                        </button>
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
};

const TopBar = ({ toggleSidebar, sidebarOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const role = (user?.role || '').toLowerCase();
    const isCentralAdmin = location.pathname === '/supremeadmin' && (role === 'centraladmin' || role === 'superadmin');

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    // Helper to get initials
    const getInitials = (name) => {
        return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
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
                        <span className="ca-bc-tag">CENTRAL ADMIN</span>
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

            <GlobalSearch />

            <div className="topbar-right">
                {isCentralAdmin ? (
                    <div className="ca-topbar-actions">
                        <button className="ca-action-circle-btn" title="AI Intelligence">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>
                            </svg>
                        </button>
                        <button className="ca-action-circle-btn ca-notif-btn" title="Notifications">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                            </svg>
                            <span className="ca-notif-badge">3</span>
                        </button>
                        <div className="ca-user-profile-chip">
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
                            <div className="ca-user-details-col">
                                <span className="ca-user-name-text">{user?.name || 'Pawan Harish'}</span>
                                <span className="ca-user-role-text">Super Admin</span>
                            </div>
                            <span className="ca-chevron-arrow">▾</span>
                            <div className="profile-dropdown-content">
                                <div className="p-header">
                                    <strong className="capitalize">{user?.name || 'Pawan Harish'}</strong>
                                    <span>{user?.email}</span>
                                    <span className="p-role-badge">{user?.role || 'Super Admin'}</span>
                                </div>
                                <div className="p-footer">
                                    <button onClick={handleLogout} className="btn-p-logout">
                                        <FiLogOut size={14} /> Logout Session
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="user-profile-widget">
                        <div className="profile-text-info">
                            <span className="user-disp-name truncate max-w-[100px] sm:max-w-none capitalize">{(user?.role || '').toLowerCase().includes('doctor') ? 'Dr. ' : ''}{user?.name || 'User'}</span>
                        </div>
                        <div className="profile-avatar-wrap">
                            <div className="profile-avatar" style={{ overflow: 'hidden', padding: 0 }}>
                                {user?.avatar
                                    ? <img src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                                    : getInitials(user?.name)
                                }
                            </div>
                            <div className="online-indicator" />
                            
                            <div className="profile-dropdown-content">
                                <div className="p-header">
                                    <strong className="capitalize">{user?.name}</strong>
                                    <span>{user?.email}</span>
                                    <span className="p-role-badge">{user?.role}</span>
                                </div>
                                <div className="p-footer">
                                    <button onClick={handleLogout} className="btn-p-logout">
                                        <FiLogOut size={14} /> Logout Session
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
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

export default DashboardLayout;
