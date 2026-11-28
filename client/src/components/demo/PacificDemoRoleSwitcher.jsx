import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiRepeat, FiSearch, FiUsers, FiCheck } from 'react-icons/fi';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { pacificDemoSwitchRole } from '../../store/slices/authSlice';
import { pacificDemoAPI } from '../../utils/api';
import {
    isPacificDemoHost,
    PACIFIC_ROLE_FILTERS,
    getDemoDashboardPath
} from '../../utils/pacificDemo';
import './PacificDemoRoleSwitcher.css';

const CORE_CATEGORIES = new Set(['hospitaladmin', 'doctor', 'reception', 'lab', 'accountant', 'nurse', 'pharmacy']);

/**
 * PacificDemoRoleSwitcher — Persistent Sidebar Demo User Switcher
 * ONLY active inside verified Pacific Hospital Demo sessions on `https://pacifichospital.medical365.in/`.
 */
const PacificDemoRoleSwitcher = ({ compact = false, onRoleSwitched }) => {
    const { user, loading } = useAuth();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

    const [accounts, setAccounts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [switchingId, setSwitchingId] = useState(null);
    const [loadingList, setLoadingList] = useState(false);

    const isPacificDemoSession = isPacificDemoHost() && Boolean(user?.isPacificDemo);
    const activeUserId = String(user?.id || user?._id || '');

    useEffect(() => {
        if (!isPacificDemoSession || compact) return;
        let active = true;
        setLoadingList(true);
        pacificDemoAPI.getConfig()
            .then((res) => {
                if (active && res?.demoEnabled && Array.isArray(res.accounts)) {
                    setAccounts(res.accounts);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setLoadingList(false);
            });
        return () => { active = false; };
    }, [isPacificDemoSession, compact]);

    const filteredAccounts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return accounts.filter((acc) => {
            if (roleFilter === 'other') {
                if (CORE_CATEGORIES.has(acc.roleCategory)) return false;
            } else if (roleFilter !== 'all' && acc.roleCategory !== roleFilter) {
                return false;
            }
            if (!q) return true;
            const hay = `${acc.name} ${acc.roleName} ${(acc.departments || []).join(' ')} ${acc.specialty || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [accounts, roleFilter, searchQuery]);

    // Strictly render ONLY inside genuine backend-verified Pacific Demo session on Pacific host
    if (!isPacificDemoSession) {
        return null;
    }

    const handleSwitch = async (acc) => {
        if (!acc || switchingId || loading) return;
        if (String(acc.userId) === activeUserId) return;

        setSwitchingId(acc.userId);
        try {
            const res = await dispatch(
                pacificDemoSwitchRole({ userId: acc.userId, roleKey: acc.roleCategory })
            ).unwrap();
            const targetPath = getDemoDashboardPath(
                res?.user?.demoRoleKey || acc.roleCategory,
                res?.user?.dashboardPath || acc.dashboardPath
            );
            toast.success(`Switched to ${res?.user?.name || acc.name} (${res?.user?.role || acc.roleName})`);
            if (typeof onRoleSwitched === 'function') onRoleSwitched(acc);
            navigate(targetPath, { replace: true });
        } catch (err) {
            const msg = typeof err === 'string' ? err : (err?.message || 'Account switch failed');
            toast.error(msg);
        } finally {
            setSwitchingId(null);
        }
    };

    if (compact) {
        return (
            <div className="pacific-switcher-compact" title={`Demo Switcher — Active: ${user?.name || 'User'}`}>
                <div className="pacific-switcher-compact-icon">
                    <FiRepeat size={14} />
                </div>
                <span className="pacific-compact-dot" title={user?.name} />
            </div>
        );
    }

    const activeAccount = accounts.find((a) => String(a.userId) === activeUserId);
    const activeRoleLabel = activeAccount?.roleName || user?.role || 'Staff';
    const activeDeptLabel = activeAccount?.departments?.length
        ? activeAccount.departments[0]
        : (user?.departments?.[0] || '');

    return (
        <div className="pacific-role-switcher" data-testid="pacific-demo-user-switcher">
            <div className="pacific-switcher-header">
                <FiRepeat size={13} className="pacific-switcher-icon" />
                <span>DEMO USER SWITCHER</span>
                <span className="pacific-switcher-count">{accounts.length}</span>
            </div>

            {/* Active User Pill */}
            <div className="pacific-active-user-card" title="Currently active account">
                <div className="pacific-active-user-label">ACTIVE ACCOUNT</div>
                <div className="pacific-active-user-name">{user?.name || 'Demo User'}</div>
                <div className="pacific-active-user-meta">
                    <span>{activeRoleLabel}</span>
                    {activeDeptLabel ? <span> · {activeDeptLabel}</span> : null}
                </div>
            </div>

            {/* Search & Role Filter */}
            <div className="pacific-sw-controls">
                <div className="pacific-sw-search-wrap">
                    <FiSearch size={12} className="pacific-sw-search-ico" />
                    <input
                        type="text"
                        className="pacific-sw-search"
                        placeholder="Search user name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search demo users by name"
                    />
                </div>
                <select
                    className="pacific-sw-filter"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    aria-label="Filter demo users by role"
                >
                    {PACIFIC_ROLE_FILTERS.map((f) => (
                        <option key={f.key} value={f.key}>
                            {f.label === 'All' ? 'All Roles' : f.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Scrollable Account List */}
            <div className="pacific-switcher-list">
                {loadingList && accounts.length === 0 ? (
                    <div className="pacific-sw-empty">Loading users...</div>
                ) : filteredAccounts.length === 0 ? (
                    <div className="pacific-sw-empty">No matching users</div>
                ) : (
                    filteredAccounts.map((acc) => {
                        const isActive = String(acc.userId) === activeUserId;
                        const isBusy = switchingId === acc.userId;
                        const dept = acc.departments?.[0] || acc.specialty || '';
                        return (
                            <button
                                key={acc.userId}
                                type="button"
                                className={`pacific-switcher-btn ${isActive ? 'active' : ''}`}
                                disabled={Boolean(switchingId)}
                                onClick={() => handleSwitch(acc)}
                                title={`${acc.name} — ${acc.roleName}${dept ? ` (${dept})` : ''}`}
                            >
                                <div className="pacific-sw-user-info">
                                    <div className="pacific-sw-label">{acc.name}</div>
                                    <div className="pacific-sw-sub">
                                        {acc.roleName}{dept ? ` · ${dept}` : ''}
                                    </div>
                                </div>
                                <div className="pacific-sw-status">
                                    {isBusy ? (
                                        <span className="pacific-sw-spinner" />
                                    ) : isActive ? (
                                        <FiCheck size={13} />
                                    ) : (
                                        <FiUsers size={12} opacity={0.55} />
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PacificDemoRoleSwitcher;
