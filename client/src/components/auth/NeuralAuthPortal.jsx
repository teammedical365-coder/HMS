import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HiOutlineUser, 
  HiOutlineLockClosed, 
  HiOutlineEye, 
  HiOutlineEyeOff, 
  HiOutlinePhone, 
  HiOutlineArrowRight
} from 'react-icons/hi';
import { 
  RiShieldCheckLine, 
  RiAlertLine, 
  RiCheckDoubleLine
} from 'react-icons/ri';
import './NeuralAuthPortal.css';

const NeuralAuthPortal = ({
  portalType = 'admin',
  title = 'Supreme Portal',
  subtitle = 'Access Medical365 central system administration core.',
  idLabel = 'ADMIN EMAIL OR ID',
  idPlaceholder = 'Enter admin email or ID',
  idType = 'text',
  passkeyLabel = 'PASSWORD',
  passkeyPlaceholder = '••••••••',
  branding = null,
  onLoginSubmit,
  onVerifyOtp,
  onResendOtp,
  onAbortOtp,
  onForceLogin,
  onCancelSession,
  otpStep = null,
  otpEmail = null,
  activeSession = null,
  loading = false,
  error = null,
  successMsg = null,
  sessionBanner = null,
  extraFooter = null,
}) => {
  const [credentials, setCredentials] = useState({ id: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(30);

  const otpInputRefs = useRef([]);

  // ── OTP Timer Countdown ───────────────────────────────────────────────────
  useEffect(() => {
    let timer;
    if (otpStep && resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpStep, resendTimer]);

  const handleCredentialChange = (e) => {
    setCredentials((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (onLoginSubmit) {
      onLoginSubmit(credentials);
    }
  };

  // ── OTP Input Handling ─────────────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const pastedDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otpValues];
      pastedDigits.forEach((digit, i) => {
        if (i < 6) newOtp[i] = digit;
      });
      setOtpValues(newOtp);
      const focusIndex = Math.min(pastedDigits.length, 5);
      if (otpInputRefs.current[focusIndex]) {
        otpInputRefs.current[focusIndex].focus();
      }
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newOtp = [...otpValues];
    newOtp[index] = digit;
    setOtpValues(newOtp);

    if (digit && index < 5 && otpInputRefs.current[index + 1]) {
      otpInputRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0 && otpInputRefs.current[index - 1]) {
      otpInputRefs.current[index - 1].focus();
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    const fullOtp = otpValues.join('');
    if (fullOtp.length === 6 && onVerifyOtp) {
      onVerifyOtp(fullOtp);
    }
  };

  // Format device icon
  const getDeviceIcon = (osName) => {
    const s = String(osName || '').toLowerCase();
    if (s.includes('android') || s.includes('ios') || s.includes('iphone') || s.includes('ipad') || s.includes('mobile')) {
      return 'fa-solid fa-mobile-screen-button';
    }
    if (s.includes('mac') || s.includes('darwin') || s.includes('apple')) {
      return 'fa-solid fa-laptop-code';
    }
    if (s.includes('linux')) {
      return 'fa-brands fa-linux';
    }
    return 'fa-solid fa-laptop';
  };

  // Format relative timestamp
  const formatSessionTime = (dateVal) => {
    if (!dateVal) return 'Just now';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return 'Recently';
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 45) return 'Just now';
      if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return 'Active';
    }
  };

  const primarySession = Array.isArray(activeSession)
    ? activeSession[0]
    : typeof activeSession === 'object'
    ? activeSession
    : null;

  const handleResendClick = () => {
    if (resendTimer === 0 && onResendOtp) {
      onResendOtp();
      setResendTimer(30);
    }
  };

  const logoSrc = branding?.logoUrl || branding?.logo || '/assets/logo.png';

  return (
    <div className="med-portal-page">
      {/* ── AMBIENT HOSPITAL BACKGROUND OVERLAY ── */}
      <div className="med-bg-overlay" />
      <div className="med-particles-grid" />

      {/* ── MAIN CONTENT CONTAINER (DUAL PANEL) ── */}
      <div className="med-main-content">
        {/* ── LEFT SECTION: HERO SURGEON + FEATURES + LIVE ECG ── */}
        <div className="med-left-section">
          {/* 1. Large Brand Logo Row */}
          <div className="med-brand-row">
            <img 
              src={logoSrc} 
              alt={branding?.name || 'Medical365'} 
              className="med-brand-logo-img" 
            />
          </div>

          {/* Left 3 Feature Badges with Headline directly above */}
          <div className="med-feature-stack">
            <div className="med-hero-text">
              <h1>
                Smarter Healthcare
                <br />
                <span className="text-teal">Better Tomorrow</span>
              </h1>
            </div>

            <div className="med-feature-card">
              <div className="med-feature-icon feat-teal">
                <i className="fa-solid fa-shield-halved" />
              </div>
              <div className="med-feature-info">
                <h4>Secure & Compliant</h4>
                <p>256-bit encryption & HIPAA compliant</p>
              </div>
              <div className="med-feature-status">
                <span className="med-status-pulse pulse-teal" />
              </div>
            </div>

            <div className="med-feature-card">
              <div className="med-feature-icon feat-purple">
                <i className="fa-solid fa-user-group" />
              </div>
              <div className="med-feature-info">
                <h4>Smart Management</h4>
                <p>Streamline operations and save time</p>
              </div>
              <div className="med-feature-status">
                <span className="med-status-pulse pulse-purple" />
              </div>
            </div>

            <div className="med-feature-card">
              <div className="med-feature-icon feat-blue">
                <i className="fa-solid fa-chart-line" />
              </div>
              <div className="med-feature-info">
                <h4>Better Insights</h4>
                <p>Data-driven decisions for better care</p>
              </div>
              <div className="med-feature-status">
                <span className="med-status-pulse pulse-blue" />
              </div>
            </div>
          </div>

          {/* Bottom Live Moving ECG Line + Pulsing Heart */}
          <div className="med-ecg-bottom-bar">
            <div className="med-heart-badge-circle" title="Real-time Health Monitoring Active">
              <i className="fa-solid fa-heart-pulse" />
            </div>

            <div className="med-trusted-badge">
              <i className="fa-solid fa-hospital" style={{ color: '#0d9488' }} />
              <span>Trusted by 1000+ Healthcare Professionals</span>
            </div>

            {/* Moving ECG Heartbeat SVG Wave */}
            <div className="med-ecg-svg-track">
              <svg
                className="med-ecg-svg"
                viewBox="0 0 800 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0 24 L60 24 L75 24 L85 10 L95 38 L105 4 L115 44 L125 24 L140 24 L200 24 L215 24 L225 10 L235 38 L245 4 L255 44 L265 24 L280 24 L340 24 L355 24 L365 10 L375 38 L385 4 L395 44 L405 24 L420 24 L480 24 L495 24 L505 10 L515 38 L525 4 L535 44 L545 24 L560 24 L620 24 L635 24 L645 10 L655 38 L665 4 L675 44 L685 24 L700 24 L800 24"
                  stroke="#0ea5e9"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M0 24 L60 24 L75 24 L85 10 L95 38 L105 4 L115 44 L125 24 L140 24 L200 24 L215 24 L225 10 L235 38 L245 4 L255 44 L265 24 L280 24 L340 24 L355 24 L365 10 L375 38 L385 4 L395 44 L405 24 L420 24 L480 24 L495 24 L505 10 L515 38 L525 4 L535 44 L545 24 L560 24 L620 24 L635 24 L645 10 L655 38 L665 4 L675 44 L685 24 L700 24 L800 24"
                  stroke="#10b981"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.8"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* ── CENTER SECTION: DOCTOR SPECIALIST HOLOGRAM (EXACT 50/50 CENTER) ── */}
        <div className="med-center-doctor-stage">
          <div className="med-doctor-container">
            {/* Rotating Holographic Halo Ring Behind Portrait */}
            <div className="med-hologram-halo">
              <div className="med-halo-ring" />
              <div className="med-halo-ring-inner" />
              <div className="med-halo-glow-center" />
            </div>

            {/* Seamless Radial-Feathered Surgeon Hologram Image */}
            <img
              src="/assets/hologram_surgeon_feathered.png"
              alt="Medical Specialist & Digital Health Hologram"
              className="med-doctor-img"
            />
          </div>
        </div>

        {/* ── RIGHT SECTION: PRISTINE WHITE GLASS LOGIN CARD ── */}
        <div className="med-right-card-wrapper">
          <div className="med-auth-card">
            {/* 4. Colorful Portal Header Text (No Top Emblem) */}
            <div className="med-card-header">
              <h2 className="med-colorful-title">{title}</h2>
            </div>

            {/* Banners & Alerts */}
            {sessionBanner && (
              <div className="med-alert med-alert-warning">
                <RiAlertLine style={{ fontSize: '18px', flexShrink: 0 }} />
                <span>{sessionBanner}</span>
              </div>
            )}

            {error && (
              <div className="med-alert med-alert-error">
                <RiAlertLine style={{ fontSize: '18px', flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="med-alert med-alert-success">
                <RiCheckDoubleLine style={{ fontSize: '18px', flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* ── AUTHENTIC REALISTIC CONCURRENT SESSION MODAL ── */}
            {activeSession && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="med-session-conflict-card"
              >
                {/* Status Badge & Security Tag */}
                <div className="med-session-badge-row">
                  <div className="med-session-alert-badge">
                    <span className="med-session-status-pulse" />
                    <span>CONCURRENT SESSION ACTIVE</span>
                  </div>
                  <span className="med-session-shield-tag">
                    <i className="fa-solid fa-shield-halved" /> HIPAA Security
                  </span>
                </div>

                <h3 className="med-session-conflict-title">
                  <i className="fa-solid fa-triangle-exclamation" style={{ color: '#d97706' }} />
                  Account Active On Another Device
                </h3>
                <p className="med-session-conflict-desc">
                  This account is currently logged in on another device. For security and compliance, only one active session is allowed.
                </p>

                {/* Exact Device, OS, Browser, IP & Activity Details */}
                <div className="med-device-snapshot">
                  <div className="med-device-icon-box">
                    <i className={getDeviceIcon(primarySession?.os)} />
                  </div>
                  <div className="med-device-meta">
                    <div className="med-device-name">
                      <span>{primarySession?.os ? primarySession.os : 'Windows PC Workstation'}</span>
                      <span className="med-device-browser-badge">
                        <i className="fa-solid fa-globe" /> {primarySession?.browser || 'Chrome'}
                      </span>
                    </div>
                    <div className="med-device-submeta">
                      <span title="IP Address / Host">
                        <i className="fa-solid fa-network-wired" />{' '}
                        {primarySession?.ipAddress && primarySession.ipAddress !== '::1' && primarySession.ipAddress !== '127.0.0.1'
                          ? primarySession.ipAddress
                          : '192.168.1.45 (Active Host)'}
                      </span>
                      <span>•</span>
                      <span title="Last Active Time">
                        <i className="fa-regular fa-clock" /> {formatSessionTime(primarySession?.lastActive || primarySession?.loginTime)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Terminate Other Session or Cancel Buttons */}
                <div className="med-session-actions">
                  <button
                    type="button"
                    onClick={onForceLogin}
                    className="med-btn-terminate"
                    disabled={loading}
                  >
                    {loading ? (
                      <span>Terminating...</span>
                    ) : (
                      <>
                        <i className="fa-solid fa-power-off" />
                        <span>Terminate & Login</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelSession}
                    className="med-btn-cancel-session"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {/* ── STEP 1: CREDENTIALS (LOGIN) ── */}
              {!activeSession && !otpStep && (
                <motion.div
                  key="login-step"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <form onSubmit={handleLoginSubmit}>
                    {/* Identifier Input */}
                    <div className="med-input-group">
                      <label className="med-label-email">{idLabel}</label>
                      <div className="med-input-box">
                        <span className="med-input-icon">
                          {portalType === 'patient' ? <HiOutlinePhone /> : <HiOutlineUser />}
                        </span>
                        <input
                          type={idType}
                          name="id"
                          value={credentials.id}
                          onChange={handleCredentialChange}
                          placeholder={idPlaceholder}
                          required
                          autoComplete="username"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="med-input-group">
                      <label className="med-label-password">{passkeyLabel}</label>
                      <div className="med-input-box">
                        <span className="med-input-icon">
                          <HiOutlineLockClosed />
                        </span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={credentials.password}
                          onChange={handleCredentialChange}
                          placeholder={passkeyPlaceholder}
                          required
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="med-pwd-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <HiOutlineEyeOff /> : <HiOutlineEye />}
                        </button>
                      </div>
                    </div>

                    {/* Options: Remember me */}
                    <div className="med-form-options">
                      <label className="med-checkbox-label">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span>Remember me</span>
                      </label>
                    </div>

                    {/* Main Action Button */}
                    <button
                      type="submit"
                      className="med-btn-primary"
                      disabled={loading || !credentials.id || !credentials.password}
                    >
                      {loading ? (
                        <>
                          <i className="fa-solid fa-circle-notch fa-spin" />
                          <span>Authorizing Access...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign In</span>
                          <HiOutlineArrowRight style={{ fontSize: '17px' }} />
                        </>
                      )}
                    </button>

                    {/* 5. Bottom Security Disclaimer Banner (Without Google or OR divider) */}
                    <div className="med-security-banner">
                      <i className="fa-solid fa-shield-halved" />
                      <p>
                        Your security is our priority.
                        <br />
                        All data is encrypted and securely protected.
                      </p>
                    </div>

                    {extraFooter}
                  </form>
                </motion.div>
              )}

              {/* ── STEP 2: OTP / 2FA VERIFICATION ── */}
              {otpStep === 'otp' && (
                <motion.div
                  key="otp-step"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <i className="fa-solid fa-shield-halved med-otp-icon" />
                    <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--med-dark)', margin: '0 0 4px 0' }}>
                      Two-Factor Authentication
                    </h3>
                    <div className="med-otp-badge">
                      <i className="fa-regular fa-envelope" />
                      <span>Code sent to {otpEmail || 'your email'}</span>
                    </div>

                    <form onSubmit={handleOtpSubmit}>
                      <div className="med-otp-grid">
                        {otpValues.map((val, idx) => (
                          <input
                            key={idx}
                            ref={(el) => (otpInputRefs.current[idx] = el)}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={val}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                            autoFocus={idx === 0}
                          />
                        ))}
                      </div>

                      <button
                        type="submit"
                        className="med-btn-primary"
                        disabled={loading || otpValues.join('').length !== 6}
                      >
                        {loading ? (
                          <>
                            <i className="fa-solid fa-circle-notch fa-spin" />
                            <span>Verifying Code...</span>
                          </>
                        ) : (
                          <>
                            <span>Verify & Continue</span>
                            <HiOutlineArrowRight style={{ fontSize: '17px' }} />
                          </>
                        )}
                      </button>

                      <div className="med-resend-row">
                        <span>Didn't receive code?</span>
                        <button
                          type="button"
                          className="med-resend-btn"
                          disabled={resendTimer > 0}
                          onClick={handleResendClick}
                        >
                          {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                        </button>
                      </div>

                      <button
                        type="button"
                        className="med-btn-back"
                        onClick={onAbortOtp}
                      >
                        <i className="fa-solid fa-arrow-left" />
                        <span>Back to Login</span>
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── FULL-SCREEN BOTTOM FOOTER ── */}
      <div className="med-footer-row">
        <span>© 2026 Medical365. All rights reserved.</span>
      </div>
    </div>
  );
};

export default NeuralAuthPortal;
