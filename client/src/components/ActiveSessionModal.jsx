import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiAlertLine, RiComputerLine, RiGlobalLine, RiTimeLine } from 'react-icons/ri';
import './ActiveSessionModal.css';

/**
 * ActiveSessionModal — shown when an active session is detected for the user.
 * Displays previous device info and offers Cancel / Force Login options.
 *
 * Props:
 *   activeSession — { browser, os, lastActive, loginTime }
 *   onForceLogin  — () => void — logout previous device and continue
 *   onCancel      — () => void — cancel and return to login
 *   loading       — boolean — show loading state on force-login button
 */
const ActiveSessionModal = ({ activeSession, onForceLogin, onCancel, loading }) => {
    if (!activeSession) return null;

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
                            <h3>Active Session Detected</h3>
                            <p>Your account is already logged in on another device.</p>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="session-modal-body">
                        <p className="session-modal-message">
                            Would you like to logout the previous device and continue? 
                            The other session will be immediately terminated.
                        </p>

                        <div className="session-device-info">
                            <div className="session-device-info-title">Previous Session Details</div>

                            <div className="session-device-row">
                                <div className="session-device-row-icon">
                                    <RiGlobalLine />
                                </div>
                                <div>
                                    <div className="session-device-row-label">Browser</div>
                                    <div className="session-device-row-value">
                                        {activeSession.browser || 'Unknown'}
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
                                        {activeSession.os || 'Unknown'}
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
                                        {formatTime(activeSession.lastActive)}
                                    </div>
                                </div>
                            </div>
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
                                    Logging out previous device...
                                </>
                            ) : (
                                'Logout Previous Device & Continue'
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
