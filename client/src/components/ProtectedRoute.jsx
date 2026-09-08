import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/hooks';

const getRoleDashboardPath = (user) => {
  if (user?.dashboardPath) return user.dashboardPath;
  const role = (user?.role || '').toLowerCase().replace(/\s+/g, '');
  if (['nurse', 'staffnurse', 'headnurse'].includes(role)) {
    return '/nurse/dashboard';
  }
  if (role === 'doctor' || role === 'clinicdoctor') {
    return '/doctor/dashboard';
  }
  if (role === 'reception' || role === 'receptionist') {
    return '/reception/dashboard';
  }
  if (role === 'cashier' || role === 'billing') {
    return '/cashier/billing';
  }
  if (role === 'accountant') {
    return '/accountant/dashboard';
  }
  if (role === 'lab') {
    return '/lab/dashboard';
  }
  if (role.includes('pharmac')) {
    return '/pharmacy/inventory';
  }
  if (role === 'otmanager' || role === 'otstaff') {
    return '/ot/dashboard';
  }
  if (role === 'hospitaladmin') {
    return '/hospitaladmin';
  }
  if (role === 'centraladmin' || role === 'superadmin') {
    return '/supremeadmin';
  }
  return '/my-dashboard';
};

const ProtectedRoute = ({ children, requiredPermissions = [], allowedRoles = [] }) => {
  const { user, isAuthenticated, token } = useAuth();

  // If no token and permissions are required, redirect to login
  if (!token && (requiredPermissions.length > 0 || allowedRoles.length > 0)) {
    return <Navigate to="/login" replace />;
  }

  // If user is authenticated, check permissions
  if (token && user) {
    const userPermissions = user.permissions || [];
    const userRole = user.role || '';

    // Admin-level roles — always allowed for admin routes
    if (userPermissions.includes('*') || userRole === 'superadmin' || userRole === 'centraladmin' || userRole === 'hospitaladmin') {
      return children;
    }

    const hasRequiredPermission = requiredPermissions.length === 0 ||
      requiredPermissions.some(perm => userPermissions.includes(perm));
    const cleanUserRole = userRole.toLowerCase().replace(/\s+/g, '');
    const hasAllowedRole = allowedRoles.length === 0 ||
      allowedRoles.map(r => r.toLowerCase().replace(/\s+/g, '')).includes(cleanUserRole);

    // Allow if EITHER the role OR permission check passes (when both are specified, OR logic)
    // When only one is specified, that check must pass
    if (requiredPermissions.length > 0 && allowedRoles.length > 0) {
      if (!hasRequiredPermission && !hasAllowedRole) {
        const dashboardPath = getRoleDashboardPath(user);
        return <Navigate to={dashboardPath} replace />;
      }
    } else if (!hasRequiredPermission || !hasAllowedRole) {
      const dashboardPath = getRoleDashboardPath(user);
      return <Navigate to={dashboardPath} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
