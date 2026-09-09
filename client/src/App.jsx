import React, { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
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

      const handleNewNotification = (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
      };

      socket.on('new_notification', handleNewNotification);

      return () => {
        socket.off('new_notification', handleNewNotification);
        socket.disconnect();
      };
    } else {
      socket.disconnect();
    }

    return () => { socket.disconnect(); };
  }, [isAuthenticated, user, dispatch]);

  // Smooth scrolling with official Lenis setup
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      prevent: (node) => {
        if (!node || typeof node.closest !== 'function') return false;
        // Prevent Lenis from intercepting scroll on custom dropdowns, lists, selects, modals or any element marked with data-lenis-prevent
        if (node.closest('[data-lenis-prevent], .lenis-prevent, select, textarea, .ql-lang-list, .ql-lang-dropdown-menu, .modal-content, .modal-body, .custom-select-menu, .custom-dropdown-list, [role="listbox"], [role="menu"], [role="dialog"]')) {
          return true;
        }
        // Auto-detect any scrollable container with overflow-y auto/scroll
        let current = node;
        while (current && current !== document.body && current !== document.documentElement) {
          if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
            const style = window.getComputedStyle(current);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;
            if (
              overflowY === 'auto' || overflowY === 'scroll' ||
              overflowX === 'auto' || overflowX === 'scroll'
            ) {
              return true;
            }
          }
          current = current.parentElement;
        }
        return false;
      },
    });

    let animId;
    function raf(time) {
      lenis.raf(time);
      animId = requestAnimationFrame(raf);
    }

    animId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(animId);
      lenis.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          duration: 3500,
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1.5px solid #e2e8f0',
            borderRadius: '14px',
            fontSize: '13.5px',
            fontWeight: 600,
            padding: '12px 18px',
            boxShadow: '0 10px 30px -5px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
      <MainRoutes />
    </div>
  )
}

export default App