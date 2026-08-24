import React, { Component } from 'react';

/**
 * RouteErrorBoundary — Catches lazy-loading chunk download errors
 * or unhandled route runtime errors gracefully with a Retry option.
 */
class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[RouteErrorBoundary] Uncaught route error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'inherit'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: '#fee2e2',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '28px',
                        marginBottom: '16px'
                    }}>
                        ⚠️
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>
                        Unable to load this page
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '420px', margin: '0 0 20px 0' }}>
                        A temporary network or connection issue occurred while loading this view. Please try reloading.
                    </p>
                    <button
                        type="button"
                        onClick={this.handleRetry}
                        style={{
                            background: 'linear-gradient(135deg, #1E60A4, #38B29B)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '10px 22px',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(30, 96, 164, 0.3)'
                        }}
                    >
                        Retry Loading
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default RouteErrorBoundary;
