// client/src/App.jsx
import React, { useEffect } from 'react'
import { MainRoutes } from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
// If you installed lenis via npm, you might need this css import depending on version:
// import 'lenis/dist/lenis.css' 

const App = () => {
  
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