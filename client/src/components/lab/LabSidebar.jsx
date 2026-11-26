import React, { useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import {
    FiHome, FiMapPin, FiActivity, FiLayers,
    FiCheckCircle, FiFileText, FiDollarSign,
    FiClipboard, FiLogOut, FiCpu, FiGrid,
    FiCheckSquare, FiRefreshCw, FiTruck, FiEdit3, FiAlertOctagon, FiSend, FiPlus
} from 'react-icons/fi';

const LabSidebar = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
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
        } else if (isPhleb) {
            primaryItems.push({ label: 'Sample Collection', path: '/lab/collection', icon: <FiLayers /> });
        } else if (isTech) {
            primaryItems.push({ label: 'Technical Bench', path: '/lab/bench', icon: <FiCpu /> });
        } else if (isPathologist) {
            primaryItems.push({ label: 'Pathologist Review', path: '/lab/results/verification', icon: <FiCheckCircle /> });
            primaryItems.push({ label: 'Critical Alerts', path: '/lab/results/critical-alerts', icon: <FiAlertOctagon /> });
            primaryItems.push({ label: 'Result Overview', path: '/lab/results', icon: <FiFileText /> });
        } else if (isAccountant) {
            primaryItems.push({ label: 'Billing Dashboard', path: '/lab/billing', icon: <FiDollarSign /> });
        } else {
            primaryItems.push({ label: 'Lab Dashboard', path: '/lab/dashboard', icon: <FiHome /> });
        }
        sections.push({ title: 'Workstation', items: primaryItems });

        // Workstation Switcher for Admin & Manager
        if (isAdmin || isManager) {
            const stations = [];
            stations.push({ label: 'Sample Collection', path: '/lab/collection', icon: <FiLayers /> });
            stations.push({ label: 'Accessioning Station', path: '/lab/accessioning', icon: <FiCheckSquare /> });
            stations.push({ label: 'Bench Testing', path: '/lab/bench', icon: <FiCpu /> });
            stations.push({ label: 'Result Entry', path: '/lab/results/entry', icon: <FiEdit3 /> });
            stations.push({ label: 'Verification Queue', path: '/lab/results/verification', icon: <FiCheckCircle /> });
            stations.push({ label: 'Panic Alerts', path: '/lab/results/critical-alerts', icon: <FiAlertOctagon /> });
            stations.push({ label: 'Billing & Invoicing', path: '/lab/billing', icon: <FiDollarSign /> });
            stations.push({ label: 'Recollections', path: '/lab/recollections', icon: <FiRefreshCw /> });
            stations.push({ label: 'Sample Transfers', path: '/lab/sample-transfers', icon: <FiTruck /> });
            sections.push({ title: 'Clinical Stations', items: stations });
        } else if (isTech) {
            const techStations = [];
            techStations.push({ label: 'Result Entry', path: '/lab/results/entry', icon: <FiEdit3 /> });
            techStations.push({ label: 'Accessioning Station', path: '/lab/accessioning', icon: <FiCheckSquare /> });
            techStations.push({ label: 'Panic Alerts', path: '/lab/results/critical-alerts', icon: <FiAlertOctagon /> });
            techStations.push({ label: 'Recollections', path: '/lab/recollections', icon: <FiRefreshCw /> });
            techStations.push({ label: 'Sample Transfers', path: '/lab/sample-transfers', icon: <FiTruck /> });
            sections.push({ title: 'Specimen Workflows', items: techStations });
        } else if (isPhleb) {
            const phlebStations = [];
            phlebStations.push({ label: 'Recollections', path: '/lab/recollections', icon: <FiRefreshCw /> });
            phlebStations.push({ label: 'Sample Transfers', path: '/lab/sample-transfers', icon: <FiTruck /> });
            sections.push({ title: 'Specimen Workflows', items: phlebStations });
        }

        // Shared Clinical Operations & Catalog
        const opItems = [];
        if (isAdmin || isManager) {
            opItems.push({ label: 'Lab Locations', path: '/lab/locations', icon: <FiMapPin /> });
        }
        if (isAdmin || isManager || isPathologist) {
            opItems.push({ label: 'Test Catalogue', path: '/lab/catalog', icon: <FiGrid /> });
        }
        if (isAdmin || isManager || isReception) {
            opItems.push({ label: 'Lab Orders', path: '/lab/orders', icon: <FiClipboard /> });
        }
        if (isReception) {
            opItems.push({ label: 'Invoicing & Receipts', path: '/lab/billing', icon: <FiDollarSign /> });
        }
        if (isAdmin || isManager || isTech || isPhleb || (!isReception && !isAccountant)) {
            opItems.push({ label: 'Assigned Tests', path: '/lab/tests', icon: <FiClipboard /> });
        }
        opItems.push({ label: 'Completed Reports', path: '/lab/completed', icon: <FiFileText /> });
        // Phase 8: Diagnostic Reports Workstation
        const reportItems = [
            { label: 'Reports Console', path: '/lab/reports', icon: <FiFileText /> },
            { label: 'Released Reports', path: '/lab/reports/released', icon: <FiCheckCircle /> }
        ];
        if (isAdmin || isManager || isTech || isPathologist) {
            reportItems.splice(1, 0, { label: 'Generate Reports', path: '/lab/reports/generate', icon: <FiPlus /> });
        }
        if (isAdmin || isManager || isPathologist) {
            reportItems.splice(2, 0, { label: 'Review & Sign-off', path: '/lab/reports/review', icon: <FiCheckSquare /> });
        }
        reportItems.push({ label: 'Report Delivery', path: '/lab/reports/delivery', icon: <FiSend /> });
        sections.push({ title: 'Diagnostic Reports', items: reportItems });

        sections.push({ title: 'Management & Records', items: opItems });

        return sections;
    }, [isAdmin, isManager, isReception, isPhleb, isTech, isPathologist, isAccountant]);

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    const resolvedHospitalName = hospitalName || 'Medical 365';
    const resolvedLogoUrl = branding?.logoUrl || branding?.logo || '/assets/logo.png';

    return (
        <aside className={`lab-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="lab-sidebar-brand">
                <img
                    src={resolvedLogoUrl}
                    alt={resolvedHospitalName}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/logo.png';
                    }}
                    style={{ height: '34px', maxWidth: '44px', width: 'auto', objectFit: 'contain' }}
                />
                <div className="lab-brand-text">
                    <h2>{resolvedHospitalName}</h2>
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
