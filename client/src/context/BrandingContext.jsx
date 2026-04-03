/**
 * BrandingContext — White-Label Theme Engine
 *
 * Usage:
 *   - Wrap <App> in <BrandingProvider>
 *   - Call useBranding() to access { branding, hospitalName, loadBranding, resetBranding }
 *   - Branding is auto-applied as CSS custom properties on :root
 *   - Stored in localStorage so it persists across page refreshes
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { hospitalAPI } from '../utils/api';
import socket from '../utils/socket';

// Default Medical 365 branding (platform defaults)
const DEFAULT_BRANDING = {
    appName: 'Medical 365',
    tagline: 'Healthcare Suite',
    logoUrl: 'https://www.medical365.in/logo/medical365fav.jpg',
    faviconUrl: 'https://www.medical365.in/logo/medical365fav.jpg',
    primaryColor: '#14b8a6',
    secondaryColor: '#0a2647',
    accentColor: '#6366f1',
    successColor: '#10b981',
    backgroundColor: '#f8fafc',
    textColor: '#1e293b',
    supportEmail: '',
    supportPhone: '',
    address: '',
    websiteUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    twitterUrl: '',
    footerText: '',
};

const BrandingContext = createContext({
    branding: DEFAULT_BRANDING,
    hospitalName: 'Medical 365',
    hospitalId: null,
    loadBranding: async () => {},
    resetBranding: () => {},
    isCustomBranded: false,
});

/**
 * Apply a branding config as CSS custom properties on :root
 * This drives the entire color system from index.css tokens.
 */
function applyBrandingToCSS(branding) {
    const root = document.documentElement;

    const hex2rgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    };

    const safehex = (v, fallback) => (v && v.startsWith('#') ? v : fallback);

    const primary = safehex(branding.primaryColor, DEFAULT_BRANDING.primaryColor);
    const secondary = safehex(branding.secondaryColor, DEFAULT_BRANDING.secondaryColor);
    const accent = safehex(branding.accentColor, DEFAULT_BRANDING.accentColor);
    const success = safehex(branding.successColor, DEFAULT_BRANDING.successColor);
    const bg = safehex(branding.backgroundColor, DEFAULT_BRANDING.backgroundColor);
    const text = safehex(branding.textColor, DEFAULT_BRANDING.textColor);

    // Override brand color scale using the primary color
    root.style.setProperty('--brand-500', primary);
    root.style.setProperty('--brand-600', primary);
    root.style.setProperty('--brand-700', secondary);
    root.style.setProperty('--brand-50',  `rgba(${hex2rgb(primary)}, 0.08)`);
    root.style.setProperty('--brand-100', `rgba(${hex2rgb(primary)}, 0.14)`);

    // Navy overrides (use secondaryColor as the deep dark)
    root.style.setProperty('--navy-900', secondary);
    root.style.setProperty('--navy-800', secondary);
    root.style.setProperty('--navy-700', secondary);

    // Gradients (overriding CSS vars that the gradients reference)
    root.style.setProperty('--gradient-brand', `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`);
    root.style.setProperty('--gradient-navy',  `linear-gradient(135deg, ${secondary} 0%, ${secondary}cc 100%)`);
    root.style.setProperty('--gradient-success', `linear-gradient(135deg, ${success} 0%, ${success}dd 100%)`);

    // Shadows using brand color
    root.style.setProperty('--shadow-brand', `0 8px 24px rgba(${hex2rgb(primary)}, 0.28)`);

    // Surface / Background
    root.style.setProperty('--surface-1', bg);

    // Text color
    root.style.setProperty('--gray-900', text);
    root.style.setProperty('--gray-800', text);

    // Favicon (if provided)
    if (branding.faviconUrl) {
        let fav = document.querySelector("link[rel*='icon']");
        if (!fav) {
            fav = document.createElement('link');
            fav.rel = 'icon';
            document.head.appendChild(fav);
        }
        fav.href = branding.faviconUrl;
    }

    // Page title / app name
    if (branding.appName) {
        document.title = branding.appName;
    }
}

/**
 * Remove all branding overrides — back to defaults
 */
function resetBrandingFromCSS() {
    const root = document.documentElement;
    const overrides = [
        '--brand-500', '--brand-600', '--brand-700', '--brand-50', '--brand-100',
        '--navy-900', '--navy-800', '--navy-700',
        '--gradient-brand', '--gradient-navy', '--gradient-success',
        '--shadow-brand', '--surface-1', '--gray-900', '--gray-800',
    ];
    overrides.forEach(v => root.style.removeProperty(v));
    document.title = 'Medical 365';
}

export const BrandingProvider = ({ children }) => {
    const [branding, setBranding] = useState(() => {
        try {
            const saved = localStorage.getItem('hospitalBranding');
            return saved ? JSON.parse(saved) : DEFAULT_BRANDING;
        } catch { return DEFAULT_BRANDING; }
    });

    const [hospitalName, setHospitalName] = useState(() => localStorage.getItem('hospitalBrandingName') || 'Medical 365');
    const [hospitalId, setHospitalId] = useState(() => localStorage.getItem('hospitalBrandingId') || null);
    const [isCustomBranded, setIsCustomBranded] = useState(false);

    /**
     * Fetch and apply branding for a specific hospital
     * Can be called from login page, hospital slug resolution, or admin preview
     */
    const loadBranding = useCallback(async (hId) => {
        if (!hId) return;
        try {
            const res = await hospitalAPI.getBranding(hId);
            if (res.success) {
                const merged = { ...DEFAULT_BRANDING, ...res.branding };
                setBranding(merged);
                setHospitalName(res.hospitalName || 'Medical 365');
                setHospitalId(hId);
                setIsCustomBranded(true);
                applyBrandingToCSS(merged);
                // Persist so page refresh retains branding
                localStorage.setItem('hospitalBranding', JSON.stringify(merged));
                localStorage.setItem('hospitalBrandingName', res.hospitalName || '');
                localStorage.setItem('hospitalBrandingId', hId);
            }
        } catch (err) {
            console.warn('[Branding] Could not load hospital branding:', err?.message);
        }
    }, []);

    /**
     * Reset to default Medical 365 branding
     */
    const resetBranding = useCallback(() => {
        setBranding(DEFAULT_BRANDING);
        setHospitalName('Medical 365');
        setHospitalId(null);
        setIsCustomBranded(false);
        resetBrandingFromCSS();
        localStorage.removeItem('hospitalBranding');
        localStorage.removeItem('hospitalBrandingName');
        localStorage.removeItem('hospitalBrandingId');
    }, []);

    // Apply saved branding on mount
    useEffect(() => {
        const saved = localStorage.getItem('hospitalBranding');
        if (saved) {
            try {
                const b = JSON.parse(saved);
                applyBrandingToCSS(b);
                setIsCustomBranded(true);
            } catch { /* ignore */ }
        }
    }, []);

    // Listen for live branding updates from server (Central Admin)
    useEffect(() => {
        const handleUpdate = (data) => {
            // Only update if it's the current hospital or if we're a hospital user
            if (hospitalId && String(data.hospitalId) === String(hospitalId)) {
                console.log('[Branding] Live update received from server for hospital:', data.hospitalId);
                loadBranding(data.hospitalId);
            }
        };

        socket.on('branding_update', handleUpdate);
        return () => socket.off('branding_update', handleUpdate);
    }, [hospitalId, loadBranding]);


    return (
        <BrandingContext.Provider value={{ branding, hospitalName, hospitalId, loadBranding, resetBranding, isCustomBranded }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
export default BrandingContext;
