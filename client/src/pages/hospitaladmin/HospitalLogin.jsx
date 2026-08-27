import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { getSubdomain } from '../../utils/subdomain';
import { publicAPI } from '../../utils/api';
import NeuralAuthPortal from '../../components/auth/NeuralAuthPortal';

/**
 * HospitalLogin — Subdomain-based hospital login page with NeuralAuthPortal
 * URL: [subdomain].medical365.in/login
 */
const HospitalLogin = () => {
    const hospitalSlug = getSubdomain();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg } = useAuth();
    const { loadBranding } = useBranding();

    const [hospital, setHospital] = useState(null);
    const [hospitalLoading, setHospitalLoading] = useState(true);
    const [hospitalError, setHospitalError] = useState('');
    const [sessionBanner, setSessionBanner] = useState(null);

    // Check for session expired message
    useEffect(() => {
        const msg = sessionStorage.getItem('sessionExpiredMessage');
        if (msg) {
            setSessionBanner(msg);
            sessionStorage.removeItem('sessionExpiredMessage');
        }
    }, []);

    // Intercept SSO token passed from Universal Login
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const ssoToken = params.get('ssoToken');
        const ssoUser = params.get('ssoUser');

        if (ssoToken && ssoUser) {
            try {
                localStorage.setItem('token', ssoToken);
                localStorage.setItem('user', decodeURIComponent(ssoUser));
                
                // Clear URL to prevent token leakage
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Reload to rehydrate state securely
                window.location.reload();
            } catch (err) {
                console.error("SSO Intercept Error:", err);
            }
        }
    }, []);

    // Resolve hospital by domain/slug on mount
    useEffect(() => {
        const resolveHospital = async () => {
            try {
                setHospitalLoading(true);
                const domain = window.location.hostname;
                const res = await publicAPI.getTenantConfig(domain);
                
                if (res.success && res.tenant) {
                    setHospital({
                        _id: res.tenant.id,
                        name: res.tenant.name,
                        slug: res.tenant.slug,
                        logo: res.tenant.branding?.logoUrl,
                        city: res.tenant.branding?.city || ''
                    });
                    
                    if (res.tenant.id) {
                        loadBranding(res.tenant.id);
                    }
                } else {
                    setHospitalError('Hospital not found.');
                }
            } catch (err) {
                setHospitalError(
                    err.response?.data?.message || 'Could not load hospital. Check the URL and try again.'
                );
            } finally {
                setHospitalLoading(false);
            }
        };
        resolveHospital();
    }, [hospitalSlug, loadBranding]);

    // Redirect after successful login
    useEffect(() => {
        if (isAuthenticated && user) {
            const role = (user.role || '').toLowerCase().replace(/\s+/g, '');
            const redirectMap = { 
                nurse: '/doctor/patients',
                otmanager: '/ot/dashboard',
                otstaff: '/ot/dashboard',
                ot: '/ot/dashboard'
            };
            const rawPath = redirectMap[role] || user.dashboardPath || 'my-dashboard';
            const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
            
            navigate(cleanPath, { replace: true });
        }
    }, [isAuthenticated, user, navigate]);

    useEffect(() => {
        dispatch(clearError());
        dispatch(resetOtpFlow());
    }, [dispatch]);

    const handleLoginSubmit = ({ id, password }) => {
        dispatch(clearError());
        setSessionBanner(null);
        dispatch(sendOtp({
            email: id,
            password: password,
            hospitalId: hospital?._id,
            hospitalSlug: hospital?.slug || hospitalSlug,
            loginType: 'staff',
        }));
    };

    const handleVerifyOtp = async (otp) => {
        await dispatch(verifyOtp({ preAuthToken, otp }));
    };

    const handleResendOtp = async () => {
        await dispatch(resendOtp({ preAuthToken }));
    };

    const handleBackToLogin = () => {
        dispatch(resetOtpFlow());
    };

    const handleForceLogin = async () => {
        await dispatch(forceLogin({ preAuthToken }));
    };

    const handleCancelSession = () => {
        dispatch(resetOtpFlow());
    };

    if (hospitalLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#0ea5e9', fontFamily: 'JetBrains Mono, monospace' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '24px' }}></i>
                    <span>Connecting to Hospital Node...</span>
                </div>
            </div>
        );
    }

    if (hospitalError) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#fff', padding: '20px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '20px', padding: '40px', maxWidth: '480px', textAlign: 'center' }}>
                    <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🏥</span>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '10px' }}>Hospital Node Offline</h2>
                    <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>{hospitalError}</p>
                    <button onClick={() => navigate('/login')} style={{ padding: '12px 24px', background: '#9d4edd', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                        Go to Central Uplink
                    </button>
                </div>
            </div>
        );
    }

    return (
        <NeuralAuthPortal
            portalType="hospital"
            title={hospital?.name ? `${hospital.name} Portal` : 'Clinical Portal'}
            subtitle={`Access high-performance medical workspace for ${hospital?.name || 'Hospital Portal'}.`}
            idLabel="Staff Email or ID"
            idPlaceholder="Enter your email or ID"
            idType="text"
            passkeyLabel="Password"
            passkeyPlaceholder="••••••••"
            branding={{
                name: hospital?.name,
                logoUrl: hospital?.logo
            }}
            onLoginSubmit={handleLoginSubmit}
            onVerifyOtp={handleVerifyOtp}
            onResendOtp={handleResendOtp}
            onAbortOtp={handleBackToLogin}
            onForceLogin={handleForceLogin}
            onCancelSession={handleCancelSession}
            otpStep={otpStep}
            otpEmail={otpEmail}
            activeSession={activeSession}
            loading={loading}
            error={error}
            successMsg={otpSuccessMsg}
            sessionBanner={sessionBanner}
        />
    );
};

export default HospitalLogin;
