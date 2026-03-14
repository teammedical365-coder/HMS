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

    // SuperAdmin / CentralAdmin wildcard — always allowed
    if (userPermissions.includes('*') || userRole === 'superadmin' || userRole === 'centraladmin') {
      return children;
    }

    // Check permission-based access
    if (requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
      if (!hasPermission) {
        // Redirect to the user's own dashboard
        const dashboardPath = user.dashboardPath || '/my-dashboard';
        return <Navigate to={dashboardPath} replace />;
      }
    }

    // Legacy support: check role name strings (for backwards compatibility during transition)
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole.toLowerCase())) {
      const dashboardPath = user.dashboardPath || '/my-dashboard';
      return <Navigate to={dashboardPath} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
