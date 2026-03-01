import React, { useEffect } from 'react'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
import socket from './utils/socket'
import { useAuth, useAppDispatch } from './store/hooks'
// If you installed lenis via npm, you might need this css import depending on version:
// import 'lenis/dist/lenis.css' 

const App = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && user) {
      socket.connect();
      // Join user-specific room
      socket.emit('join', user._id || user.id);

      // Join role-specific room (if applicable)
      const roleStr = typeof user.role === 'string'
        ? user.role.toLowerCase()
        : user._roleData?.name?.toLowerCase();

      if (roleStr) {
        socket.emit('join', roleStr);
      }

      // Dispatch action on new notification
      socket.on('new_notification', (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
        // Optionally, show a toast here
      });

    } else {
      socket.disconnect();
    }

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, user]);

  // This useEffect handles smooth scrolling and does NOT interfere with routing
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

    return () => {
      lenis.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <MainRoutes />
    </div>
  )
}

export default App