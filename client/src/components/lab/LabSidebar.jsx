import React, { useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import {
    FiHome, FiUsers, FiMapPin, FiActivity, FiLayers,
    FiCheckCircle, FiFileText, FiDollarSign, FiClock,
    FiClipboard, FiLogOut, FiInbox, FiCpu, FiGrid
} from 'react-icons/fi';

const LabSidebar = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();

    const roleName = (user?.roleName || user?._roleData?.name || user?.role || '').toLowerCase();
    const isCentral = roleName === 'centraladmin' || roleName === 'superadmin';
    const isHospAdmin = roleName === 'hospitaladmin';
    const isAdmin = isCentral || isHospAdmin || roleName.includes('lab admin');
    const isManager = roleName.includes('manager');
    const isReception = roleName.includes('reception');
    const isPhleb = roleName.includes('phlebotomist') || roleName.includes('sample collector');
    const isTech = roleName.includes('technician') || roleName.includes('tech');
    const isPathologist = roleName.includes('pathologist');
    const isAccountant = roleName.includes('accountant');

    // Dynamic Navigation Groups according to role & permissions
    const navSections = useMemo(() => {
        const sections = [];

        // Primary Workstation Link
        const primaryItems = [];
        if (isAdmin) {
            primaryItems.push({ label: 'Admin Dashboard', path: '/lab/dashboard', icon: <FiHome /> });
            primaryItems.push({ label: 'Manager Operations', path: '/lab/manager', icon: <FiActivity /> });
        } else if (isManager) {
            primaryItems.push({ label: 'Operations Dashboard', path: '/lab/manager', icon: <FiActivity /> });
        } else if (isReception) {
            primaryItems.push({ label: 'Reception Intake', path: '/lab/reception', icon: <FiInbox /> });
        } else if (isPhleb) {
            primaryItems.push({ label: 'Phlebotomy Station', path: '/lab/collection', icon: <FiLayers /> });
        } else if (isTech) {
            primaryItems.push({ label: 'Technical Bench', path: '/lab/bench', icon: <FiCpu /> });
        } else if (isPathologist) {
            primaryItems.push({ label: 'Pathologist Review', path: '/lab/verification', icon: <FiCheckCircle /> });
        } else if (isAccountant) {
            primaryItems.push({ label: 'Billing Dashboard', path: '/lab/billing', icon: <FiDollarSign /> });
        } else {
            primaryItems.push({ label: 'Lab Dashboard', path: '/lab/dashboard', icon: <FiHome /> });
        }
        sections.push({ title: 'Workstation', items: primaryItems });

        // Workstation Switcher for Admin & Manager
        if (isAdmin || isManager) {
            const stations = [];
            stations.push({ label: 'Reception Queue', path: '/lab/reception', icon: <FiInbox /> });
            stations.push({ label: 'Phlebotomy Queue', path: '/lab/collection', icon: <FiLayers /> });
            stations.push({ label: 'Bench Testing', path: '/lab/bench', icon: <FiCpu /> });
            stations.push({ label: 'Verification Queue', path: '/lab/verification', icon: <FiCheckCircle /> });
            stations.push({ label: 'Billing & Invoicing', path: '/lab/billing', icon: <FiDollarSign /> });
            sections.push({ title: 'Clinical Stations', items: stations });
        }

        // Shared Clinical Operations & Catalog
        const opItems = [];
        if (isAdmin || isManager) {
            opItems.push({ label: 'Lab Locations', path: '/lab/locations', icon: <FiMapPin /> });
        }
        if (isReception) {
            opItems.push({ label: 'Patient Directory', path: '/reception/patients', icon: <FiUsers /> });
            opItems.push({ label: 'Invoicing & Receipts', path: '/lab/billing', icon: <FiDollarSign /> });
        }
        if (isAdmin || isManager || isTech || isPhleb || (!isReception && !isAccountant)) {
            opItems.push({ label: 'Assigned Tests', path: '/lab/tests', icon: <FiClipboard /> });
        }
        opItems.push({ label: 'Completed Reports', path: '/lab/completed', icon: <FiFileText /> });
        sections.push({ title: 'Management & Records', items: opItems });

        return sections;
    }, [isAdmin, isManager, isReception, isPhleb, isTech, isPathologist, isAccountant]);

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    return (
        <aside className={`lab-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="lab-sidebar-brand">
                <div className="lab-brand-icon">🔬</div>
                <div className="lab-brand-text">
                    <h2>Medical365</h2>
                    <span>Laboratory LMS</span>
                </div>
            </div>

            <nav className="lab-sidebar-nav">
                {navSections.map((section, sIdx) => (
                    <div key={sIdx} style={{ marginBottom: '16px' }}>
                        <div className="lab-nav-section-title">{section.title}</div>
                        {section.items.map((item, iIdx) => (
                            <NavLink
                                key={iIdx}
                                to={item.path}
                                onClick={onClose}
                                className={({ isActive }) => `lab-nav-item ${isActive ? 'active' : ''}`}
                            >
                                <span className="lab-nav-icon">{item.icon}</span>
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="lab-sidebar-footer">
                <div className="lab-sidebar-location-pill">
                    <FiMapPin style={{ color: '#0ea5e9' }} />
                    <span>Location: <strong>{user?.locationName || 'Central Lab'}</strong></span>
                </div>
                <button onClick={handleLogout} className="lab-sidebar-logout-btn">
                    <FiLogOut /> Logout
                </button>
            </div>
        </aside>
    );
};

export default LabSidebar;
