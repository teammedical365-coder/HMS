import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import NeuralAuthPortal from '../../components/auth/NeuralAuthPortal';

const CentralAdminLogin = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg } = useAuth();

    const [sessionBanner, setSessionBanner] = useState(null);
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

    const handleLoginSubmit = async ({ id, password }) => {
        dispatch(clearError());
        setLocalError('');
        setSessionBanner(null);

        try {
            const result = await dispatch(sendOtp({
                email: id,
                password: password,
                loginType: 'admin',
            })).unwrap();

            if (result.otpBypassed && !result.activeSessionExists && result.token) {
                localStorage.setItem('token', result.token);
                localStorage.setItem('superadmin_token', result.token);
                if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
                window.location.href = '/supremeadmin';
            }
        } catch (err) {
            const errMsg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : err;
            setLocalError(errMsg || 'Invalid Credentials');
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
        <NeuralAuthPortal
            portalType="admin"
            title="Supreme Portal"
            subtitle="Access Medical365 central system administration core."
            idLabel="Administrator Email"
            idPlaceholder="Enter your administrator email"
            idType="email"
            passkeyLabel="Password"
            passkeyPlaceholder="••••••••"
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
            error={error || localError}
            successMsg={otpSuccessMsg}
            sessionBanner={sessionBanner}
        />
    );
};

export default CentralAdminLogin;
