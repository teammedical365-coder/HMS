import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import {
    FiHome, FiUsers, FiCalendar, FiActivity, FiPackage,
    FiSettings, FiLogOut, FiPieChart, FiClipboard,
    FiFileText, FiPlusSquare, FiDatabase, FiGrid, FiShield
} from 'react-icons/fi';
import './DashboardLayout.css';

const DashboardSidebar = ({ isOpen, setOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const role = (user?.role || '').toLowerCase();
    
    // Categorized Menus
    const getMenu = () => {
        if (role === 'centraladmin' || role === 'superadmin') {
            return [
                { label: 'System Overview', path: '/supremeadmin', icon: <FiPieChart /> },
                { label: 'Question Library', path: '/admin/question-library', icon: <FiFileText /> },
                { label: 'Role & Permissions', path: '/admin/roles', icon: <FiShield /> },
                { label: 'Manage All Staff', path: '/admin/users', icon: <FiUsers /> },
            ];
        }
        if (role === 'hospitaladmin') {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            if (u.clinicType === 'clinic') {
                // Simple clinic — single hub page with built-in role switcher
                return [
                    { label: 'Clinic Hub', path: '/hospitaladmin', icon: <FiHome /> },
                ];
            }
            return [
                { label: 'Hospital Overview', path: '/hospitaladmin', icon: <FiPieChart /> },
                { label: 'Clinical Questions', path: '/hospitaladmin/question-library', icon: <FiFileText /> },
                { label: 'Staff Management', path: '/admin/users', icon: <FiUsers /> },
                { label: 'Doctors Feed', path: '/admin/doctors', icon: <FiActivity /> },
                { label: 'Pharma Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
            ];
        }
        if (role === 'doctor') {
            return [
                { label: 'My Patients', path: '/doctor/dashboard', icon: <FiUsers /> },
                { label: 'Appointments', path: '/doctor/patients', icon: <FiCalendar /> },
                { label: 'All Cases', path: '/doctor/cases', icon: <FiClipboard /> },
            ];
        }
        if (role === 'reception') {
            return [
                { label: 'Reception Dashboard', path: '/reception/dashboard', icon: <FiHome /> },
                { label: 'Appointments/Booking', path: '/appointment', icon: <FiPlusSquare /> },
            ];
        }
        if (role === 'lab') {
            return [
                { label: 'Lab Dashboard', path: '/lab/dashboard', icon: <FiActivity /> },
                { label: 'Assigned Tests', path: '/lab/tests', icon: <FiFileText /> },
            ];
        }
        if (role === 'pharmacy') {
            return [
                { label: 'Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
                { label: 'Pharmacy Orders', path: '/pharmacy/orders', icon: <FiClipboard /> },
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
        <aside className={`erp-sidebar ${isOpen ? 'open' : 'collapsed'}`}>
            <div className="sidebar-brand">
                {branding.logoUrl ? (
                    <img
                        src={branding.logoUrl}
                        alt={hospitalName}
                        style={{ height: '32px', maxWidth: '120px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                ) : (
                    <>
                        <div className="brand-dot" />
                        <span>{hospitalName !== 'Medical 365' ? hospitalName : 'Medical 365'}</span>
                    </>
                )}
            </div>
            
            <nav className="sidebar-nav">
                {menuItems.map((item, idx) => (
                    <NavLink 
                        key={idx} 
                        to={item.path} 
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        <span className="sidebar-link-text">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-link settings-item">
                    <span className="sidebar-link-icon"><FiSettings /></span>
                    <span className="sidebar-link-text">Profile Settings</span>
                </div>
            </div>
        </aside>
    );
};

const TopBar = ({ toggleSidebar, sidebarOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    // Helper to get initials
    const getInitials = (name) => {
        return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    return (
        <header className="erp-topbar">
            <div className="topbar-left">
                <button className="sidebar-toggle" onClick={toggleSidebar}>
                    <div className={`hamburger ${sidebarOpen ? 'active' : ''}`}>
                        <span />
                        <span />
                        <span />
                    </div>
                </button>
                {branding.logoUrl && (
                    <img
                        src={branding.logoUrl}
                        alt={hospitalName}
                        style={{ height: '28px', maxWidth: '100px', objectFit: 'contain', borderRadius: '3px', marginRight: '8px' }}
                    />
                )}
                <div className="breadcrumb-wrap">
                    <span className="curr-page-name">
                        {location.pathname.split('/').pop().replace(/-/g, ' ') || 'Dashboard'}
                    </span>
                    <span className="path-slash">/</span>
                    <span className="path-user-role">{user?.role}</span>
                </div>
            </div>

            <div className="topbar-right">
                <div className="user-profile-widget">
                    <div className="profile-text-info">
                        <span className="user-disp-name">{user?.role === 'doctor' ? 'DR. ' : ''}{user?.name || 'User'}</span>
                        <span className="user-disp-role">{user?.email}</span>
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
                                <strong>{user?.name}</strong>
                                <span>{user?.email}</span>
                                <span className="p-role-badge">{user?.role}</span>
                            </div>
                            <div className="p-body">
                                <div className="p-item"><FiUsers size={14} /> My Profile</div>
                                <div className="p-item"><FiSettings size={14} /> Account Settings</div>
                            </div>
                            <div className="p-footer">
                                <button onClick={handleLogout} className="btn-p-logout">
                                    <FiLogOut size={14} /> Logout Session
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

const DashboardLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="erp-layout">
            <DashboardSidebar isOpen={sidebarOpen} />
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
