import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiArrowLeftLine, RiMailLine, RiShieldCheckLine } from 'react-icons/ri';
import './OtpVerification.css';

/**
 * OtpVerification — 6-digit OTP input with auto-focus, resend timer, and error display.
 *
 * Props:
 *   email        — masked email string for display
 *   onVerify     — (otp: string) => void — called when user submits OTP
 *   onResend     — () => void — called when user clicks Resend
 *   onBack       — () => void — called when user clicks Back
 *   loading      — boolean — show loading state on verify button
 *   error        — string | null — error message to display
 *   successMsg   — string | null — success message (e.g. "OTP resent")
 */
const OtpVerification = ({ email, onVerify, onResend, onBack, loading, error, successMsg }) => {
    const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
    const [resendTimer, setResendTimer] = useState(30);
    const [hasError, setHasError] = useState(false);
    const inputRefs = useRef([]);

    // Start resend countdown
    useEffect(() => {
        if (resendTimer <= 0) return;
        const timer = setInterval(() => {
            setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendTimer]);

    // Shake on error
    useEffect(() => {
        if (error) {
            setHasError(true);
            const timeout = setTimeout(() => setHasError(false), 500);
            return () => clearTimeout(timeout);
        }
    }, [error]);

    // Auto-focus first input
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = useCallback((index, value) => {
        // Only accept digits
        const digit = value.replace(/\D/g, '').slice(-1);
        const newValues = [...otpValues];
        newValues[index] = digit;
        setOtpValues(newValues);

        // Auto-focus next input
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are entered
        if (digit && index === 5) {
            const fullOtp = newValues.join('');
            if (fullOtp.length === 6) {
                onVerify(fullOtp);
            }
        }
    }, [otpValues, onVerify]);

    const handleKeyDown = useCallback((index, e) => {
        if (e.key === 'Backspace') {
            if (!otpValues[index] && index > 0) {
                inputRefs.current[index - 1]?.focus();
                const newValues = [...otpValues];
                newValues[index - 1] = '';
                setOtpValues(newValues);
            } else {
                const newValues = [...otpValues];
                newValues[index] = '';
                setOtpValues(newValues);
            }
        } else if (e.key === 'Enter') {
            const fullOtp = otpValues.join('');
            if (fullOtp.length === 6) {
                onVerify(fullOtp);
            }
        }
    }, [otpValues, onVerify]);

    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData.length > 0) {
            const newValues = [...otpValues];
            for (let i = 0; i < 6; i++) {
                newValues[i] = pastedData[i] || '';
            }
            setOtpValues(newValues);
            // Focus the next empty input or the last one
            const nextEmpty = newValues.findIndex((v) => !v);
            inputRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();

            // Auto-submit if all 6 digits pasted
            if (pastedData.length === 6) {
                onVerify(pastedData);
            }
        }
    }, [otpValues, onVerify]);

    const handleVerifyClick = () => {
        const fullOtp = otpValues.join('');
        if (fullOtp.length === 6) {
            onVerify(fullOtp);
        }
    };

    const handleResendClick = () => {
        setResendTimer(30);
        setOtpValues(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        onResend();
    };

    const isComplete = otpValues.every((v) => v !== '');

    return (
        <motion.div
            className="otp-verification-container"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
        >
            {onBack && (
                <button type="button" className="otp-back-button" onClick={onBack}>
                    <RiArrowLeftLine /> <span>Back to Login</span>
                </button>
            )}

            <div className="otp-icon-wrapper">
                <RiShieldCheckLine />
            </div>

            <div className="otp-header">
                <h3>Verify Your Identity</h3>
                <p>We've sent a 6-digit verification code to your registered email.</p>
                {email && (
                    <div className="otp-email-badge">
                        <RiMailLine /> {email}
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                {error && (
                    <motion.div
                        key="error"
                        className="otp-error-message"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        {error}
                    </motion.div>
                )}
                {successMsg && (
                    <motion.div
                        key="success"
                        className="otp-success-message"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="otp-input-container" onPaste={handlePaste}>
                {otpValues.map((value, index) => (
                    <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={value}
                        onChange={(e) => handleChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        className={`otp-input-box ${value ? 'has-value' : ''} ${hasError ? 'error' : ''}`}
                        autoComplete="one-time-code"
                        aria-label={`OTP digit ${index + 1}`}
                    />
                ))}
            </div>

            <button
                type="button"
                className="otp-verify-btn"
                onClick={handleVerifyClick}
                disabled={!isComplete || loading}
            >
                {loading ? (
                    <>
                        <span className="otp-spinner" />
                        Verifying...
                    </>
                ) : (
                    'Verify OTP'
                )}
            </button>

            <div className="otp-resend-section">
                {resendTimer > 0 ? (
                    <span className="otp-resend-timer">
                        Resend OTP in {resendTimer}s
                    </span>
                ) : (
                    <>
                        <span>Didn't receive the code?</span>
                        <button
                            type="button"
                            className="otp-resend-btn"
                            onClick={handleResendClick}
                            disabled={loading}
                        >
                            Resend OTP
                        </button>
                    </>
                )}
            </div>
        </motion.div>
    );
};

export default OtpVerification;
