import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/hooks';

const ProtectedRoute = ({ children, allowedRoles = [], requireAuth = false }) => {
  const { user, isAuthenticated, token } = useAuth();

  // If authentication is required but no token, redirect to login
  if (requireAuth && !token) {
    return <Navigate to="/login" replace />;
  }
// If user is authenticated but not in allowed roles, redirect
  if (token && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect based on role
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (user.role === 'doctor') {
      return <Navigate to="/doctor/patients" replace />;
    } else if (user.role === 'lab') {
      return <Navigate to="/lab/dashboard" replace />; // <--- ADD THIS
    } else if (user.role === 'administrator') {
      return <Navigate to="/administrator" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  // If no token and allowedRoles is specified, check if route allows unauthenticated access
  // For browsing routes (services, doctors), allow unauthenticated access
  if (!token && allowedRoles.length > 0) {
    // Allow unauthenticated access for browsing routes
    if (allowedRoles.includes('user') || allowedRoles.includes('doctor') || 
        allowedRoles.includes('lab') || allowedRoles.includes('pharmacy') || 
        allowedRoles.includes('reception')) {
      return children;
    }
  }

  return children;
};

export default ProtectedRoute;

