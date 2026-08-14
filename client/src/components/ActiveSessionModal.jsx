import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiAlertLine, RiComputerLine, RiGlobalLine, RiTimeLine } from 'react-icons/ri';
import './ActiveSessionModal.css';

/**
 * ActiveSessionModal — shown when an active session limit is reached for the user.
 * Displays active device info and offers Cancel / Force Login options.
 *
 * Props:
 *   activeSession  — { browser, os, lastActive, loginTime } or array of sessions
 *   activeSessions — optional array of { browser, os, lastActive, loginTime }
 *   onForceLogin   — () => void — logout previous device and continue
 *   onCancel       — () => void — cancel and return to login
 *   loading        — boolean — show loading state on force-login button
 */
const ActiveSessionModal = ({ activeSession, activeSessions, onForceLogin, onCancel, loading }) => {
    if (!activeSession && (!activeSessions || activeSessions.length === 0)) return null;

    // Normalize active sessions to an array
    const sessionsList = activeSessions && activeSessions.length > 0
        ? activeSessions
        : (Array.isArray(activeSession) ? activeSession : [activeSession]);

    const isMultiple = sessionsList.length > 1;

    const formatTime = (dateStr) => {
        if (!dateStr) return 'Unknown';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
        } catch {
            return 'Unknown';
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                className="session-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <motion.div
                    className="session-modal-card"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                >
                    {/* Header */}
                    <div className="session-modal-header">
                        <div className="session-modal-icon">
                            <RiAlertLine />
                        </div>
                        <div className="session-modal-header-text">
                            <h3>{isMultiple ? 'Active Session Limit Reached' : 'Active Session Detected'}</h3>
                            <p>
                                {isMultiple
                                    ? `Your account is already active on ${sessionsList.length} devices.`
                                    : 'Your account is already logged in on another device.'}
                            </p>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="session-modal-body">
                        <p className="session-modal-message">
                            {isMultiple
                                ? 'Would you like to logout the oldest active device and continue with this new login?'
                                : 'Would you like to logout the previous device and continue? The other session will be immediately terminated.'}
                        </p>

                        <div className="session-device-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto' }}>
                            {sessionsList.map((session, idx) => (
                                <div key={session.sessionId || idx} className="session-device-info">
                                    <div className="session-device-info-title">
                                        {isMultiple ? `Active Device ${idx + 1}` : 'Previous Session Details'}
                                    </div>

                                    <div className="session-device-row">
                                        <div className="session-device-row-icon">
                                            <RiGlobalLine />
                                        </div>
                                        <div>
                                            <div className="session-device-row-label">Browser</div>
                                            <div className="session-device-row-value">
                                                {session.browser || 'Unknown'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="session-device-row">
                                        <div className="session-device-row-icon">
                                            <RiComputerLine />
                                        </div>
                                        <div>
                                            <div className="session-device-row-label">Operating System</div>
                                            <div className="session-device-row-value">
                                                {session.os || 'Unknown'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="session-device-row">
                                        <div className="session-device-row-icon">
                                            <RiTimeLine />
                                        </div>
                                        <div>
                                            <div className="session-device-row-label">Last Active</div>
                                            <div className="session-device-row-value">
                                                {formatTime(session.lastActive)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="session-modal-actions">
                        <button
                            type="button"
                            className="session-btn-force"
                            onClick={onForceLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="session-spinner" />
                                    Logging out device...
                                </>
                            ) : (
                                isMultiple ? 'Logout Oldest Device & Continue' : 'Logout Previous Device & Continue'
                            )}
                        </button>
                        <button
                            type="button"
                            className="session-btn-cancel"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ActiveSessionModal;

