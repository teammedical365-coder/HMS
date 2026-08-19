// client/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { store } from './store/store'
import { BrandingProvider } from './context/BrandingContext'
import './index.css'
import App from './App.jsx'

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <Router>
        <BrandingProvider>
          <App />
        </BrandingProvider>
      </Router>
    </Provider>
  </StrictMode>,
)