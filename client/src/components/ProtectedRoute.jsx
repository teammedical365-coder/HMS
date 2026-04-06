import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/hooks';

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
    const hasAllowedRole = allowedRoles.length === 0 ||
      allowedRoles.includes(userRole.toLowerCase());

    // Allow if EITHER the role OR permission check passes (when both are specified, OR logic)
    // When only one is specified, that check must pass
    if (requiredPermissions.length > 0 && allowedRoles.length > 0) {
      if (!hasRequiredPermission && !hasAllowedRole) {
        const dashboardPath = user.dashboardPath || '/my-dashboard';
        return <Navigate to={dashboardPath} replace />;
      }
    } else if (!hasRequiredPermission || !hasAllowedRole) {
      const dashboardPath = user.dashboardPath || '/my-dashboard';
      return <Navigate to={dashboardPath} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
