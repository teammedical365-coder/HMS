import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import { adminAPI } from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi';
import { RiArrowLeftLine } from 'react-icons/ri';
import '../user/Login.css';
import PasswordInput from '../../components/PasswordInput';
import OtpVerification from '../../components/OtpVerification';
import ActiveSessionModal from '../../components/ActiveSessionModal';

const CentralAdminLogin = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg } = useAuth();

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [sessionBanner, setSessionBanner] = useState(null);
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState('');

    // Check for session expired message
    useEffect(() => {
        const msg = sessionStorage.getItem('sessionExpiredMessage');
        if (msg) {
            setSessionBanner(msg);
            sessionStorage.removeItem('sessionExpiredMessage');
        }
    }, []);

    useEffect(() => {
        dispatch(clearError());
        dispatch(resetOtpFlow());
    }, [dispatch]);

    useEffect(() => {
        if (isAuthenticated && user) {
            const role = user.role?.toLowerCase();
            if (role === 'centraladmin' || role === 'superadmin') {
                navigate('/supremeadmin');
            }
        }
    }, [isAuthenticated, user, navigate]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        dispatch(clearError());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        dispatch(clearError());
        setLocalError('');
        if (!formData.email || !formData.password) return;
        setSessionBanner(null);

        try {
            setLocalLoading(true);
            // Use the OTP authentication flow with loginType 'admin'
            // This bypasses hospital tenant scoping on the backend
            const result = await dispatch(sendOtp({
                email: formData.email,
                password: formData.password,
                loginType: 'admin',
                // Explicitly do NOT send hospitalId or hospitalSlug
            })).unwrap();

            // If OTP is bypassed (dev mode) and login completed immediately
            if (result.otpBypassed && !result.activeSessionExists && result.token) {
                localStorage.setItem('superadmin_token', result.token);
                window.location.href = '/supremeadmin';
            }
        } catch (err) {
            const errMsg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : err;
            setLocalError(errMsg || 'Invalid Credentials');
        } finally {
            setLocalLoading(false);
        }
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

    return (
        <section className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
            <AnimatePresence>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="w-full max-w-[1000px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px] border border-slate-200"
                >
                    {/* Left Column Content (White Side) */}
                    <div className="w-full md:w-1/2 p-8 sm:p-12 flex flex-col justify-center bg-white">
                        {!otpStep && (
                            <button onClick={() => navigate('/')} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-8 w-fit font-medium transition-colors" type="button">
                                <RiArrowLeftLine /> <span>Go Back</span>
                            </button>
                        )}

                        <div className="mb-6">
                            <img src="/assets/medical365-logo.png" alt="Medical 365" className="h-10 object-contain mb-8" />
                            
                            {/* Session Expired Banner */}
                            {sessionBanner && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-sm font-semibold text-amber-800"
                                >
                                    ⚠️ {sessionBanner}
                                </motion.div>
                            )}

                            <AnimatePresence mode="wait">
                                {/* ── Step 1: Credentials ── */}
                                {!otpStep && (
                                    <motion.div
                                        key="credentials"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                    >
                                        <h3 className="text-2xl font-bold text-slate-800">Supreme Portal</h3>
                                        <p className="text-slate-500 mt-2 mb-6">Sign in to the system administration dashboard.</p>

                                        {(error || localError) && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium"
                                            >
                                                {error || localError}
                                            </motion.div>
                                        )}

                                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Admin Email</label>
                                                <div className="relative">
                                                    <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                                                    <input
                                                        type="email"
                                                        name="email"
                                                        placeholder="admin@medical365.in"
                                                        value={formData.email}
                                                        onChange={handleChange}
                                                        required
                                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Secret Password</label>
                                                <div className="relative">
                                                    <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg z-10" />
                                                    <div className="[&>div>input]:pl-10 [&>div>input]:pr-10 [&>div>input]:py-2.5 [&>div>input]:rounded-xl [&>div>input]:border [&>div>input]:border-slate-200 [&>div>input]:focus:border-indigo-500 [&>div>input]:focus:ring-2 [&>div>input]:focus:ring-indigo-500/20 [&>div>input]:outline-none [&>div>input]:transition-all [&>div>input]:w-full">
                                                        <PasswordInput
                                                            name="password"
                                                            placeholder="••••••••"
                                                            value={formData.password}
                                                            onChange={handleChange}
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                type="submit" 
                                                disabled={loading || localLoading} 
                                                className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-slate-900/20 flex justify-center items-center"
                                            >
                                                {loading || localLoading ? 'Authenticating...' : 'Access System Control →'}
                                            </button>
                                        </form>
                                    </motion.div>
                                )}

                                {/* ── Step 2: OTP Verification ── */}
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
                        </div>

                        <div className="mt-auto pt-8 text-center text-[10px] tracking-widest text-slate-400 font-bold uppercase">
                            Enterprise Internal Control Node
                        </div>
                    </div>

                    {/* Right Column Content (Dark Side) */}
                    <div className="w-full md:w-1/2 bg-slate-950 text-white p-12 flex flex-col justify-center relative overflow-hidden hidden md:flex">
                        <div className="absolute inset-0 opacity-20 pointer-events-none">
                            <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-indigo-900/40 pointer-events-none"></div>
                        
                        <div className="relative z-10 max-w-sm mx-auto">
                            <div className="inline-block px-3 py-1 mb-6 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-sm font-semibold tracking-wide">
                                System Core
                            </div>
                            <h2 className="text-4xl font-serif font-bold text-white mb-6 leading-tight">Global Oversight.</h2>
                            <p className="text-slate-400 text-lg leading-relaxed">
                                Manage all clinical instances, audit logs, and provider performance from the unified central command.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Active Session Modal */}
            {otpStep === 'session_check' && activeSession && (
                <ActiveSessionModal
                    activeSession={activeSession}
                    onForceLogin={handleForceLogin}
                    onCancel={handleCancelSession}
                    loading={loading}
                />
            )}
        </section>
    );
};

export default CentralAdminLogin;
