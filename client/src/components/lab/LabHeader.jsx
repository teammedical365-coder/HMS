import React from 'react';
import { useAuth } from '../../store/hooks';
import { FiMenu, FiMapPin, FiShield } from 'react-icons/fi';

const ROLE_BADGE_CONFIG = {
    'pathologist': { label: 'Pathologist', icon: '🔬', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    'phlebotomist': { label: 'Phlebotomist', icon: '🩸', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    'sample collector': { label: 'Sample Collector', icon: '🩸', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    'lab admin': { label: 'Lab Admin', icon: '🧪', bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
    'lab manager': { label: 'Lab Manager', icon: '🧪', bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
    'lab technician': { label: 'Lab Technician', icon: '🧪', bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
    'lab receptionist': { label: 'Receptionist', icon: '💁', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
    'lab accountant': { label: 'Lab Accountant', icon: '💳', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    'default': { label: 'Lab Personnel', icon: '🔬', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }
};

const getRoleConfig = (roleName) => {
    const lower = String(roleName || '').toLowerCase();
    for (const [key, val] of Object.entries(ROLE_BADGE_CONFIG)) {
        if (lower.includes(key)) return val;
    }
    return ROLE_BADGE_CONFIG.default;
};

const LabHeader = ({ title, subtitle, onToggleSidebar }) => {
    const { user } = useAuth();
    const roleName = user?.roleName || user?._roleData?.name || user?.role || 'Staff';
    const roleConfig = getRoleConfig(roleName);
    const locationName = user?.locationName || 'Central Processing Lab';

    return (
        <header className="lab-header">
            <div className="lab-header-left">
                <button onClick={onToggleSidebar} className="lab-mobile-toggle" aria-label="Toggle menu">
                    <FiMenu />
                </button>
                <div>
                    <div className="lab-header-title">
                        <span>{title || 'Laboratory Management System'}</span>
                        <div className="lab-header-location-badge">
                            <FiMapPin style={{ fontSize: '12px' }} />
                            <span>{locationName}</span>
                        </div>
                    </div>
                    {subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {subtitle}
                        </div>
                    )}
                </div>
            </div>

            <div className="lab-header-right">
                <div
                    className="lab-role-badge"
                    style={{
                        background: roleConfig.bg,
                        color: roleConfig.color,
                        border: `1px solid ${roleConfig.border}`
                    }}
                >
                    <span>{roleConfig.icon}</span>
                    <span>{roleConfig.label}</span>
                </div>

                <div className="lab-user-info">
                    <div className="lab-avatar">
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'L'}
                    </div>
                    <div className="lab-user-meta">
                        <div className="lab-user-name">{user?.name || 'Staff User'}</div>
                        <div className="lab-user-sub">{user?.email || 'Logged In'}</div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default LabHeader;
