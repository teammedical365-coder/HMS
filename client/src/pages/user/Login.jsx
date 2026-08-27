import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import NeuralAuthPortal from '../../components/auth/NeuralAuthPortal';
import { Capacitor } from '@capacitor/core';
import { baseURL } from '../../utils/api';
import { useBranding } from '../../context/BrandingContext';
import { getSubdomain } from '../../utils/subdomain';

const Login = () => {
    const navigate = useNavigate();
    const { branding } = useBranding();
    const [searchParams] = useSearchParams();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg, tenant } = useAuth();
    
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [nativeSlug, setNativeSlug] = useState(null);

    useEffect(() => {
        dispatch(clearError());
        dispatch(resetOtpFlow());

        // Only use hardcoded tenant injected during build if running on native mobile (Capacitor)
        if (Capacitor.isNativePlatform()) {
            import('../../tenant.js').then((module) => {
                if (module.HARDCODED_TENANT && module.HARDCODED_TENANT.slug) {
                    setNativeSlug(module.HARDCODED_TENANT.slug);
                    localStorage.setItem('tenantSlug', module.HARDCODED_TENANT.slug);
                }
            }).catch(err => {
                console.error('[Login] Could not load tenant.js', err);
            });
        } else {
            // Clean up legacy test fallback from web browser localStorage if present
            const saved = localStorage.getItem('tenantSlug');
            if (saved === 'cityhospital' || saved === 'city-hospital') {
                localStorage.removeItem('tenantSlug');
            }
        }
    }, [dispatch]);

    // Redirect or SSO Handover after successful login
    useEffect(() => {
        if (isAuthenticated && user) {
            // Check if the backend returned a tenant for cross-domain SSO redirect
            const tenantRaw = localStorage.getItem('tenant') || (tenant ? JSON.stringify(tenant) : null);
            let parsedTenant = null;
            try {
                if (tenantRaw) parsedTenant = JSON.parse(tenantRaw);
            } catch (e) { }

            if (parsedTenant && parsedTenant.subdomain) {
                // UNIVERSAL LOGIN SSO HANDOVER:
                // Pass the token securely via query string to their isolated portal and redirect.
                const token = localStorage.getItem('token');
                const encodedUser = encodeURIComponent(localStorage.getItem('user'));
                const targetUrl = `https://${parsedTenant.subdomain}/login?ssoToken=${token}&ssoUser=${encodedUser}`;
                
                // Clear local token on the central portal to maintain pure isolation
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('tenant');
                
                window.location.href = targetUrl;
                return;
            }

            // Normal routing for system users and staff
            const redirectMap = {
                admin: '/admin',
                superadmin: '/superadmin',
                centraladmin: '/supremeadmin',
                doctor: '/doctor/patients',
                nurse: '/doctor/patients',
                lab: '/lab/dashboard',
                pharmacy: '/pharmacy/dashboard',
                reception: '/reception/dashboard',
                receptionist: '/reception/dashboard',
                accountant: '/accountant/dashboard',
                patient: '/dashboard',
                hospitaladmin: '/hospitaladmin',
                'clinic doctor': '/hospitaladmin',
                clinicdoctor: '/hospitaladmin',
                otmanager: '/ot/dashboard',
                otstaff: '/ot/dashboard',
                ot: '/ot/dashboard'
            };
            const role = (user.role || '').toLowerCase().replace(/\s+/g, '');
            let targetPath = redirectMap[role] || redirectMap[(user.role || '').toLowerCase()] || searchParams.get('redirect') || '/my-dashboard';
            if (role === 'doctor' && user.clinicType === 'clinic') {
                targetPath = '/hospitaladmin';
            }
            navigate(targetPath, { replace: true });
        }
    }, [isAuthenticated, user, navigate, searchParams, tenant]);


    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        dispatch(clearError());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        dispatch(clearError());
        if (!formData.email || !formData.password) return;

        let slug = null;
        if (Capacitor.isNativePlatform() && nativeSlug) {
            slug = nativeSlug;
        } else {
            const sub = getSubdomain();
            const validSubdomain = (sub && !['admin', 'www', 'api', 'localhost'].includes(sub)) ? sub : null;
            slug = searchParams.get('slug') || searchParams.get('tenantId') || searchParams.get('hospitalSlug') || validSubdomain || localStorage.getItem('tenantSlug') || null;
        }

        try {
            await dispatch(sendOtp({
                email: formData.email,
                password: formData.password,
                hospitalSlug: slug || undefined,
                loginType: 'staff',
            })).unwrap();
        } catch (err) {
            console.error('[Login] OTP Request Failed:', err);
            const errDetails = typeof err === 'object' ? JSON.stringify(err) : err;
            alert(`[OTP Error]\nEndpoint: ${baseURL}/api/auth/otp/send\nDetails: ${errDetails}`);
        }
    };

    const handleVerifyOtp = async (otp) => await dispatch(verifyOtp({ preAuthToken, otp }));
    const handleResendOtp = async () => await dispatch(resendOtp({ preAuthToken }));
    const handleBackToLogin = () => dispatch(resetOtpFlow());
    const handleForceLogin = async () => await dispatch(forceLogin({ preAuthToken }));
    const handleCancelSession = () => dispatch(resetOtpFlow());

    return (
        <NeuralAuthPortal
            portalType="staff"
            title="Clinical Portal"
            subtitle="Access your high-performance medical workspace."
            idLabel="Email or Practitioner ID"
            idPlaceholder="Enter your email or ID"
            idType="text"
            passkeyLabel="Password"
            passkeyPlaceholder="••••••••"
            branding={branding}
            onLoginSubmit={({ id, password }) => {
                setFormData({ email: id, password });
                let slug = null;
                if (Capacitor.isNativePlatform() && nativeSlug) {
                    slug = nativeSlug;
                } else {
                    const sub = getSubdomain();
                    const validSubdomain = (sub && !['admin', 'www', 'api', 'localhost'].includes(sub)) ? sub : null;
                    slug = searchParams.get('slug') || searchParams.get('tenantId') || searchParams.get('hospitalSlug') || validSubdomain || localStorage.getItem('tenantSlug') || null;
                }
                dispatch(sendOtp({
                    email: id,
                    password: password,
                    hospitalSlug: slug || undefined,
                    loginType: 'staff',
                }));
            }}
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
        />
    );
};

export default Login;