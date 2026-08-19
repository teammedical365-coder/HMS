import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi';
import { RiInformationLine } from 'react-icons/ri';
import PasswordInput from '../../components/PasswordInput';
import OtpVerification from '../../components/OtpVerification';
import ActiveSessionModal from '../../components/ActiveSessionModal';
import { Capacitor } from '@capacitor/core';
import { baseURL } from '../../utils/api';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg, tenant } = useAuth();
    
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [nativeSlug, setNativeSlug] = useState(null);

    useEffect(() => {
        dispatch(clearError());
        dispatch(resetOtpFlow());

        // Use hardcoded tenant injected during build if available
        import('../../tenant.js').then((module) => {
            if (module.HARDCODED_TENANT && module.HARDCODED_TENANT.slug) {
                setNativeSlug(module.HARDCODED_TENANT.slug);
                localStorage.setItem('tenantSlug', module.HARDCODED_TENANT.slug);
            }
        }).catch(err => {
            console.error('[Login] Could not load tenant.js', err);
        });
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

            // Normal routing for central admins / system users without specific subdomains
            const role = (user.role || '').toLowerCase();
            const redirectMap = {
                superadmin: '/superadmin', centraladmin: '/supremeadmin', admin: '/supremeadmin'
            };
            const targetPath = redirectMap[role] || searchParams.get('redirect') || '/my-dashboard';
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

        let slug = searchParams.get('slug') || searchParams.get('tenantId') || localStorage.getItem('tenantSlug') || 'cityhospital';
        if (nativeSlug) {
            slug = nativeSlug;
        }

        try {
            await dispatch(sendOtp({
                email: formData.email,
                password: formData.password,
                hospitalSlug: slug,
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
        <section className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl border border-slate-100"
            >
                <div className="text-center">
                    <img src="https://www.medical365.in/logo/medical365fav.jpg" alt="Medical 365" className="max-w-[180px] h-auto mx-auto mb-4" />
                </div>

                <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800">Sign In</h3>
                    <p className="text-sm text-slate-500 mt-1">Enter your credentials to access your account.</p>
                </div>

                <AnimatePresence mode="wait">
                    {!otpStep && (
                        <motion.div
                            key="credentials"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            {error && (
                                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                                    <div className="relative">
                                        <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            required
                                            placeholder="Enter your email"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                                    <div className="relative">
                                        <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg z-10" />
                                        <div className="[&>div>input]:pl-10 [&>div>input]:pr-10 [&>div>input]:py-2.5 [&>div>input]:rounded-xl [&>div>input]:border [&>div>input]:border-slate-200 [&>div>input]:focus:border-teal-500 [&>div>input]:focus:ring-2 [&>div>input]:focus:ring-teal-500/20 [&>div>input]:outline-none [&>div>input]:transition-all [&>div>input]:w-full">
                                            <PasswordInput
                                                name="password"
                                                value={formData.password}
                                                onChange={handleChange}
                                                required
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full mt-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-teal-500/30 flex justify-center items-center"
                                >
                                    {loading ? 'Authenticating...' : 'Sign In'}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {otpStep === 'otp' && (
                        <motion.div
                            key="otp"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <OtpVerification
                                email={otpEmail}
                                onVerify={handleVerifyOtp}
                                onResend={handleResendOtp}
                                onBack={handleBackToLogin}
                                loading={loading}
                                error={error}
                                successMsg={otpSuccessMsg}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {otpStep === 'session_check' && activeSession && (
                    <ActiveSessionModal
                        activeSession={activeSession}
                        onForceLogin={handleForceLogin}
                        onCancel={handleCancelSession}
                        loading={loading}
                    />
                )}
            </motion.div>
        </section>
    );
};

export default Login;