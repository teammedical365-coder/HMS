import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';

export const getWorkstationPathForRole = (role) => {
    const r = String(role || '').toLowerCase();
    if (r.includes('pathologist')) return '/lab/verification';
    if (r.includes('phlebotomist') || r.includes('sample collector')) return '/lab/collection';
    if (r.includes('technician') || r.includes('tech')) return '/lab/bench';
    if (r.includes('receptionist') || r.includes('reception')) return '/lab/reception';
    if (r.includes('accountant')) return '/lab/billing';
    if (r.includes('manager')) return '/lab/manager';
    if (r.includes('lab admin') || r.includes('hospitaladmin') || r.includes('admin') || r.includes('superadmin')) {
        return '/lab/dashboard';
    }
    return '/lab/dashboard';
};

const LabRouter = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return null;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const roleName = user.roleName || user._roleData?.name || user.role || '';
    const targetPath = getWorkstationPathForRole(roleName);

    return <Navigate to={targetPath} replace />;
};

export default LabRouter;
