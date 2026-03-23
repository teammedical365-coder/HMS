import React, { useEffect } from 'react'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
import socket from './utils/socket'
import { useAuth, useAppDispatch } from './store/hooks'
import { useBranding } from './context/BrandingContext'

const App = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();
  const { loadBranding, resetBranding } = useBranding();

  // Auto-load hospital branding when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const hospitalId = user.hospitalId;
      const role = (user.role || '').toLowerCase();
      // Apply branding only for hospital-scoped users (not central admins)
      if (hospitalId && !['centraladmin', 'superadmin'].includes(role)) {
        loadBranding(hospitalId);
      }
    } else {
      resetBranding();
    }
  }, [isAuthenticated, user]);

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && user) {
      socket.connect();
      socket.emit('join', user._id || user.id);

      const roleStr = typeof user.role === 'string'
        ? user.role.toLowerCase()
        : user._roleData?.name?.toLowerCase();

      if (roleStr) socket.emit('join', roleStr);

      socket.on('new_notification', (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
      });
    } else {
      socket.disconnect();
    }

    return () => { socket.disconnect(); };
  }, [isAuthenticated, user]);

  // Smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      smooth: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    return () => { lenis.destroy(); };
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <MainRoutes />
    </div>
  )
}

export default App