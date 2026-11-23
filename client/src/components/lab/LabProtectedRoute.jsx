import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';
import { FiShield, FiAlertTriangle, FiArrowLeft, FiHome } from 'react-icons/fi';

/**
 * Resolves the primary workstation path for a laboratory role
 */
export const getLabRoleDashboardPath = (roleName) => {
    const raw = String(roleName || '').toLowerCase().trim();
    if (raw.includes('admin')) return '/lab/dashboard';
    if (raw.includes('manager')) return '/lab/manager';
    if (raw.includes('reception')) return '/lab/reception';
    if (raw.includes('phlebotomist') || raw.includes('sample collector')) return '/lab/collection';
    if (raw.includes('technician') || raw.includes('tech')) return '/lab/bench';
    if (raw.includes('pathologist')) return '/lab/verification';
    if (raw.includes('accountant')) return '/lab/billing';
    return '/lab/dashboard';
};

/**
 * LabProtectedRoute
 * Verifies authentication, laboratory membership, and role/permission authorization.
 */
const LabProtectedRoute = ({ children, allowedRoles = [], requiredPermissions = [] }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const navigate = useNavigate();

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Verifying Laboratory Credentials...</span>
            </div>
        );
    }

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    const roleName = (user.roleName || user._roleData?.name || user.role || '').toLowerCase();
    const isCentral = roleName === 'centraladmin' || roleName === 'superadmin';
    const isHospAdmin = roleName === 'hospitaladmin';
    const isLabStaff = (
        roleName.includes('lab') ||
        roleName.includes('pathologist') ||
        roleName.includes('phlebotomist') ||
        roleName.includes('sample collector')
    );

    // If not a lab staff or hospital/central admin, redirect to general home
    if (!isCentral && !isHospAdmin && !isLabStaff) {
        return <Navigate to="/" replace />;
    }

    // Central & Hospital Admins have super-access across lab
    if (isCentral || isHospAdmin) {
        return children;
    }

    // Role check if allowedRoles specified
    if (allowedRoles.length > 0) {
        const matchesRole = allowedRoles.some(ar => roleName.includes(ar.toLowerCase().trim()));
        if (!matchesRole) {
            const myDashboard = getLabRoleDashboardPath(roleName);
            return (
                <div style={{ maxWidth: '540px', margin: '80px auto', padding: '36px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.06)', border: '1px solid #fee2e2', textAlign: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 18px' }}>
                        <FiAlertTriangle />
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Restricted Workstation</h2>
                    <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                        Your account (<strong>{user.name}</strong> — <em>{user.role}</em>) does not have authorization to access this clinical station.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                        <button
                            onClick={() => navigate(myDashboard)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13.5px' }}
                        >
                            <FiHome /> Go to My Workstation
                        </button>
                    </div>
                </div>
            );
        }
    }

    // Permission check if requiredPermissions specified
    if (requiredPermissions.length > 0) {
        const userPerms = user.permissions || user._roleData?.permissions || [];
        const hasWildcard = userPerms.includes('*');
        const hasRequired = hasWildcard || requiredPermissions.some(rp => userPerms.includes(rp));

        if (!hasRequired) {
            const myDashboard = getLabRoleDashboardPath(roleName);
            return (
                <div style={{ maxWidth: '540px', margin: '80px auto', padding: '36px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.06)', border: '1px solid #fee2e2', textAlign: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 18px' }}>
                        <FiShield />
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Action Permission Required</h2>
                    <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                        You lack the required operational permission (<code>{requiredPermissions.join(', ')}</code>) to view this module.
                    </p>
                    <button
                        onClick={() => navigate(myDashboard)}
                        style={{ padding: '10px 20px', background: '#0ea5e9', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Return to Workstation
                    </button>
                </div>
            );
        }
    }

    return children;
};

export default LabProtectedRoute;
