import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow, pacificDemoLogin } from '../../store/slices/authSlice';
import NeuralAuthPortal from '../../components/auth/NeuralAuthPortal';
import PacificDemoLogin from '../../components/auth/PacificDemoLogin';
import { Capacitor } from '@capacitor/core';
import { baseURL, pacificDemoAPI } from '../../utils/api';
import { useBranding } from '../../context/BrandingContext';
import { getSubdomain } from '../../utils/subdomain';
import { isPacificDemoHost, getDemoDashboardPath } from '../../utils/pacificDemo';

const Login = () => {
    const navigate = useNavigate();
    const { branding } = useBranding();
    const [searchParams] = useSearchParams();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg, tenant } = useAuth();
    
    const [formData, setFormData] = useState({ email: searchParams.get('email') || '', password: '' });
    const [nativeSlug, setNativeSlug] = useState(null);
    const [demoState, setDemoState] = useState({ checked: !isPacificDemoHost(), enabled: false, hospital: null, accounts: [] });
    const [showStandardLogin, setShowStandardLogin] = useState(false);

    // Activate Pacific Hospital Interactive Demo portal ONLY on exact Pacific Hospital subdomain AND when confirmed by backend
    useEffect(() => {
        if (!isPacificDemoHost()) return;
        let active = true;
        pacificDemoAPI.getConfig()
            .then((res) => {
                if (!active) return;
                if (res?.success && res.demoEnabled && Array.isArray(res.accounts) && res.accounts.length > 0) {
                    setDemoState({
                        checked: true,
                        enabled: true,
                        hospital: res.hospital || null,
                        accounts: res.accounts
                    });
                } else {
                    setDemoState({ checked: true, enabled: false, hospital: null, accounts: [] });
                }
            })
            .catch(() => {
                if (active) setDemoState({ checked: true, enabled: false, hospital: null, accounts: [] });
            });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const qEmail = searchParams.get('email');
        if (qEmail) setFormData(prev => ({ ...prev, email: qEmail }));
    }, [searchParams]);

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

            const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1' || window.location.hostname.endsWith('.vercel.app');
            const isFreeOpd = user.subscriptionPlan === 'free_doctor_opd' || parsedTenant?.subscriptionPlan === 'free_doctor_opd' || (user.role || '').toLowerCase().includes('opd');

            if (!isLocal && !isFreeOpd && parsedTenant && parsedTenant.subdomain && !window.location.hostname.includes(parsedTenant.slug)) {
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
                nurse: '/nurse/dashboard',
                staffnurse: '/nurse/dashboard',
                headnurse: '/nurse/dashboard',
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
            let targetPath = user.isPacificDemo && user.demoRoleKey
                ? getDemoDashboardPath(user.demoRoleKey, user.dashboardPath)
                : (redirectMap[role] || redirectMap[(user.role || '').toLowerCase()] || user.dashboardPath || searchParams.get('redirect') || '/my-dashboard');
            if (isFreeOpd || user.subscriptionPlan === 'free_doctor_opd') {
                targetPath = '/opd/tray';
            } else if (role === 'doctor' && user.clinicType === 'clinic') {
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
            const errDetails = typeof err === 'object' ? (err.message || JSON.stringify(err)) : err;
            toast.error(errDetails || 'Failed to send OTP');
        }
    };

    const handleVerifyOtp = async (otp) => await dispatch(verifyOtp({ preAuthToken, otp }));
    const handleResendOtp = async () => await dispatch(resendOtp({ preAuthToken }));
    const handleBackToLogin = () => dispatch(resetOtpFlow());
    const handleForceLogin = async () => await dispatch(forceLogin({ preAuthToken }));
    const handleCancelSession = () => dispatch(resetOtpFlow());

    const handlePacificDemoSelect = async (account) => {
        dispatch(clearError());
        try {
            const payload = typeof account === 'string'
                ? { roleKey: account }
                : { userId: account.userId, roleKey: account.roleCategory };
            const res = await dispatch(pacificDemoLogin(payload)).unwrap();
            const target = getDemoDashboardPath(res?.user?.demoRoleKey || payload.roleKey, res?.user?.dashboardPath || account?.dashboardPath);
            navigate(target, { replace: true });
        } catch (err) {
            const msg = typeof err === 'string' ? err : (err?.message || 'Demo login failed');
            toast.error(msg);
        }
    };

    if (isPacificDemoHost() && !demoState.checked) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07192f', color: '#5eead4', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Loading Pacific Hospital Demo Portal...
            </div>
        );
    }

    if (isPacificDemoHost() && demoState.enabled && !showStandardLogin) {
        return (
            <PacificDemoLogin
                hospital={demoState.hospital}
                accounts={demoState.accounts}
                loading={loading}
                error={error}
                onSelectAccount={handlePacificDemoSelect}
                onShowStandardLogin={() => setShowStandardLogin(true)}
            />
        );
    }

    return (
        <NeuralAuthPortal
            portalType="staff"
            title="Sign In"
            showUnderline={true}
            subtitle="Access your high-performance medical workspace."
            idLabel="Email or Practitioner ID"
            idPlaceholder="Enter your email or ID"
            idType="text"
            passkeyLabel="Password"
            passkeyPlaceholder="••••••••"
            branding={branding}
            initialId={formData.email}
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