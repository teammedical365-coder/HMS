import React from 'react';
import './InvalidPortalPage.css';

/**
 * InvalidPortalPage — Shown when the current hostname doesn't match
 * any registered Medical365 portal (admin, hospital, or custom domain).
 *
 * This page must:
 * - NOT show a login form
 * - NOT reveal any tenant/hospital information
 * - NOT allow navigation to dashboard/admin routes
 * - Show a clean, professional Medical365-branded error
 */
const InvalidPortalPage = ({ errorType = 'invalid' }) => {
    const hostname = window.location.hostname;
    const isNetworkError = errorType === 'network';

    return (
        <div className="invalid-portal-page">
            {/* Animated background mesh */}
            <div className="invalid-portal-bg-mesh" />
            <div className="invalid-portal-bg-orb invalid-portal-bg-orb-1" />
            <div className="invalid-portal-bg-orb invalid-portal-bg-orb-2" />

            <div className="invalid-portal-card">
                {/* Medical365 Logo */}
                <div className="invalid-portal-logo-wrap">
                    <img
                        src="/assets/logo.png"
                        alt="Medical 365"
                        className="invalid-portal-logo"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                        }}
                    />
                </div>

                {/* Icon */}
                <div className={`invalid-portal-icon ${isNetworkError ? 'network-error' : ''}`}>
                    {isNetworkError ? (
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 1l22 22" />
                            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                            <line x1="12" y1="20" x2="12.01" y2="20" />
                        </svg>
                    ) : (
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    )}
                </div>

                {/* Title */}
                <h1 className="invalid-portal-title">
                    {isNetworkError ? 'Connection Error' : 'Invalid Portal Address'}
                </h1>

                {/* Description */}
                <p className="invalid-portal-desc">
                    {isNetworkError ? (
                        <>
                            Unable to connect to the Medical365 server to verify this portal.
                            <br />
                            Please check your internet connection and try again.
                        </>
                    ) : (
                        <>
                            The address <strong className="invalid-portal-hostname">{hostname}</strong> is not
                            associated with a valid Medical365 portal.
                        </>
                    )}
                </p>

                {/* Guidance */}
                <div className="invalid-portal-guidance">
                    {isNetworkError ? (
                        <button
                            className="invalid-portal-btn invalid-portal-btn-retry"
                            onClick={() => window.location.reload()}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                            Retry Connection
                        </button>
                    ) : (
                        <>
                            <p className="invalid-portal-hint">
                                Please verify the URL or contact your hospital administrator.
                            </p>
                            <a
                                href="https://medical365.in"
                                className="invalid-portal-btn"
                                rel="noopener noreferrer"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                    <polyline points="9 22 9 12 15 12 15 22" />
                                </svg>
                                Go to Medical365
                            </a>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="invalid-portal-footer">
                    <span>Medical 365</span>
                    <span className="invalid-portal-sep">•</span>
                    <span>Healthcare Suite</span>
                </div>
            </div>
        </div>
    );
};

export default InvalidPortalPage;
