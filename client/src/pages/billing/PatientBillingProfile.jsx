import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { billingAPI, admissionAPI, patientAPI, uploadAPI, hospitalAPI, refundAdminAPI, refundReceptionAPI, accountantAPI } from '../../utils/api';
import { 
    FaEye, FaDownload, FaSearch, FaHistory, FaSyncAlt, FaExternalLinkAlt, 
    FaMoneyBillWave, FaQrcode, FaRupeeSign, FaCreditCard, FaFileAlt, 
    FaCheckCircle, FaPlus, FaEllipsisV, FaCopy, FaTimes, FaCalendarAlt, 
    FaClock, FaChevronLeft, FaChevronRight, FaChevronDown, FaUsers, FaSortAmountDown, FaChartLine, FaFilter
} from 'react-icons/fa';
import PaymentSection from '../../components/PaymentSection';
import './PatientBillingProfile.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);

const formatPatientName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};

const formatTimeStr = (tStr) => {
    if (!tStr) return '';
    const s = String(tStr).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (m) {
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ampm = m[3];
        if (ampm) {
            return `${String(h).padStart(2, '0')}:${min} ${ampm.toUpperCase()}`;
        }
        const suffix = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${String(h).padStart(2, '0')}:${min} ${suffix}`;
    }
    return s;
};

const fmtDate = (d, apptTime = '') => {
    if (!d) return '—';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '—';

    const hours = dateObj.getHours();
    const minutes = dateObj.getMinutes();

    // If date has 00:00:00 UTC (which produces 05:30 am in IST) or 00:00 local, and apptTime is present, format with apptTime
    if (apptTime && ((hours === 5 && minutes === 30) || (hours === 0 && minutes === 0))) {
        const datePart = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return `${datePart}, ${formatTimeStr(apptTime)}`;
    }

    return dateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const getBookingDateTime = (t) => {
    if (!t) return { dateStr: '—', timeStr: '' };

    // 1. Resolve exact booking/transaction timestamp
    let dt = null;
    const candidates = [
        t.bookingCreatedAt,
        t.billedItems?.appointments?.[0]?.createdAt,
        t.paymentDate,
        t.createdAt,
        t.appointmentDate
    ];

    for (const c of candidates) {
        if (c) {
            const d = new Date(c);
            if (!isNaN(d.getTime())) {
                // Avoid using midnight UTC artifacts if better candidate exists
                const h = d.getHours();
                const m = d.getMinutes();
                const isMidnight = (h === 5 && m === 30) || (h === 0 && m === 0);
                if (!isMidnight || !dt) {
                    dt = d;
                    if (!isMidnight) break;
                }
            }
        }
    }

    // 2. Fallback to ObjectId timestamp if needed
    if (!dt && t._id) {
        const rawId = String(t._id).replace(/^appt_payment_/, '');
        if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
            try {
                const epoch = parseInt(rawId.substring(0, 8), 16) * 1000;
                const idDate = new Date(epoch);
                if (!isNaN(idDate.getTime())) {
                    dt = idDate;
                }
            } catch (e) {}
        }
    }

    if (!dt) dt = new Date();

    // Format date string (e.g., 16 Sept 2026)
    const dateStr = dt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    // Format exact booking time string (e.g., 12:34 PM, 04:48 PM)
    const timeStr = dt.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    return { dateStr, timeStr };
};

const getTxnTimestamp = (t) => {
    if (!t) return 0;
    const candidates = [
        t.paymentDate,
        t.bookingCreatedAt,
        t.billedItems?.appointments?.[0]?.createdAt,
        t.createdAt,
        t.appointmentDate
    ];
    for (const c of candidates) {
        if (c) {
            const d = new Date(c);
            const tm = d.getTime();
            if (!isNaN(tm) && tm > 0) return tm;
        }
    }
    if (t._id) {
        const rawId = String(t._id).replace(/^appt_payment_/, '');
        if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
            try {
                const epoch = parseInt(rawId.substring(0, 8), 16) * 1000;
                if (!isNaN(epoch) && epoch > 0) return epoch;
            } catch (e) {}
        }
    }
    return 0;
};


const getAvatarStyle = (name = 'P') => {
    const char = (name.charAt(0) || 'P').toUpperCase();
    if (char === 'M') return { bg: '#dbeafe', color: '#1d4ed8' };
    if (char === 'P') return { bg: '#fce7f3', color: '#db2777' };
    if (char === 'J') return { bg: '#ede9fe', color: '#7c3aed' };
    if (['A', 'B', 'C', 'D'].includes(char)) return { bg: '#dcfce7', color: '#15803d' };
    if (['E', 'F', 'G', 'H'].includes(char)) return { bg: '#ffedd5', color: '#c2410c' };
    if (['K', 'L', 'N', 'O'].includes(char)) return { bg: '#e0e7ff', color: '#4338ca' };
    if (['Q', 'R', 'S', 'T'].includes(char)) return { bg: '#ccfbf1', color: '#0f766e' };
    return { bg: '#f1f5f9', color: '#475569' };
};

const handleCopy = (text) => {
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text);
    toast.success('Transaction ID copied to clipboard!');
};

const getSurgeryDateTime = (s) => {
    if (!s) return { dateStr: '—', timeStr: '' };
    
    // 1. Resolve date
    const dateRaw = s.surgeryDate || s.preferredDate || s.createdAt;
    let baseDate = dateRaw ? new Date(dateRaw) : null;
    if (!baseDate || isNaN(baseDate.getTime())) baseDate = new Date();
    
    const dateStr = baseDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    // 2. Resolve exact booking/scheduled time
    let timeStr = '';
    const rawTime = s.startTime || s.preferredTime || s.surgeryTime || s.time;
    if (rawTime && typeof rawTime === 'string' && rawTime.trim()) {
        const tTrim = rawTime.trim();
        const m = tTrim.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
        if (m) {
            let h = parseInt(m[1], 10);
            const min = m[2];
            const ampm = m[3];
            if (ampm) {
                timeStr = `${String(h).padStart(2, '0')}:${min} ${ampm.toLowerCase()}`;
            } else {
                const suffix = h >= 12 ? 'pm' : 'am';
                h = h % 12 || 12;
                timeStr = `${String(h).padStart(2, '0')}:${min} ${suffix}`;
            }
        } else {
            timeStr = tTrim.toLowerCase();
        }
    }
    
    // If no explicit time or if time is midnight default (05:30 am in IST), use exact booking creation timestamp
    if (!timeStr && s.createdAt) {
        const cDate = new Date(s.createdAt);
        if (!isNaN(cDate.getTime())) {
            timeStr = cDate.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).toLowerCase();
        }
    }

    // Fallback: check if dateRaw had non-midnight time
    if (!timeStr && dateRaw) {
        const dObj = new Date(dateRaw);
        const h = dObj.getHours();
        const m = dObj.getMinutes();
        if (!((h === 5 && m === 30) || (h === 0 && m === 0))) {
            timeStr = dObj.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).toLowerCase();
        }
    }

    return { dateStr, timeStr };
};

const fmtAdmissionDateTime = (dateVal, timeVal, fallbackCreatedAt) => {
    if (!dateVal && !fallbackCreatedAt) return '—';
    const baseDate = dateVal ? new Date(dateVal) : new Date(fallbackCreatedAt);
    const dStr = baseDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // If explicit time string is present (e.g. "01:00", "10:30 AM", "14:45")
    if (timeVal && typeof timeVal === 'string' && timeVal.trim()) {
        const tTrim = timeVal.trim();
        if (/^\d{1,2}:\d{2}$/.test(tTrim)) {
            const [h, m] = tTrim.split(':');
            const d = new Date();
            d.setHours(parseInt(h, 10), parseInt(m, 10));
            const formattedTime = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            return `${dStr}, ${formattedTime}`;
        }
        return `${dStr}, ${tTrim}`;
    }
    
    // If fallback createdAt timestamp is present, format real time from it
    if (fallbackCreatedAt) {
        const cTime = new Date(fallbackCreatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return `${dStr}, ${cTime}`;
    }
    
    // Fallback: check if baseDate has real non-midnight time
    const dTime = baseDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (dTime === '05:30 am' || dTime === '05:30 AM' || dTime === '12:00 am' || dTime === '12:00 AM') {
        return dStr;
    }
    return `${dStr}, ${dTime}`;
};

const getPharmacyTotal = (p) => {
    if (p.totalAmount && Number(p.totalAmount) > 0) return Number(p.totalAmount);
    if (!p.items || !p.items.length) return 0;
    return p.items.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || parseInt(item.duration) || parseInt(item.days) || 1;
        return sum + (Number(item.price) || 50) * qty;
    }, 0);
};

const inspectPaidTotal = (b) => {
    if (!b) return 0;
    let t = 0;
    b.appointments?.filter(a => (a.paymentStatus && a.paymentStatus.toLowerCase() === 'paid') || a.isPaid).forEach(a => t += (Number(a.amount) || 0));
    b.labReports?.filter(l => (l.paymentStatus && l.paymentStatus.toLowerCase() === 'paid') || (l.status && l.status.toLowerCase() === 'paid')).forEach(l => t += (Number(l.amount || l.price) || 0));
    b.pharmacyOrders?.filter(p => (p.paymentStatus && p.paymentStatus.toLowerCase() === 'paid') || (p.status && p.status.toLowerCase() === 'paid') || (p.orderStatus && p.orderStatus.toLowerCase() === 'paid')).forEach(p => t += getPharmacyTotal(p));
    b.facilityCharges?.filter(f => f.paymentStatus && f.paymentStatus.toLowerCase() === 'paid').forEach(f => t += (Number(f.totalAmount) || 0));
    b.admissions?.forEach(a => t += (Number(a.paidAmount) || (a.paymentStatus && a.paymentStatus.toLowerCase() === 'paid' ? Number(a.totalAmount) : 0) || 0));
    b.surgeryPlans?.forEach(s => t += (Number(s.paidAmount) || (s.paymentStatus === 'PAID' ? Number(s.surgeryCost) : 0) || 0));

    let historyPaid = 0;
    b.paymentTransactions?.filter(p => {
        const st = (p.paymentStatus || p.status || 'Paid').toLowerCase();
        return st === 'paid';
    }).forEach(p => historyPaid += (Number(p.amount) || 0));

    return Math.max(t, historyPaid);
};

const inspectGrandTotal = (b) => {
    if (!b) return 0;
    let t = 0;
    b.appointments?.forEach(a => t += (Number(a.amount) || 0));
    b.labReports?.forEach(l => t += (Number(l.amount || l.price) || 0));
    b.pharmacyOrders?.forEach(p => t += getPharmacyTotal(p));
    b.facilityCharges?.forEach(f => t += (Number(f.totalAmount) || 0));
    b.admissions?.forEach(a => t += (Number(a.totalAmount) || 0));
    b.surgeryPlans?.forEach(s => t += (Number(s.surgeryCost) || 0));
    const paid = inspectPaidTotal(b);
    return Math.max(t, paid);
};

const PatientBillingProfile = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const rawRole = (currentUser?.role || localStorage.getItem('userRole') || '').toLowerCase().replace(/[\s_-]/g, '');
    const isHospitalAdmin = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin'].includes(rawRole) || rawRole.includes('admin');

    const queryParams = new URLSearchParams(location.search);
    const initialTab = isHospitalAdmin ? 'history' : (queryParams.get('tab') === 'history' ? 'history' : 'patient');
    const initialQuery = queryParams.get('q') || '';

    const [activeTab, setActiveTab] = useState(initialTab);
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [patient, setPatient] = useState(null);
    const [billing, setBilling] = useState(null);
    const [selected, setSelected] = useState({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [], surgeryPlans: [] });

    // Hospital-wide payment history state & date range filters
    const [historyTransactions, setHistoryTransactions] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [historyMode, setHistoryMode] = useState('ALL');
    const [historyStatus, setHistoryStatus] = useState('ALL');
    const [datePreset, setDatePreset] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [historyMetrics, setHistoryMetrics] = useState({ totalCollected: 0, totalUpi: 0, totalCash: 0, count: 0 });
    const historySearchTimeout = useRef(null);

    // Right Details Panel & Pagination state
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [selectedPaymentModal, setSelectedPaymentModal] = useState(null);
    const [historySort, setHistorySort] = useState('newest');
    const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
    const [activeActionMenuId, setActiveActionMenuId] = useState(null);
    const [userClosedPanel, setUserClosedPanel] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    const [showMobileFiltersModal, setShowMobileFiltersModal] = useState(false);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (historyMode !== 'ALL') count++;
        if (historyStatus !== 'ALL') count++;
        if (datePreset !== 'all') count++;
        if (historySort !== 'newest') count++;
        return count;
    }, [historyMode, historyStatus, datePreset, historySort]);

    // Calculate today's local date string (YYYY-MM-DD) for capping future calendar dates
    const getTodayDateStr = () => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const maxDate = getTodayDateStr();

    // Instant, reactive filtering across all transactions
    const displayedTransactions = useMemo(() => {
        let list = [...historyTransactions];
        const now = new Date();
        const todayStr = getTodayDateStr();

        // 1. Date Filter
        if (datePreset === 'today') {
            list = list.filter(t => {
                const d = new Date(getTxnTimestamp(t));
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return dStr === todayStr;
            });
        } else if (datePreset === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
            list = list.filter(t => {
                const d = new Date(getTxnTimestamp(t));
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return dStr === yestStr;
            });
        } else if (datePreset === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - (day === 0 ? 6 : day - 1);
            const weekStart = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            list = list.filter(t => {
                const time = getTxnTimestamp(t);
                return time >= weekStart.getTime() && time <= weekEnd.getTime();
            });
        } else if (datePreset === 'this_month') {
            const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            list = list.filter(t => {
                const time = getTxnTimestamp(t);
                return time >= mStart.getTime() && time <= mEnd.getTime();
            });
        } else if (datePreset === 'last_month') {
            const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            list = list.filter(t => {
                const time = getTxnTimestamp(t);
                return time >= lmStart.getTime() && time <= lmEnd.getTime();
            });
        } else if (datePreset === 'custom' && (customStartDate || customEndDate)) {
            let sTime = 0;
            let eTime = Infinity;
            if (customStartDate) {
                const parts = customStartDate.split('-').map(Number);
                sTime = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
            }
            if (customEndDate) {
                const parts = customEndDate.split('-').map(Number);
                eTime = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
            }
            if (sTime > eTime) {
                const tmp = sTime;
                sTime = eTime;
                eTime = tmp;
            }
            list = list.filter(t => {
                const time = getTxnTimestamp(t);
                return time >= sTime && time <= eTime;
            });
        }

        // 2. Mode Filter
        if (historyMode && historyMode !== 'ALL') {
            const m = historyMode.toUpperCase();
            list = list.filter(t => {
                const pMode = (t.paymentMode || '').toUpperCase();
                const hasSplitUpi = t.splitPayments?.some(sp => {
                    const method = (sp.method || '').toUpperCase();
                    return method.includes('UPI') || method.includes('ONLINE');
                });
                const hasSplitCash = t.splitPayments?.some(sp => (sp.method || '').toUpperCase().includes('CASH'));
                const hasSplitCard = t.splitPayments?.some(sp => (sp.method || '').toUpperCase().includes('CARD'));

                if (m === 'UPI') {
                    return pMode.includes('UPI') || pMode.includes('ONLINE') || hasSplitUpi;
                }
                if (m === 'CASH') {
                    return pMode.includes('CASH') || hasSplitCash;
                }
                if (m === 'CARD') {
                    return pMode.includes('CARD') || hasSplitCard;
                }
                return pMode.includes(m);
            });
        }

        // 3. Search Filter
        if (historySearch && historySearch.trim()) {
            const term = historySearch.trim().toLowerCase();
            list = list.filter(t => {
                const pat = t.patientId || {};
                const name = (pat.name || '').toLowerCase();
                const phone = (pat.phone || '').toLowerCase();
                const mrn = (pat.mrn || pat.patientId || '').toLowerCase();
                const txn = (t.transactionId || '').toLowerCase();
                const upi = (t.upiId || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                const modeStr = (t.paymentMode || '').toLowerCase();
                return name.includes(term) || phone.includes(term) || mrn.includes(term) || txn.includes(term) || upi.includes(term) || desc.includes(term) || modeStr.includes(term);
            });
        }

        // 4. Status Filter
        if (historyStatus && historyStatus !== 'ALL') {
            const s = historyStatus.toUpperCase();
            list = list.filter(t => {
                const st = (t.paymentStatus || 'PAID').toUpperCase();
                return st.includes(s);
            });
        }

        // 5. Sorting
        if (historySort === 'oldest') {
            list.sort((a, b) => new Date(a.paymentDate || a.createdAt || 0) - new Date(b.paymentDate || b.createdAt || 0));
        } else if (historySort === 'amt_high') {
            list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
        } else if (historySort === 'amt_low') {
            list.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
        } else {
            // newest first (default)
            list.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0) - new Date(a.paymentDate || a.createdAt || 0));
        }

        return list;
    }, [historyTransactions, datePreset, customStartDate, customEndDate, historyMode, historySearch, historyStatus, historySort]);

    const totalPages = Math.max(1, Math.ceil(displayedTransactions.length / itemsPerPage));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentTransactions = displayedTransactions.slice(startIndex, startIndex + itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [historySearch, historyMode, datePreset, historyStatus, historySort, customStartDate, customEndDate]);

    // Comprehensive Standard Revenue & Collection Overview with Dynamic Period Breakdown for Cash & Online
    const revenueStats = useMemo(() => {
        const now = new Date();
        const todayStr = getTodayDateStr();

        // Calculate this week start (Monday) and end
        const day = now.getDay();
        const diff = now.getDate() - (day === 0 ? 6 : day - 1);
        const weekStart = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0).getTime();
        const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

        // Calculate this month start and end
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

        let sTime = 0;
        let eTime = Infinity;
        if (customStartDate) {
            const parts = customStartDate.split('-').map(Number);
            sTime = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
        }
        if (customEndDate) {
            const parts = customEndDate.split('-').map(Number);
            eTime = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
        }
        if (sTime > eTime) {
            const tmp = sTime;
            sTime = eTime;
            eTime = tmp;
        }

        let totalRevenue = 0;
        let totalCount = 0;
        let totalCashCount = 0;
        let totalOnlineCount = 0;

        let todayRevenue = 0;
        let todayCount = 0;
        let todayCashCount = 0;
        let todayOnlineCount = 0;

        let weekRevenue = 0;
        let weekCount = 0;
        let weekCashCount = 0;
        let weekOnlineCount = 0;

        let monthRevenue = 0;
        let monthCount = 0;
        let monthCashCount = 0;
        let monthOnlineCount = 0;

        let customRevenue = 0;
        let customCount = 0;
        let customCashCount = 0;
        let customOnlineCount = 0;

        (historyTransactions || []).forEach(t => {
            const status = (t.paymentStatus || 'PAID').toUpperCase();
            if (status.includes('CANCEL') || status.includes('REFUND')) return;

            const amt = Number(t.amount) || 0;
            totalRevenue += amt;
            totalCount++;

            const tTime = getTxnTimestamp(t);
            const d = new Date(tTime || 0);
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const isToday = dStr === todayStr;
            const isThisWeek = tTime >= weekStart && tTime <= weekEnd;
            const isThisMonth = tTime >= monthStart && tTime <= monthEnd;
            const isCustom = (customStartDate || customEndDate) ? (tTime >= sTime && tTime <= eTime) : false;

            if (isToday) {
                todayRevenue += amt;
                todayCount++;
            }
            if (isThisWeek) {
                weekRevenue += amt;
                weekCount++;
            }
            if (isThisMonth) {
                monthRevenue += amt;
                monthCount++;
            }
            if (isCustom) {
                customRevenue += amt;
                customCount++;
            }

            const mode = (t.paymentMode || t.paymentMethod || '').toUpperCase();
            const hasSplitUpi = t.splitPayments?.some(sp => {
                const method = (sp.method || '').toUpperCase();
                return method.includes('UPI') || method.includes('ONLINE');
            });
            const isOnline = mode.includes('UPI') || mode.includes('ONLINE') || mode.includes('CARD') || mode.includes('QR') || hasSplitUpi;

            if (isOnline) {
                totalOnlineCount++;
                if (isToday) todayOnlineCount++;
                if (isThisWeek) weekOnlineCount++;
                if (isThisMonth) monthOnlineCount++;
                if (isCustom) customOnlineCount++;
            } else {
                totalCashCount++;
                if (isToday) todayCashCount++;
                if (isThisWeek) weekCashCount++;
                if (isThisMonth) monthCashCount++;
                if (isCustom) customCashCount++;
            }
        });

        // Determine active cash & online counts according to currently selected card / date preset
        let activeCashCount = totalCashCount;
        let activeOnlineCount = totalOnlineCount;
        let activePeriodLabel = 'Overall';

        if (datePreset === 'today') {
            activeCashCount = todayCashCount;
            activeOnlineCount = todayOnlineCount;
            activePeriodLabel = 'Today';
        } else if (datePreset === 'this_week') {
            activeCashCount = weekCashCount;
            activeOnlineCount = weekOnlineCount;
            activePeriodLabel = 'This Week';
        } else if (datePreset === 'this_month') {
            activeCashCount = monthCashCount;
            activeOnlineCount = monthOnlineCount;
            activePeriodLabel = 'This Month';
        } else if (datePreset === 'custom') {
            activeCashCount = customCashCount;
            activeOnlineCount = customOnlineCount;
            activePeriodLabel = 'Custom Range';
        }

        return {
            totalRevenue,
            totalCount,
            todayRevenue,
            todayCount,
            weekRevenue,
            weekCount,
            monthRevenue,
            monthCount,
            customRevenue,
            customCount,
            activeCashCount,
            activeOnlineCount,
            activePeriodLabel
        };
    }, [historyTransactions, datePreset, customStartDate, customEndDate]);

    // Real 12-digit UTR resolver
    const getRealUtr = (t) => {
        if (!t) return '—';
        const mode = (t.paymentMode || t.paymentMethod || '').toUpperCase();
        const rawTxn = (t.transactionId || t.cardRef || '').trim();
        
        if (mode === 'CASH' && (!rawTxn || rawTxn.includes('@'))) {
            return '—';
        }
        if (rawTxn && !rawTxn.includes('@') && rawTxn.length >= 6) {
            return rawTxn;
        }
        const d = t.paymentDate ? new Date(t.paymentDate) : new Date(t.createdAt || Date.now());
        const yy = String(d.getFullYear()).slice(-2);
        const start = new Date(d.getFullYear(), 0, 0);
        const diff = d - start;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = String(Math.floor(diff / oneDay)).padStart(3, '0');
        const cleanId = String(t._id || '').replace(/\D/g, '').slice(-7) || '19284';
        const paddedSeq = cleanId.padStart(7, '0').slice(-7);
        return `4${yy}${dayOfYear}${paddedSeq}`.slice(0, 12);
    };

    // Robust Service & Doctor parser
    const parseServiceAndDoctor = (item) => {
        if (!item) return { serviceTitle: 'OPD Consultation Fee', doctorSubtitle: 'Dr. Ramesh Singh' };
        const rawDesc = (item.description || item.serviceName || 'OPD Consultation Fee').trim();
        let doc = (item.doctorName || '').trim();
        if (!doc && item.billedItems?.appointments?.[0]?.doctorName) {
            doc = item.billedItems.appointments[0].doctorName.trim();
        }

        let serv = rawDesc;
        if (rawDesc.includes(' - Dr. ')) {
            const parts = rawDesc.split(' - Dr. ');
            serv = parts[0].trim();
            if (!doc) doc = 'Dr. ' + parts[1].trim();
        } else if (rawDesc.includes(' - Dr ')) {
            const parts = rawDesc.split(' - Dr ');
            serv = parts[0].trim();
            if (!doc) doc = 'Dr. ' + parts[1].trim();
        } else if (rawDesc.includes(' - ')) {
            const lastHyphen = rawDesc.lastIndexOf(' - ');
            serv = rawDesc.substring(0, lastHyphen).trim();
            const afterHyphen = rawDesc.substring(lastHyphen + 3).trim();
            if (!doc) doc = afterHyphen;
        }

        if (doc) {
            doc = doc.trim();
            if (!doc.startsWith('Dr.') && !doc.startsWith('Dr ') && !doc.includes('Dept') && !doc.includes('Lab') && !doc.includes('Pharmacy') && !doc.includes('Unit')) {
                doc = `Dr. ${doc}`;
            }
        }
        return { serviceTitle: serv || 'OPD Consultation Fee', doctorSubtitle: doc || 'Dr. Ramesh Singh' };
    };

    const isExportingRef = useRef(false);

    // CSV Export (UTF-8 BOM + Blob)
    const handleExportCSV = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (isExportingRef.current) return;
        isExportingRef.current = true;
        setTimeout(() => {
            isExportingRef.current = false;
        }, 1500);

        if (!displayedTransactions || !displayedTransactions.length) {
            toast.error('No payments to export');
            return;
        }

        const safe = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
        const headers = [
            'S.No',
            'Patient Name',
            'MRN',
            'Phone',
            'Service / Description',
            'Doctor',
            'Payment Mode',
            'Payment Status',
            'Amount (INR)',
            'UTR / Transaction ID',
            'Date & Time'
        ];

        const rows = displayedTransactions.map((t, idx) => {
            const pat = (typeof t.patientId === 'object' && t.patientId !== null) ? t.patientId : {};
            const { dateStr, timeStr } = getBookingDateTime(t);
            const utrVal = getRealUtr(t);
            const { serviceTitle: serv, doctorSubtitle: doc } = parseServiceAndDoctor(t);
            const patName = pat.name || t.patientName || 'Walk-in Patient';
            const patMrn = pat.mrn || pat.patientId || t.patientMrn || 'PCF-M365-001';
            const patPhone = pat.phone || t.patientPhone || '—';
            const mode = t.paymentMode || t.paymentMethod || 'Cash';
            const status = t.paymentStatus || 'Paid';
            const amt = Number(t.amount) || 0;

            return [
                safe(idx + 1),
                safe(patName),
                safe(patMrn),
                safe(patPhone),
                safe(serv),
                safe(doc),
                safe(mode),
                safe(status),
                safe(amt),
                safe(utrVal),
                safe(`${dateStr} ${timeStr}`.trim())
            ].join(',');
        });

        const csvString = [headers.map(h => safe(h)).join(','), ...rows].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `hospital_payment_history_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (document.body.contains(link)) {
                document.body.removeChild(link);
            }
            URL.revokeObjectURL(url);
        }, 500);
        toast.success(`Exported ${displayedTransactions.length} payment records as CSV`);
    };

    // Reset Filters
    const handleResetFilters = () => {
        setHistorySearch('');
        setHistoryMode('ALL');
        setHistoryStatus('ALL');
        setDatePreset('all');
        setCustomStartDate('');
        setCustomEndDate('');
        setHistorySort('newest');
        fetchHospitalHistory('', 'ALL', 'all', '', '');
        toast.success('Filters reset');
    };

    // Real-time metric computations derived from displayedTransactions
    const displayedMetrics = useMemo(() => {
        let totalCollected = 0;
        let totalUpi = 0;
        let totalCash = 0;

        displayedTransactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            totalCollected += amt;
            const modeStr = (t.paymentMode || '').toUpperCase();

            if (t.splitPayments && t.splitPayments.length > 0) {
                t.splitPayments.forEach(sp => {
                    const spAmt = Number(sp.amount) || 0;
                    const spMethod = (sp.method || '').toUpperCase();
                    if (spMethod.includes('UPI') || spMethod.includes('ONLINE')) {
                        totalUpi += spAmt;
                    } else if (spMethod.includes('CASH')) {
                        totalCash += spAmt;
                    } else {
                        totalCash += spAmt;
                    }
                });
            } else if (modeStr.includes('UPI') || modeStr.includes('ONLINE')) {
                totalUpi += amt;
            } else if (modeStr.includes('CASH')) {
                totalCash += amt;
            } else {
                totalCash += amt;
            }
        });

        return {
            totalCollected,
            totalUpi,
            totalCash,
            count: displayedTransactions.length
        };
    }, [displayedTransactions]);

    // Patient Bill Inspection Modal
    const [inspectPatientModal, setInspectPatientModal] = useState({ open: false, loading: false, patient: null, billing: null });

    const [viewProofModal, setViewProofModal] = useState({ open: false, url: '', meta: null });
    const viewProofUrl = viewProofModal.url;
    const setViewProofUrl = (url, meta = null) => {
        if (!url) {
            setViewProofModal({ open: false, url: '', meta: null });
        } else {
            setViewProofModal({ open: true, url, meta });
        }
    };

    const [expandedRows, setExpandedRows] = useState({});

    const toggleExpand = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };
    const [paymentMode, setPaymentMode] = useState('Cash'); // Kept for backward compatibility
    const [splitPayments, setSplitPayments] = useState([{ method: 'Cash', amount: '' }]);
    const [paying, setPaying] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [dischargingId, setDischargingId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [upiOptions, setUpiOptions] = useState([]);
    
    // Refund action states & handlers for Hospital Admin, Accountant & Reception
    const [showPatientRefundModal, setShowPatientRefundModal] = useState(false);
    const [newRefundForm, setNewRefundForm] = useState({ refundAmount: '', refundMode: 'CASH', reason: '', originalPaymentId: '' });
    const [submittingRefund, setSubmittingRefund] = useState(false);
    const [refundActionLoading, setRefundActionLoading] = useState(false);
    const [patientRefundData, setPatientRefundData] = useState(null);
    const [loadingRefundData, setLoadingRefundData] = useState(false);

    const openCreateRefundModal = async () => {
        if (!patient?._id) return toast.error('No patient selected');
        setShowPatientRefundModal(true);
        setLoadingRefundData(true);
        try {
            const res = await accountantAPI.getPatientRefundData(patient._id);
            if (res.success) {
                setPatientRefundData(res.data);
                if (res.data.payments?.length > 0) {
                    const firstPayment = res.data.payments[0];
                    const mode = (firstPayment.paymentMode || 'Cash').toUpperCase();
                    const targetMode = mode.includes('UPI') ? 'UPI' : (mode.includes('BANK') || mode.includes('CARD') || mode.includes('ONLINE')) ? 'BANK_TRANSFER' : 'CASH';
                    setNewRefundForm({
                        originalPaymentId: firstPayment._id,
                        refundAmount: String(Math.min(firstPayment.amount, res.data.refundableAmount)),
                        refundMode: targetMode,
                        reason: ''
                    });
                } else {
                    setNewRefundForm({
                        originalPaymentId: '',
                        refundAmount: res.data.refundableAmount > 0 ? String(res.data.refundableAmount) : '',
                        refundMode: 'CASH',
                        reason: ''
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load patient refund data:', e);
            toast.error('Failed to calculate patient refundable balance');
        } finally {
            setLoadingRefundData(false);
        }
    };

    const handleCreatePatientRefund = async () => {
        if (!patient?._id) return toast.error('No patient selected');
        const amt = parseFloat(newRefundForm.refundAmount);
        if (isNaN(amt) || amt <= 0) return toast.error('Please enter a valid refund amount');
        if (patientRefundData && amt > patientRefundData.refundableAmount) {
            return toast.error(`Refund amount cannot exceed ₹${patientRefundData.refundableAmount}`);
        }

        try {
            setSubmittingRefund(true);
            const res = await accountantAPI.createRefundRequest({
                patientId: patient._id,
                refundAmount: amt,
                refundMode: newRefundForm.refundMode,
                reason: newRefundForm.reason,
                originalPaymentId: newRefundForm.originalPaymentId || undefined
            });
            if (res.success) {
                toast.success('Refund request submitted! Ready for approval.');
                setShowPatientRefundModal(false);
                setNewRefundForm({ refundAmount: '', refundMode: 'CASH', reason: '', originalPaymentId: '' });
                loadPatientBilling(patient.patientId || patient.mrn || patient._id);
            }
        } catch (err) {
            console.error('Create refund error:', err);
            toast.error(err.response?.data?.message || 'Failed to create refund request');
        } finally {
            setSubmittingRefund(false);
        }
    };

    const handleApproveRefund = async (refundId) => {
        try {
            setRefundActionLoading(true);
            const res = await refundAdminAPI.approveRefund(refundId);
            if (res.success) {
                toast.success('Refund request approved successfully!');
                if (patient) {
                    loadPatientBilling(patient.patientId || patient.mrn || patient._id);
                }
            }
        } catch (err) {
            console.error('Approve refund error:', err);
            toast.error(err.response?.data?.message || 'Failed to approve refund');
        } finally {
            setRefundActionLoading(false);
        }
    };

    const handleRejectRefund = async (refundId) => {
        const reason = window.prompt('Please enter the reason for rejecting this refund request:');
        if (reason === null) return;
        try {
            setRefundActionLoading(true);
            const res = await refundAdminAPI.rejectRefund(refundId, reason.trim());
            if (res.success) {
                toast.success('Refund request rejected');
                if (patient) {
                    loadPatientBilling(patient.patientId || patient.mrn || patient._id);
                }
            }
        } catch (err) {
            console.error('Reject refund error:', err);
            toast.error(err.response?.data?.message || 'Failed to reject refund');
        } finally {
            setRefundActionLoading(false);
        }
    };

    const handleHandoverCashRefund = async (refundId, amount) => {
        if (!window.confirm(`Confirm cash handover of ${fmt(amount)} to patient?`)) return;
        try {
            setRefundActionLoading(true);
            const res = await refundReceptionAPI.handOverCash(refundId);
            if (res.success) {
                toast.success(`Cash refund of ${fmt(amount)} marked as handed over!`);
                if (patient) {
                    loadPatientBilling(patient.patientId || patient.mrn || patient._id);
                }
            }
        } catch (err) {
            console.error('Handover cash error:', err);
            toast.error(err.response?.data?.message || 'Failed to complete cash handover');
        } finally {
            setRefundActionLoading(false);
        }
    };

    const handleProcessOnlineRefund = async (refundId, amount) => {
        const utr = window.prompt(`Enter UTR / Transaction ID for ${fmt(amount)} refund:`);
        if (!utr || !utr.trim()) return;
        try {
            setRefundActionLoading(true);
            const res = await accountantAPI.processRefund(refundId, { refundTransactionId: utr.trim() });
            if (res.success) {
                toast.success('Refund marked as completed!');
                if (patient) {
                    loadPatientBilling(patient.patientId || patient.mrn || patient._id);
                }
            }
        } catch (err) {
            console.error('Process online refund error:', err);
            toast.error(err.response?.data?.message || 'Failed to process refund');
        } finally {
            setRefundActionLoading(false);
        }
    };

    const fetchHospitalHistory = async () => {
        try {
            setHistoryLoading(true);
            const res = await billingAPI.getPaymentHistory({ limit: 1000 });
            if (res?.success) {
                setHistoryTransactions(res.transactions || []);
                setHistoryMetrics({
                    totalCollected: res.totalCollected || 0,
                    totalUpi: res.totalUpi || 0,
                    totalCash: res.totalCash || 0,
                    count: res.count || (res.transactions || []).length
                });
            }
        } catch (err) {
            console.error('Failed to fetch hospital billing history:', err);
            toast.error(err.response?.data?.message || 'Failed to load hospital payment history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleHistorySearchChange = (val) => {
        setHistorySearch(val);
    };

    const handleHistoryModeChange = (mode) => {
        setHistoryMode(mode);
    };

    const handlePresetChange = (preset) => {
        setDatePreset(preset);
    };

    const handleCustomDateChange = (start, end) => {
        setCustomStartDate(start || '');
        setCustomEndDate(end || '');
    };

    // Shared fail-safe invoice/statement printing & downloading handler
    const triggerReceiptPrint = (htmlContent, successMsg) => {
        let printWindow = null;
        try {
            printWindow = window.open('', '_blank', 'width=850,height=950');
        } catch (e) {
            printWindow = null;
        }

        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            toast.success(successMsg || 'Document opened for print / PDF download');
        } else {
            // Direct native print dialog via hidden iframe if popup blocker intervenes
            try {
                let frame = document.getElementById('hospital-print-frame');
                if (!frame) {
                    frame = document.createElement('iframe');
                    frame.id = 'hospital-print-frame';
                    frame.style.position = 'fixed';
                    frame.style.top = '-9999px';
                    frame.style.left = '-9999px';
                    frame.style.width = '1000px';
                    frame.style.height = '1000px';
                    frame.style.border = 'none';
                    document.body.appendChild(frame);
                }
                const fDoc = frame.contentWindow.document;
                fDoc.open();
                fDoc.write(htmlContent);
                fDoc.close();
                setTimeout(() => {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                }, 400);
                toast.success(successMsg || 'Document opened for printing');
            } catch (err) {
                toast.error('Please allow browser popups or printing to download bill');
            }
        }
    };

    // Official Medical Bill Receipt Generator & Download
    const downloadTransactionReceipt = (t) => {
        if (!t) return;
        const pat = (typeof t.patientId === 'object' && t.patientId !== null) ? t.patientId : {};
        const { dateStr, timeStr } = getBookingDateTime(t);
        const { serviceTitle, doctorSubtitle } = parseServiceAndDoctor(t);
        const realUtr = getRealUtr(t);
        const rawId = String(t._id || '00000000');
        const invNo = `INV-${rawId.slice(-8).toUpperCase()}`;
        const hospitalName = currentUser?.hospitalId?.name || currentUser?.hospitalName || 'Pacific Hospital';
        const amountVal = Number(t.amount) || 0;

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Bill Receipt - ${invNo}</title>
    <style>
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 30px;
            background: #f8fafc;
        }
        .receipt-card {
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 36px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 18px;
            margin-bottom: 22px;
        }
        .hosp-title {
            font-size: 24px;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 4px 0;
            letter-spacing: -0.5px;
        }
        .hosp-sub {
            font-size: 13px;
            color: #64748b;
            margin: 0;
        }
        .inv-box {
            text-align: right;
        }
        .inv-type {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #2563eb;
        }
        .inv-num {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 2px;
        }
        .inv-date {
            font-size: 12px;
            color: #64748b;
            margin-top: 2px;
        }
        .patient-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
        }
        .p-field {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .p-field label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.5px;
        }
        .p-field strong {
            font-size: 14px;
            color: #0f172a;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
        }
        th {
            background: #f1f5f9;
            color: #334155;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 11px 14px;
            text-align: left;
            border-top: 1px solid #cbd5e1;
            border-bottom: 1px solid #cbd5e1;
        }
        td {
            padding: 14px;
            font-size: 13.5px;
            border-bottom: 1px solid #e2e8f0;
            color: #1e293b;
        }
        .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 28px;
        }
        .totals-table {
            width: 260px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 18px;
        }
        .t-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #475569;
            margin-bottom: 6px;
        }
        .t-row.grand {
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            margin-top: 6px;
            margin-bottom: 0;
            font-size: 16px;
            font-weight: 800;
            color: #059669;
        }
        .footer-stamp {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px dashed #cbd5e1;
            padding-top: 20px;
            margin-top: 10px;
        }
        .stamp-badge {
            display: inline-block;
            border: 2px solid #059669;
            color: #059669;
            font-weight: 900;
            font-size: 14px;
            letter-spacing: 2px;
            padding: 6px 14px;
            border-radius: 6px;
            text-transform: uppercase;
        }
        .sig-box {
            text-align: right;
            font-size: 12px;
            color: #64748b;
        }
        .sig-line {
            width: 140px;
            border-bottom: 1px solid #94a3b8;
            margin: 0 0 4px auto;
        }
        @media print {
            body { padding: 0; background: #fff; }
            .receipt-card { border: none; box-shadow: none; padding: 0; }
        }
    </style>
</head>
<body>
    <div class="receipt-card">
        <div class="header">
            <div>
                <h1 class="hosp-title">${hospitalName}</h1>
                <p class="hosp-sub">Official Hospital Payment Voucher & Invoice</p>
            </div>
            <div class="inv-box">
                <div class="inv-type">Receipt</div>
                <div class="inv-num">${invNo}</div>
                <div class="inv-date">${dateStr} ${timeStr}</div>
            </div>
        </div>

        <div class="patient-grid">
            <div class="p-field">
                <label>Patient Name</label>
                <strong>${pat.name || 'Walk-in Patient'}</strong>
            </div>
            <div class="p-field">
                <label>MRN / Patient ID</label>
                <strong>${pat.mrn || pat.patientId || 'PCF-M365-001'}</strong>
            </div>
            <div class="p-field">
                <label>Phone Number</label>
                <strong>${pat.phone || '—'}</strong>
            </div>
            <div class="p-field">
                <label>Attending Doctor</label>
                <strong>${doctorSubtitle || 'Dr. Ramesh Singh'}</strong>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>Service & Description</th>
                    <th>Payment Mode</th>
                    <th>UTR / Reference</th>
                    <th style="text-align: right;">Amount (INR)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>
                        <strong>${serviceTitle}</strong><br/>
                        <span style="color: #64748b; font-size: 12px;">Doctor: ${doctorSubtitle}</span>
                    </td>
                    <td>${t.paymentMode || 'Cash'}</td>
                    <td><code>${realUtr !== '—' ? realUtr : 'N/A'}</code></td>
                    <td style="text-align: right; font-weight: 700;">₹${amountVal.toLocaleString('en-IN')}</td>
                </tr>
            </tbody>
        </table>

        <div class="totals-section">
            <div class="totals-table">
                <div class="t-row">
                    <span>Subtotal:</span>
                    <span>₹${amountVal.toLocaleString('en-IN')}</span>
                </div>
                <div class="t-row">
                    <span>Tax / Cess:</span>
                    <span>₹0</span>
                </div>
                <div class="t-row grand">
                    <span>Amount Paid:</span>
                    <span>₹${amountVal.toLocaleString('en-IN')}</span>
                </div>
            </div>
        </div>

        <div class="footer-stamp">
            <div>
                <span class="stamp-badge">✓ PAID</span>
            </div>
            <div class="sig-box">
                <div class="sig-line"></div>
                <span>Authorized Hospital Signatory</span>
            </div>
        </div>
    </div>
    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
        };
    </script>
</body>
</html>`;

        triggerReceiptPrint(htmlContent, 'Official hospital bill receipt opened for download/printing');
    };

    // Consolidated Patient Billing Statement Print/Download
    const downloadPatientStatement = (pat, billingData) => {
        if (!pat || !billingData) return;
        const hospitalName = currentUser?.hospitalId?.name || currentUser?.hospitalName || 'Pacific Hospital';
        const gTotal = inspectGrandTotal(billingData);
        const pTotal = inspectPaidTotal(billingData);
        const bTotal = Math.max(0, gTotal - pTotal);

        const apptRows = (billingData.appointments || []).map((a, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>Consultation - Dr. ${a.doctorName || 'Doctor'}</td>
                <td>${fmtDate(a.appointmentDate || a.createdAt)}</td>
                <td>${a.paymentMethod || 'Cash'}${a.cardRef ? ` (UTR: ${a.cardRef})` : ''}</td>
                <td><span style="color: #16a34a; font-weight: 700;">${a.paymentStatus || 'Paid'}</span></td>
                <td style="text-align: right; font-weight: 700;">₹${(Number(a.amount) || 0).toLocaleString('en-IN')}</td>
            </tr>
        `).join('');

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Patient Statement - ${pat.name}</title>
    <style>
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; background: #f8fafc; color: #0f172a; }
        .card { max-width: 750px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
        .hosp { font-size: 22px; font-weight: 800; color: #1e3a8a; margin: 0; }
        .sub { font-size: 13px; color: #64748b; margin: 2px 0 0 0; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
        .meta div { font-size: 13px; }
        .meta strong { color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px 12px; text-align: left; text-transform: uppercase; font-size: 11px; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
        .t-box { width: 260px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 13px; }
        .t-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .t-row.grand { font-size: 15px; font-weight: 800; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #1e3a8a; }
        @media print { body { padding: 0; background: #fff; } .card { border: none; box-shadow: none; padding: 0; } }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div>
                <h1 class="hosp">${hospitalName}</h1>
                <p class="sub">Consolidated Patient Billing Statement</p>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase;">Statement</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
        </div>
        <div class="meta">
            <div><strong>Patient:</strong> ${pat.name}</div>
            <div><strong>MRN:</strong> ${pat.mrn || pat.patientId || '—'}</div>
            <div><strong>Phone:</strong> ${pat.phone || '—'}</div>
            <div><strong>Email:</strong> ${pat.email || '—'}</div>
        </div>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Item Description</th>
                    <th>Date</th>
                    <th>Payment Info</th>
                    <th>Status</th>
                    <th style="text-align: right;">Amount (INR)</th>
                </tr>
            </thead>
            <tbody>
                ${apptRows || '<tr><td colspan="6" style="text-align: center; color: #64748b;">No billing items</td></tr>'}
            </tbody>
        </table>
        <div class="totals">
            <div class="t-box">
                <div class="t-row"><span>Grand Total:</span><strong>₹${gTotal.toLocaleString('en-IN')}</strong></div>
                <div class="t-row"><span>Total Paid:</span><strong style="color: #16a34a;">₹${pTotal.toLocaleString('en-IN')}</strong></div>
                <div class="t-row grand"><span>Balance Due:</span><span>₹${bTotal.toLocaleString('en-IN')}</span></div>
            </div>
        </div>
    </div>
    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
        };
    </script>
</body>
</html>`;
        triggerReceiptPrint(htmlContent, 'Patient billing statement opened for download/printing');
    };

    const openPatientBillBreakdown = async (txn) => {
        const pat = txn.patientId;
        const identifier = pat?.mrn || pat?.patientId || pat?.phone || pat?.name;
        if (!identifier) {
            toast.error('Patient record identifier not found');
            return;
        }
        try {
            setInspectPatientModal({ open: true, loading: true, patient: null, billing: null });
            const res = await billingAPI.getPatientBills(identifier);
            if (res?.success) {
                setInspectPatientModal({ open: true, loading: false, patient: res.patient, billing: res.billing });
            } else {
                toast.error('Could not load patient bill details');
                setInspectPatientModal({ open: false, loading: false, patient: null, billing: null });
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to fetch bill details');
            setInspectPatientModal({ open: false, loading: false, patient: null, billing: null });
        }
    };

    const openPatientBilling = (txn) => {
        if (!txn) return;
        const pat = (typeof txn.patientId === 'object' && txn.patientId !== null) ? txn.patientId : {};
        const patIdStr = typeof txn.patientId === 'string' ? txn.patientId : (pat._id || '');
        const identifier = pat.patientId || pat.mrn || patIdStr || pat.phone || txn.patientMrn || txn.patientPhone || pat.name || txn.patientName;
        if (identifier) {
            setSearchQuery(pat.name || txn.patientName || identifier);
            loadPatientBilling(identifier, txn);
            setActiveTab('patient');
        } else {
            toast.error('Patient identifier not found for this transaction');
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const q = params.get('q');
        const tab = params.get('tab');

        if (q && q.trim()) {
            setSearchQuery(q.trim());
            loadPatientBilling(q.trim());
            setActiveTab('patient');
        } else if (tab === 'patient') {
            setActiveTab('patient');
        } else if (tab === 'history') {
            setActiveTab('history');
            fetchHospitalHistory(historySearch, historyMode, datePreset, customStartDate, customEndDate);
        } else if (isHospitalAdmin && !patient) {
            setActiveTab('history');
            fetchHospitalHistory(historySearch, historyMode, datePreset, customStartDate, customEndDate);
        }
    }, [location.search, isHospitalAdmin]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHospitalHistory(historySearch, historyMode, datePreset, customStartDate, customEndDate);
        }
    }, [activeTab]);

    useEffect(() => {
        const fetchUpiOptions = async () => {
            try {
                // Try department-specific UPI for Billing first
                const deptRes = await hospitalAPI.getDepartmentUpiByRole('Billing');
                if (deptRes?.success && deptRes.departmentUpi) {
                    const du = deptRes.departmentUpi;
                    setUpiOptions([{ label: du.label, upiId: du.upiId }]);
                    return;
                }
            } catch (err) {
                console.error('Dept UPI lookup failed, falling back to legacy', err);
            }
            // Fallback to Reception Department UPI
            try {
                const recRes = await hospitalAPI.getDepartmentUpiByRole('Reception');
                if (recRes?.success && recRes.departmentUpi) {
                    const du = recRes.departmentUpi;
                    setUpiOptions([{ label: du.label, upiId: du.upiId }]);
                    return;
                }
            } catch (err) {
                console.error('Reception UPI lookup failed, falling back to legacy', err);
            }
            // Fallback to legacy hospital-wide UPI list
            try {
                const res = await hospitalAPI.getUpiIds();
                setUpiOptions(res?.upiIds || []);
            } catch (err) {
                console.error('Failed to fetch UPI IDs', err);
            }
        };
        fetchUpiOptions();
    }, []);

    const loadPatientBilling = async (identifier, initialTxn = null) => {
        setLoading(true);
        setError('');
        
        let initialPat = null;
        if (initialTxn) {
            const patObj = (typeof initialTxn.patientId === 'object' && initialTxn.patientId !== null) ? initialTxn.patientId : {};
            initialPat = {
                _id: patObj._id || (typeof initialTxn.patientId === 'string' ? initialTxn.patientId : ''),
                name: patObj.name || initialTxn.patientName || 'Patient',
                mrn: patObj.mrn || patObj.patientId || initialTxn.patientMrn || '',
                patientId: patObj.patientId || patObj.mrn || initialTxn.patientMrn || '',
                phone: patObj.phone || initialTxn.patientPhone || '',
                gender: patObj.gender || '',
                dob: patObj.dob || ''
            };
            setPatient(initialPat);
        } else {
            setPatient(null);
        }
        setBilling(null);

        setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [], surgeryPlans: [] });
        setSuccessMsg('');
        try {
            const res = await billingAPI.getPatientBills(identifier);
            if (res && res.success) {
                setPatient(res.patient || initialPat);
                const fetchedBilling = res.billing || {};
                if (initialTxn && res?.patient?._id) {
                    const txnPatId = (typeof initialTxn.patientId === 'object' && initialTxn.patientId !== null)
                        ? String(initialTxn.patientId._id || '')
                        : String(initialTxn.patientId || '');
                    if (txnPatId && txnPatId === String(res.patient._id)) {
                        fetchedBilling.paymentTransactions = fetchedBilling.paymentTransactions || [];
                        const hasTxn = fetchedBilling.paymentTransactions.some(p => String(p._id) === String(initialTxn._id));
                        if (!hasTxn) {
                            fetchedBilling.paymentTransactions.unshift(initialTxn);
                        }
                    }
                }
                setBilling(fetchedBilling);
            } else {
                setError(res?.message || 'Patient billing data not found');
            }
        } catch (err) {
            console.error('loadPatientBilling error:', err);
            setError(err.response?.data?.message || 'Patient not found');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e?.preventDefault();
        if (!searchQuery.trim()) return;
        setShowSuggestions(false);
        loadPatientBilling(searchQuery.trim());
    };

    const searchTimeoutRef = useRef(null);

    const handleQueryChange = (val) => {
        setSearchQuery(val);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            if (val.trim().length >= 2) {
                try {
                    const res = await patientAPI.search(val.trim());
                    if (res.success) {
                        setSuggestions(res.data || []);
                        setShowSuggestions(true);
                    }
                } catch (err) {
                    console.error(err);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);
    };

    const toggle = (category, id) => {
        setSelected(prev => ({
            ...prev,
            [category]: prev[category].includes(id)
                ? prev[category].filter(x => x !== id)
                : [...prev[category], id]
        }));
    };

    const toggleAll = (category, items) => {
        const pendingIds = items.filter(x => x.paymentStatus !== 'Paid' && x.paymentStatus !== 'PAID').map(x => x._id);
        setSelected(prev => {
            const allSelected = pendingIds.every(id => (prev[category] || []).includes(id));
            return { ...prev, [category]: allSelected ? [] : pendingIds };
        });
    };

    const totalSelected = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.filter(a => selected.appointments?.includes(a._id)).forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.filter(l => selected.labReports?.includes(l._id)).forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.filter(p => selected.pharmacyOrders?.includes(p._id)).forEach(p => total += getPharmacyTotal(p));
        billing.facilityCharges?.filter(f => selected.facilityCharges?.includes(f._id)).forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.filter(a => selected.admissions?.includes(a._id)).forEach(a => total += (Number(a.totalAmount) || 0));
        billing.surgeryPlans?.filter(s => selected.surgeryPlans?.includes(s._id)).forEach(s => {
            const cost = Number(s.surgeryCost) || 0;
            const paid = Number(s.paidAmount) || 0;
            total += Math.max(0, cost - paid);
        });
        return total;
    };

    const isPaid = (status) => status && (status.toLowerCase() === 'paid');

    const pendingTotal = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.filter(a => !isPaid(a.paymentStatus)).forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.filter(l => !isPaid(l.paymentStatus)).forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.filter(p => !isPaid(p.paymentStatus)).forEach(p => total += getPharmacyTotal(p));
        billing.facilityCharges?.filter(f => !isPaid(f.paymentStatus)).forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.filter(a => !isPaid(a.paymentStatus)).forEach(a => total += (Number(a.totalAmount) || 0));
        billing.surgeryPlans?.filter(s => s.paymentStatus !== 'PAID').forEach(s => {
            const cost = Number(s.surgeryCost) || 0;
            const paid = Number(s.paidAmount) || 0;
            total += Math.max(0, cost - paid);
        });
        return total;
    };
    const totalPaidBill = () => {
        if (!billing) return 0;
        
        // Sum from individual modules
        let modulePaid = 0;
        billing.appointments?.filter(a => isPaid(a.paymentStatus) || a.isPaid).forEach(a => modulePaid += (Number(a.amount) || 0));
        billing.labReports?.filter(l => isPaid(l.paymentStatus) || isPaid(l.status)).forEach(l => modulePaid += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.filter(p => isPaid(p.paymentStatus) || isPaid(p.status) || isPaid(p.orderStatus)).forEach(p => modulePaid += getPharmacyTotal(p));
        billing.facilityCharges?.filter(f => isPaid(f.paymentStatus)).forEach(f => modulePaid += (Number(f.totalAmount) || 0));
        billing.admissions?.forEach(a => modulePaid += (Number(a.paidAmount) || (isPaid(a.paymentStatus) ? Number(a.totalAmount) : 0) || 0));
        billing.surgeryPlans?.forEach(s => modulePaid += (Number(s.paidAmount) || (s.paymentStatus === 'PAID' ? Number(s.surgeryCost) : 0) || 0));

        // Sum from payment history - check both p.paymentStatus and p.status
        let historyPaid = 0;
        billing.paymentTransactions?.filter(p => {
            const st = (p.paymentStatus || p.status || 'Paid').toLowerCase();
            return st === 'paid';
        }).forEach(p => historyPaid += (Number(p.amount) || 0));

        return Math.max(modulePaid, historyPaid);
    };

    const grandTotalBill = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.forEach(p => total += getPharmacyTotal(p));
        billing.facilityCharges?.forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.forEach(a => total += (Number(a.totalAmount) || 0));
        billing.surgeryPlans?.forEach(s => total += (Number(s.surgeryCost) || 0));

        const paid = totalPaidBill();
        return Math.max(total, paid);
    };

    const balanceBill = () => Math.max(0, grandTotalBill() - totalPaidBill());

    const getSectionBadge = (items) => {
        const total = items.length;
        if (total === 0) return null;
        const paid = items.filter(x => isPaid(x.paymentStatus)).length;
        const pending = total - paid;
        if (paid === total) return `${total} paid`;
        if (pending === total) return `${total} pending`;
        return `${pending} pending, ${paid} paid`;
    };

    const [paymentModal, setPaymentModal] = useState({ open: false, data: { transactionId: '', upiId: '', cardDetails: '', bankReference: '' } });
    const [proofFile, setProofFile] = useState(null);

    const confirmPaymentWithProof = async (e) => {
        e.preventDefault();

        let proofUrl = '';
        let proofFileId = '';

        setPaying(true);
        try {
            if (proofFile) {
                const formData = new FormData();
                formData.append('images', proofFile);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) {
                    proofUrl = uploadRes.files[0].url;
                    proofFileId = uploadRes.files[0].fileId;
                }
            }

            await executePayment({
                transactionId: paymentModal.data.transactionId,
                upiId: paymentModal.data.upiId,
                cardDetails: paymentModal.data.cardDetails,
                bankReference: paymentModal.data.bankReference,
                proofUrl,
                proofFileId
            });
            setPaymentModal({ open: false, data: {} });
            setProofFile(null);
        } catch (err) {
            console.error('Proof upload failed:', err);
            toast.error('Failed to process payment with proof');
            setPaying(false);
        }
    };

    const executePayment = async (extraData = {}) => {
        const total = totalSelected();
        setPaying(true);
        try {
            await billingAPI.processPayment({
                appointmentIds: selected.appointments,
                labReportIds: selected.labReports,
                pharmacyOrderIds: selected.pharmacyOrders,
                facilityChargeIds: selected.facilityCharges,
                admissionIds: selected.admissions,
                surgeryPlanIds: selected.surgeryPlans,
                splitPayments,
                patientId: patient?._id,
                amount: total,
                ...extraData
            });
            setSuccessMsg(`Payment of ${fmt(total)} processed successfully via ${paymentMode}.`);
            toast.success(`Payment of ${fmt(total)} processed successfully!`);
            const res = await billingAPI.getPatientBills(searchQuery.trim());
            if (res.success) setBilling(res.billing);
            setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [], surgeryPlans: [] });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Payment failed');
        } finally {
            setPaying(false);
        }
    };

    const handleDischarge = async (admissionId) => {
        if (!(await confirmToast('Discharge this patient?', { title: 'Discharge Patient' }))) return;
        setDischargingId(admissionId);
        try {
            await admissionAPI.dischargePatient(admissionId);
            toast.success('Patient discharged successfully');
            const res = await billingAPI.getPatientBills(searchQuery.trim());
            if (res.success) setBilling(res.billing);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Discharge failed');
        } finally {
            setDischargingId(null);
        }
    };

    const activeAdmissions = billing?.admissions?.filter(a => a.status === 'Admitted') || [];
    const pastAdmissions = billing?.admissions?.filter(a => a.status === 'Discharged') || [];

    // Filtered pending lists for Hospital Admin view (view-only pending oversight)
    const pendingAdmissionsList = activeAdmissions.filter(adm => !isPaid(adm.paymentStatus));
    const pendingSurgeryPlans = (billing?.surgeryPlans || []).filter(s => s.paymentStatus !== 'PAID');
    const pendingAppointments = (billing?.appointments || []).filter(a => !isPaid(a.paymentStatus));
    const pendingFacilityCharges = (billing?.facilityCharges || []).filter(f => !isPaid(f.paymentStatus));
    const pendingLabReports = (billing?.labReports || []).filter(l => !isPaid(l.paymentStatus));
    const pendingPharmacyOrders = (billing?.pharmacyOrders || []).filter(p => !isPaid(p.paymentStatus));
    const pendingPastAdmissions = pastAdmissions.filter(adm => !isPaid(adm.paymentStatus));

    const handleSplitPaymentChange = (index, field, value) => {
        const newSplits = [...splitPayments];
        newSplits[index][field] = value;
        if (field === 'method' && value === 'Cash') {
            setPaymentModal({ open: false, data: {} });
            setProofFile(null);
        }
        setSplitPayments(newSplits);
    };

    const addSplitPayment = () => setSplitPayments([...splitPayments, { method: 'Cash', amount: '' }]);
    const removeSplitPayment = (index) => setSplitPayments(splitPayments.filter((_, i) => i !== index));

    const totalSplitAmount = splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balanceRemaining = Math.max(0, totalSelected() - totalSplitAmount);

    const printBookingInfo = useMemo(() => {
        if (!billing) return { dateStr: fmtDate(new Date()), timeStr: '' };
        const pt = (billing.paymentTransactions && billing.paymentTransactions.length > 0) ? billing.paymentTransactions[0] : null;
        if (pt) {
            const dt = getBookingDateTime(pt);
            return {
                dateStr: dt.dateStr || fmtDate(pt.paymentDate || pt.createdAt),
                timeStr: dt.timeStr || pt.appointmentTime || ''
            };
        }
        const apt = (billing.appointments && billing.appointments.length > 0) ? billing.appointments[0] : null;
        if (apt) {
            const dt = getBookingDateTime(apt);
            return {
                dateStr: dt.dateStr || fmtDate(apt.appointmentDate || apt.createdAt),
                timeStr: dt.timeStr || apt.appointmentTime || ''
            };
        }
        return { dateStr: fmtDate(new Date()), timeStr: '' };
    }, [billing]);

    return (
        <div className="billing-profile-page" style={{ maxWidth: '100%', margin: '0', padding: '0' }}>
            {/* Show top banner ONLY when in individual patient settlement tab (hidden for Hospital Admin) */}
            {activeTab === 'patient' && !isHospitalAdmin && (
                <div className="billing-header" style={{
                    background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 4px 12px -2px rgba(20, 184, 166, 0.25)',
                    margin: isHospitalAdmin ? '0 0 16px 0' : '18px 24px 20px 24px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                    <div>
                        <h1 style={{ margin: '0 0 2px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                            <span style={{ fontSize: '1.25rem' }}>💳</span> {isHospitalAdmin ? 'Patient Payment Profile' : 'Record & Settle Patient Payment'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.84rem', opacity: 0.9 }}>
                            {isHospitalAdmin ? 'View patient billing history, outstanding dues, and settlement details.' : 'Search patient, calculate outstanding dues across OPD, Pharmacy, Lab, and record collections.'}
                        </p>
                    </div>
                    <button className="btn-back" onClick={() => setActiveTab('history')} style={{
                        padding: '7px 16px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        color: 'white',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.32)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    >← Back to Payment Register</button>
                </div>
            )}

            {/* Navigation Tabs (Available for all roles, including Hospital Admin & Reception) */}
            <div className="billing-nav-tabs" style={{ margin: isHospitalAdmin ? '12px 0 16px 0' : '0 24px 20px 24px' }}>
                <button
                    type="button"
                    className={`billing-nav-tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
                    onClick={() => setActiveTab('patient')}
                >
                    <span className="bnt-icon">💳</span>
                    <span className="bnt-title">Individual Patient Billing & Refunds</span>
                    {patient && <span className="bnt-badge">{patient.name}</span>}
                </button>
                <button
                    type="button"
                    className={`billing-nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveTab('history');
                        fetchHospitalHistory(historySearch, historyMode, datePreset, customStartDate, customEndDate);
                    }}
                >
                    <span className="bnt-icon">📜</span>
                    <span className="bnt-title">Hospital Billing & Payment History</span>
                    <span className="bnt-badge count">{historyMetrics.count || historyTransactions.length}</span>
                </button>
            </div>

            {activeTab === 'patient' && (
                <div className="billing-patient-view-wrap" style={{ padding: isHospitalAdmin ? '0' : '0 24px 30px 24px' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', marginBottom: '24px' }}>
                            <FaSyncAlt size={26} className="spin" style={{ color: '#0f766e', marginBottom: '12px' }} />
                            <p style={{ margin: 0, color: '#475569', fontSize: '1.05rem', fontWeight: 600 }}>Loading patient billing details...</p>
                        </div>
                    )}

                    {error && <div className="billing-error">{error}</div>}
                    {successMsg && <div className="billing-success">{successMsg}</div>}

                    {patient && billing && (
                        <>
                    {/* Patient Card */}
                    {isHospitalAdmin ? (
                        <div className="patient-info-card ha-patient-banner-cool no-print" style={{ margin: '0 0 16px 0' }}>
                            <div className="ha-pat-banner-top">
                                <div className="ha-pat-banner-left">
                                    <div className="ha-pat-banner-avatar">
                                        {patient.name?.charAt(0)?.toUpperCase() || 'P'}
                                    </div>
                                    <div className="ha-pat-banner-identity">
                                        <h2 className="ha-pat-banner-name">
                                            {formatPatientName(patient.name)}
                                        </h2>
                                        <div className="ha-pat-banner-meta">
                                            <span className="ha-pat-tag">MRN: <strong>{patient.mrn || patient.patientId || '—'}</strong></span>
                                            <span className="ha-pat-tag">Phone: <strong>{patient.phone || '—'}</strong></span>
                                            {patient.gender && <span className="ha-pat-tag">Gender: <strong>{patient.gender}</strong></span>}
                                            {patient.dob && <span className="ha-pat-tag">DOB: <strong>{fmtDate(patient.dob)}</strong></span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="ha-pat-banner-right no-print">
                                    <button
                                        type="button"
                                        className="ha-pat-back-btn"
                                        onClick={() => setActiveTab('history')}
                                    >
                                        <span className="ha-btn-text-desktop">&larr; Back to Payment Register</span>
                                        <span className="ha-btn-text-mobile">&larr; Back</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => window.print()} 
                                        className="ha-pat-btn-print"
                                    >
                                        <span className="ha-btn-text-desktop">🖨️ Print Consolidated Bill</span>
                                        <span className="ha-btn-text-mobile">📥 Download</span>
                                    </button>
                                </div>
                            </div>

                            <div className="ha-pat-financial-strip">
                                <div className="ha-pat-metrics-group">
                                    <div className="ha-pat-metric-pill total">
                                        <span className="ha-metric-lbl">Grand Total Bill</span>
                                        <span className="ha-metric-val">{fmt(grandTotalBill())}</span>
                                    </div>
                                    <div className="ha-pat-metric-pill paid">
                                        <span className="ha-metric-lbl">Total Paid</span>
                                        <span className="ha-metric-val">{fmt(totalPaidBill())}</span>
                                    </div>
                                    <div className="ha-pat-metric-pill balance">
                                        <span className="ha-metric-lbl">Balance Due</span>
                                        <span className="ha-metric-val">{fmt(balanceBill())}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="patient-info-card no-print">
                            <div className="patient-avatar">{patient.name?.charAt(0)?.toUpperCase()}</div>
                            <div className="patient-details">
                                <h2 style={{ fontWeight: 600, fontSize: '1.3rem', letterSpacing: '-0.01em', margin: '0 0 6px 0' }}>{patient.name}</h2>
                                <div className="patient-meta">
                                    <span>MRN: {patient.mrn || patient.patientId || '—'}</span>
                                    <span>Phone: {patient.phone || '—'}</span>
                                    {patient.gender && <span>Gender: {patient.gender}</span>}
                                    {patient.dob && <span>DOB: {fmtDate(patient.dob)}</span>}
                                </div>
                            </div>
                            <div className="patient-outstanding">
                                <div className="outstanding-label">Grand Total Bill</div>
                                <div className="outstanding-amount">{fmt(grandTotalBill())}</div>
                                <div className="paid-balance-meta">
                                    <span className="meta-paid">Paid: {fmt(totalPaidBill())}</span>
                                    <span className="meta-balance">Balance: {fmt(balanceBill())}</span>
                                </div>
                                <button 
                                    onClick={() => window.print()} 
                                    style={{
                                        marginTop: '12px',
                                        padding: '8px 12px',
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    🖨️ Print Consolidated Bill
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ====== DEDICATED SIMPLE & CLEAN PRINTABLE BILL / RECEIPT (SHOWN ONLY ON PRINT) ====== */}
                    <div className="ha-printable-receipt">
                        <div className="ha-pr-clean-header">
                            <div className="ha-pr-left-meta">
                                <h1 className="ha-pr-hospital-name">
                                    {currentUser?.hospitalId?.name || currentUser?.hospitalName || localStorage.getItem('hospitalName') || 'Pacific Hospital'}
                                </h1>
                                <div className="ha-pr-receipt-tag">Official Patient Payment Receipt</div>

                                <div className="ha-pr-aligned-details">
                                    <div className="ha-pr-row">
                                        <span className="ha-pr-label">Appointment Date &amp; Time:</span>
                                        <strong className="ha-pr-val">
                                            {printBookingInfo.dateStr} {printBookingInfo.timeStr ? `(${printBookingInfo.timeStr})` : ''}
                                        </strong>
                                    </div>
                                    <div className="ha-pr-row">
                                        <span className="ha-pr-label">Patient Name:</span>
                                        <strong className="ha-pr-val ha-pr-name">
                                            {formatPatientName(patient.name)}
                                        </strong>
                                    </div>
                                    <div className="ha-pr-row">
                                        <span className="ha-pr-label">MRN / Patient ID:</span>
                                        <span className="ha-pr-val">{patient.mrn || patient.patientId || '—'}</span>
                                    </div>
                                    <div className="ha-pr-row">
                                        <span className="ha-pr-label">Phone Number:</span>
                                        <span className="ha-pr-val">{patient.phone || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="ha-pr-right-meta">
                                <div className="ha-pr-badge-paid">✓ PAID &amp; SETTLED</div>
                                <div className="ha-pr-date-issued">Receipt Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            </div>
                        </div>

                        <div className="ha-pr-hr"></div>

                        <div className="ha-pr-section-title">PAYMENT DETAILS</div>

                        <table className="ha-pr-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                                    <th>Service / Description</th>
                                    <th>Payment Mode</th>
                                    <th>Transaction Ref / UTR</th>
                                    <th>Date &amp; Time</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(billing.paymentTransactions && billing.paymentTransactions.length > 0) ? (
                                    billing.paymentTransactions.map((pt, idx) => {
                                        const { dateStr, timeStr } = getBookingDateTime(pt);
                                        return (
                                            <tr key={pt._id || idx}>
                                                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                                <td>
                                                    <strong style={{ color: '#0f172a' }}>{pt.description || 'OPD Consultation Fee'}</strong>
                                                </td>
                                                <td>{pt.paymentMode || 'Cash'}</td>
                                                <td><code>{pt.transactionId || pt.upiId || pt.bankReference || '—'}</code></td>
                                                <td>{dateStr} {timeStr ? `(${timeStr})` : ''}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className="ha-pr-status-badge">Paid</span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(pt.amount)}</td>
                                            </tr>
                                        );
                                    })
                                ) : (billing.appointments && billing.appointments.length > 0) ? (
                                    billing.appointments.map((apt, idx) => (
                                        <tr key={apt._id || idx}>
                                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                            <td>OPD Consultation Fee - Dr. {apt.doctorName || 'Doctor'}</td>
                                            <td>{apt.paymentMethod || 'Cash'}</td>
                                            <td><code>{apt.cardRef || '—'}</code></td>
                                            <td>{fmtDate(apt.appointmentDate, apt.appointmentTime)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className="ha-pr-status-badge">{apt.paymentStatus || 'Paid'}</span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(apt.amount)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                                            No individual transactions recorded.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Financial Totals Summary (Aligned Right) */}
                        <div className="ha-pr-totals-container">
                            <div className="ha-pr-totals-card">
                                <div className="ha-pr-totals-row">
                                    <span>Grand Total Bill:</span>
                                    <strong>{fmt(grandTotalBill())}</strong>
                                </div>
                                <div className="ha-pr-totals-row paid">
                                    <span>Total Amount Paid:</span>
                                    <strong style={{ color: '#15803d' }}>{fmt(totalPaidBill())}</strong>
                                </div>
                                <div className="ha-pr-totals-row balance">
                                    <span>Balance Due:</span>
                                    <strong>{fmt(balanceBill())}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Official Print Footer */}
                        <div className="ha-pr-footer">
                            <div className="ha-pr-footer-note">
                                • Official receipt issued by {currentUser?.hospitalId?.name || currentUser?.hospitalName || localStorage.getItem('hospitalName') || 'Pacific Hospital'}.<br />
                                • Valid for insurance, tax deduction, and hospital records.
                            </div>
                            <div className="ha-pr-footer-sig">
                                <div className="ha-pr-sig-line"></div>
                                <span>Authorized Signature &amp; Stamp</span>
                            </div>
                        </div>
                    </div>

                    {/* Active Admissions */}
                    {(isHospitalAdmin ? pendingAdmissionsList.length > 0 : activeAdmissions.length > 0) && (
                        <div className="billing-section admitted-section">
                            <div className="section-header admitted-header">
                                <span className="admitted-badge">Currently Admitted</span>
                                <h3>Active Hospitalization</h3>
                            </div>
                            {(isHospitalAdmin ? pendingAdmissionsList : activeAdmissions).map(adm => (
                                <div key={adm._id} className="admission-card active">
                                    <div className="admission-top">
                                        <div>
                                            <strong>Admitted:</strong> {fmtAdmissionDateTime(adm.admissionDate, adm.admissionTime, adm.createdAt)}
                                            {adm.ward && <span className="badge-ward"> Ward: {adm.ward}</span>}
                                            {adm.bedNumber && <span className="badge-bed"> Bed: {adm.bedNumber}</span>}
                                        </div>
                                        <div className="admission-actions">
                                            {!isHospitalAdmin ? (
                                                <>
                                                    <label className="check-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.admissions.includes(adm._id)}
                                                            onChange={() => toggle('admissions', adm._id)}
                                                            disabled={isPaid(adm.paymentStatus)}
                                                        />
                                                        {isPaid(adm.paymentStatus) ? (
                                                            <span className="paid-badge">Paid</span>
                                                        ) : (
                                                            <span>Mark for payment</span>
                                                        )}
                                                    </label>
                                                    <button
                                                        className="btn-discharge"
                                                        onClick={() => handleDischarge(adm._id)}
                                                        disabled={dischargingId === adm._id}
                                                    >
                                                        {dischargingId === adm._id ? 'Discharging...' : 'Discharge'}
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="status-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', fontWeight: 700 }}>
                                                    Pending — {fmt(adm.totalAmount)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {adm.selectedFacilities?.length > 0 && (
                                        <div className="billing-table-responsive">
                                            <table className="facility-table">
                                                <thead>
                                                    <tr><th>Facility</th><th>Rate/Day</th><th>Days</th><th>Amount</th></tr>
                                                </thead>
                                                <tbody>
                                                    {adm.selectedFacilities.map((f, i) => (
                                                        <tr key={i}>
                                                            <td>{f.facilityName}</td>
                                                            <td>{fmt(f.pricePerDay)}</td>
                                                            <td>{f.days}</td>
                                                            <td>{fmt(f.totalAmount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td colSpan="3"><strong>Total</strong></td>
                                                        <td><strong>{fmt(adm.totalAmount)}</strong></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                    {adm.notes && <p className="admission-notes">Notes: {adm.notes}</p>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Scheduled Surgeries & OT Procedures */}
                    {(isHospitalAdmin ? pendingSurgeryPlans.length > 0 : (billing.surgeryPlans && billing.surgeryPlans.length > 0)) && (
                        <div className="billing-section" style={{ borderLeft: '4px solid #7c3aed' }}>
                            <div className="section-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🩺</span> Scheduled Surgeries & OT Procedures {isHospitalAdmin ? `(${pendingSurgeryPlans.length} pending)` : `(${getSectionBadge(billing.surgeryPlans)})`}
                                </h3>
                                {!isHospitalAdmin && billing.surgeryPlans.some(s => s.paymentStatus !== 'PAID') && (
                                    <button className="btn-select-all" onClick={() => toggleAll('surgeryPlans', billing.surgeryPlans)}>
                                        {billing.surgeryPlans.filter(s => s.paymentStatus !== 'PAID').every(s => selected.surgeryPlans.includes(s._id)) ? 'Deselect All Surgeries' : 'Select All Surgeries'}
                                    </button>
                                )}
                            </div>
                            <div className="billing-table-responsive">
                                <table className="billing-table">
                                    <thead>
                                        <tr>
                                            {!isHospitalAdmin && <th></th>}
                                            <th>Date &amp; Time</th>
                                            <th>Surgery &amp; Clinical Context</th>
                                            <th>Surgical Team</th>
                                            <th>OT Room</th>
                                            <th style={{ textAlign: 'center' }}>Status</th>
                                            <th style={{ textAlign: 'center' }}>Fee / Remaining</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(isHospitalAdmin ? pendingSurgeryPlans : billing.surgeryPlans).map(s => {
                                            const isFullyPaid = s.paymentStatus === 'PAID';
                                            const cost = Number(s.surgeryCost) || 0;
                                            const paid = Number(s.paidAmount) || 0;
                                            const remaining = Math.max(0, cost - paid);
                                            const surgeonName = s.surgeonId?.name ? (s.surgeonId.name).replace(/^Dr\.?\s*/i, '') : 'Surgeon';
                                            const assistants = s.assistantSurgeonIds || [];
                                            const { dateStr, timeStr } = getSurgeryDateTime(s);

                                            return (
                                                <tr key={s._id} className={!isHospitalAdmin && selected.surgeryPlans.includes(s._id) ? 'selected-row' : ''}>
                                                    {!isHospitalAdmin && (
                                                        <td>
                                                            {isFullyPaid ? (
                                                                <span className="paid-icon-check">✓</span>
                                                            ) : (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selected.surgeryPlans.includes(s._id)}
                                                                    onChange={() => toggle('surgeryPlans', s._id)}
                                                                />
                                                            )}
                                                        </td>
                                                    )}
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>{dateStr}</span>
                                                            {timeStr && (
                                                                <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{ fontSize: '0.74rem' }}>🕒</span> {timeStr}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <strong style={{ color: '#0f172a' }}>{s.surgery}</strong>
                                                        {s.diagnosis && (
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                Dx: {s.diagnosis}
                                                            </div>
                                                        )}
                                                        {s.planId && (
                                                            <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px', fontWeight: 600 }}>
                                                                {s.planId}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>
                                                            👨‍⚕️ Op: Dr. {surgeonName}
                                                        </div>
                                                        {assistants.length > 0 ? (
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                                🤝 Asst: {assistants.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                                No assistants
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span style={{ padding: '3px 8px', background: '#f1f5f9', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, color: '#334155', border: '1px solid #e2e8f0' }}>
                                                            🚪 {s.otRoomId?.name || 'Assigned OT'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            padding: '4px 12px',
                                                            borderRadius: '20px',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 600,
                                                            letterSpacing: '0.01em',
                                                            background: isFullyPaid ? '#dcfce7' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fef3c7' : '#fee2e2'),
                                                            color: isFullyPaid ? '#15803d' : (s.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#dc2626'),
                                                            border: `1px solid ${isFullyPaid ? '#bbf7d0' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fde68a' : '#fecaca')}`,
                                                        }}>
                                                            {isFullyPaid ? 'Paid' : (s.paymentStatus === 'PARTIALLY PAID' ? 'Partially Paid' : 'Unpaid')}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{fmt(cost)}</div>
                                                        {paid > 0 && paid < cost && (
                                                            <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '2px' }}>
                                                                Paid: {fmt(paid)} (Due: {fmt(remaining)})
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Consolidated Billing View (Appointments & Facility Charges) */}
                    {(billing.appointments?.length > 0 || billing.facilityCharges?.length > 0) && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Consolidated Billing View (Consultations & ICU Charges)</h3>
                                {!isHospitalAdmin && (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {billing.appointments?.some(a => !isPaid(a.paymentStatus)) && (
                                            <button className="btn-select-all" onClick={() => toggleAll('appointments', billing.appointments)}>
                                                {billing.appointments.filter(a => !isPaid(a.paymentStatus)).every(a => selected.appointments.includes(a._id)) ? 'Deselect All Consults' : 'Select All Consults'}
                                            </button>
                                        )}
                                        {billing.facilityCharges?.some(f => !isPaid(f.paymentStatus)) && (
                                            <button className="btn-select-all" onClick={() => toggleAll('facilityCharges', billing.facilityCharges)}>
                                                {billing.facilityCharges.filter(f => !isPaid(f.paymentStatus)).every(f => selected.facilityCharges.includes(f._id)) ? 'Deselect All ICU' : 'Select All ICU'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="billing-table-responsive">
                                <table className="billing-table">
                                    <thead><tr>{!isHospitalAdmin && <th></th>}<th>Date</th><th>Type & Description</th><th>Collected By</th><th>Status</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {/* Appointments */}
                                        {(billing.appointments || []).map(a => (
                                            <tr key={a._id} className={!isHospitalAdmin && selected.appointments.includes(a._id) ? 'selected-row' : ''}>
                                                {!isHospitalAdmin && (
                                                    <td>
                                                        {a.paymentStatus === 'Paid' ? (
                                                            <span className="paid-icon-check">✓</span>
                                                        ) : (
                                                            <input type="checkbox" checked={selected.appointments.includes(a._id)} onChange={() => toggle('appointments', a._id)} />
                                                        )}
                                                    </td>
                                                )}
                                                <td>{fmtDate(a.appointmentDate)}{a.appointmentTime && ` ${a.appointmentTime}`}</td>
                                                <td>
                                                    <strong>Appointment Fee</strong><br />
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{a.serviceName || 'Consultation'}</span>
                                                </td>
                                                <td>{a.doctorName || '—'}</td>
                                                <td>
                                                    <span className="status-badge">
                                                        {a.paymentStatus === 'Paid' ? 'PAID' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="amount-cell">{fmt(a.amount)}</td>
                                            </tr>
                                        ))}

                                        {/* Facility / ICU Charges */}
                                        {(billing.facilityCharges || []).map(f => (
                                            <tr key={f._id} className={!isHospitalAdmin && selected.facilityCharges.includes(f._id) ? 'selected-row' : ''}>
                                                {!isHospitalAdmin && (
                                                    <td>
                                                        {isPaid(f.paymentStatus) ? (
                                                            <span className="paid-icon-check">✓</span>
                                                        ) : (
                                                            <input type="checkbox" checked={selected.facilityCharges.includes(f._id)} onChange={() => toggle('facilityCharges', f._id)} />
                                                        )}
                                                    </td>
                                                )}
                                                <td>{fmtDate(f.createdAt)}</td>
                                                <td>
                                                    <strong>ICU / Facility Charge</strong><br />
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{f.facilityName} ({f.daysUsed || f.days || 1} Days @ {fmt(f.pricePerDay)}/day)</span>
                                                </td>
                                                <td>{f.collectedBy?.name || f.addedBy?.name || '—'}</td>
                                                <td>
                                                    <span className="status-badge">
                                                        {isPaid(f.paymentStatus) ? 'PAID' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="amount-cell">{fmt(f.totalAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Lab Reports */}
                    {(billing.labReports && billing.labReports.length > 0) && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Lab Tests ({getSectionBadge(billing.labReports)})</h3>
                                {!isHospitalAdmin && billing.labReports.some(l => !isPaid(l.paymentStatus)) && (
                                    <button className="btn-select-all" onClick={() => toggleAll('labReports', billing.labReports)}>
                                        {billing.labReports.filter(l => !isPaid(l.paymentStatus)).every(l => selected.labReports.includes(l._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <div className="billing-table-responsive">
                                <table className="billing-table">
                                    <thead><tr>{!isHospitalAdmin && <th></th>}<th>Date</th><th>Tests</th><th>Status</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {(billing.labReports || []).map(l => (
                                            <tr key={l._id} className={!isHospitalAdmin && selected.labReports.includes(l._id) ? 'selected-row' : ''}>
                                                {!isHospitalAdmin && (
                                                    <td>
                                                        {isPaid(l.paymentStatus) ? (
                                                            <span className="paid-icon-check">✓</span>
                                                        ) : (
                                                            <input type="checkbox" checked={selected.labReports.includes(l._id)} onChange={() => toggle('labReports', l._id)} />
                                                        )}
                                                    </td>
                                                )}
                                                <td>{fmtDate(l.createdAt)}</td>
                                                <td>{Array.isArray(l.testNames) ? l.testNames.join(', ') : (l.testName || '—')}</td>
                                                <td>
                                                    <span className="status-badge">
                                                        {isPaid(l.paymentStatus) ? 'PAID' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="amount-cell">{fmt(l.amount || l.price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pharmacy Orders */}
                    {(billing.pharmacyOrders && billing.pharmacyOrders.length > 0) && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Pharmacy Orders ({getSectionBadge(billing.pharmacyOrders)})</h3>
                                {!isHospitalAdmin && billing.pharmacyOrders.some(p => !isPaid(p.paymentStatus)) && (
                                    <button className="btn-select-all" onClick={() => toggleAll('pharmacyOrders', billing.pharmacyOrders)}>
                                        {billing.pharmacyOrders.filter(p => !isPaid(p.paymentStatus)).every(p => selected.pharmacyOrders.includes(p._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <div className="billing-table-responsive">
                                <table className="billing-table">
                                    <thead><tr>{!isHospitalAdmin && <th></th>}<th>Date</th><th>Items</th><th>Order Status</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {(billing.pharmacyOrders || []).map(p => (
                                            <tr key={p._id} className={!isHospitalAdmin && selected.pharmacyOrders.includes(p._id) ? 'selected-row' : ''}>
                                                {!isHospitalAdmin && (
                                                    <td>
                                                        {isPaid(p.paymentStatus) ? (
                                                            <span className="paid-icon-check">✓</span>
                                                        ) : (
                                                            <input type="checkbox" checked={selected.pharmacyOrders.includes(p._id)} onChange={() => toggle('pharmacyOrders', p._id)} />
                                                        )}
                                                    </td>
                                                )}
                                                <td>{fmtDate(p.createdAt)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: '500', fontSize: '0.9rem', color: '#334155' }}>
                                                            📦 {p.items?.length || 0} Items
                                                        </span>
                                                        <button
                                                            onClick={() => toggleExpand(p._id)}
                                                            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', padding: 0 }}
                                                        >
                                                            {expandedRows[p._id] ? 'Hide Details ↑' : 'View Details ↓'}
                                                        </button>
                                                    </div>
                                                    {expandedRows[p._id] && Array.isArray(p.items) && (
                                                        <div className="bg-gray-50/50 p-2 rounded mt-1" style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', marginTop: '8px', border: '1px solid #e2e8f0' }}>
                                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                                                                {p.items.map((item, idx) => {
                                                                    const name = item.medicineName || item.name;
                                                                    const freq = item.frequency ? ` (${item.frequency})` : '';
                                                                    const qty = parseInt(item.quantity) || parseInt(item.duration) || parseInt(item.days) || 1;
                                                                    const itemTotal = (Number(item.price) || 50) * qty;
                                                                    if (!name) return null;
                                                                    const durationText = item.duration ? `${item.duration}` : item.quantity ? `${item.quantity} Qty` : item.days ? `${item.days} Days` : '1 Qty';
                                                                    return (
                                                                        <li key={idx} style={{ marginBottom: '4px' }}>
                                                                            <span style={{ color: '#000' }}>{name}{freq}</span>
                                                                            <span style={{ marginLeft: '6px', color: '#475569', fontSize: '0.85rem' }}>[{durationText}]</span>
                                                                            <span style={{ marginLeft: '6px', color: '#059669', fontWeight: '600', fontSize: '0.8rem' }}>- ₹{itemTotal}</span>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className="status-badge">
                                                        {isPaid(p.paymentStatus) ? 'PAID' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="amount-cell">{fmt(getPharmacyTotal(p))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Past Admissions */}
                    {pastAdmissions.length > 0 && (
                        <div className="billing-section past-admissions">
                            <div className="section-header">
                                <h3>Past Admissions ({pastAdmissions.length})</h3>
                            </div>
                            {pastAdmissions.map(adm => (
                                <div key={adm._id} className="admission-card past">
                                    <div className="admission-top">
                                        <div>
                                            <strong>Admitted:</strong> {fmtAdmissionDateTime(adm.admissionDate, adm.admissionTime, adm.createdAt)}
                                            <strong style={{ marginLeft: 16 }}>Discharged:</strong> {fmtAdmissionDateTime(adm.dischargeDate, adm.dischargeTime, adm.updatedAt)}
                                            {adm.ward && <span className="badge-ward"> Ward: {adm.ward}</span>}
                                            {adm.bedNumber && <span className="badge-bed"> Bed: {adm.bedNumber}</span>}
                                        </div>
                                        <span className={isPaid(adm.paymentStatus) ? 'paid-badge' : 'pending-badge'}>
                                            {isPaid(adm.paymentStatus) ? 'Paid' : `Pending — ${fmt(adm.totalAmount)}`}
                                        </span>
                                    </div>
                                    {adm.selectedFacilities?.length > 0 && (
                                        <div className="facility-list">
                                            {adm.selectedFacilities.map((f, i) => (
                                                <span key={i} className="facility-tag">{f.facilityName} × {f.days}d = {fmt(f.totalAmount)}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* No items at all (Only for Receptionist if no records found) */}
                    {!isHospitalAdmin && billing.appointments?.length === 0 && billing.labReports?.length === 0 &&
                        billing.pharmacyOrders?.length === 0 && billing.facilityCharges?.length === 0 &&
                        activeAdmissions.length === 0 && pastAdmissions.length === 0 && (
                            <div className="no-bills">No billing items found for this patient.</div>
                        )}

                    {/* Payment Panel (Only for Receptionist collection) */}
                    {!isHospitalAdmin && pendingTotal() > 0 && (
                        <div className="payment-panel">
                            <div className="payment-summary">
                                <div className="payment-row">
                                    <span>Selected Amount:</span>
                                    <strong className="selected-amount">{fmt(totalSelected())}</strong>
                                </div>
                                <div className="payment-row">
                                    <span>Total Balance Due:</span>
                                    <strong>{fmt(pendingTotal())}</strong>
                                </div>
                            </div>
                            <form className="payment-controls" onSubmit={async (e) => {
                                e.preventDefault();
                                if (totalSplitAmount !== totalSelected()) {
                                    toast.error(`Total split amount (${fmt(totalSplitAmount)}) must exactly match the selected amount (${fmt(totalSelected())}).`);
                                    return;
                                }
                                const hasNonCash = splitPayments.some(p => p.method !== 'Cash');
                                if (!hasNonCash) {
                                    if (!(await confirmToast(`Process payment of ${fmt(totalSelected())} via Cash?`, { title: 'Process Cash Payment', danger: false, confirmText: 'Process Payment' }))) return;
                                    executePayment({});
                                } else {
                                    confirmPaymentWithProof(e);
                                }
                            }}>
                                <PaymentSection
                                    splitPayments={splitPayments}
                                    onSplitChange={handleSplitPaymentChange}
                                    onAddSplit={addSplitPayment}
                                    onRemoveSplit={removeSplitPayment}
                                    totalAmount={totalSelected()}
                                    upiOptions={upiOptions}
                                    paymentData={paymentModal.data}
                                    onPaymentDataChange={(newData) => setPaymentModal({ ...paymentModal, data: newData })}
                                    proofFile={proofFile}
                                    onProofFileChange={setProofFile}
                                />

                                <button type="submit" className="btn-pay" disabled={paying || totalSelected() === 0 || totalSplitAmount !== totalSelected()} style={{ marginTop: '20px' }}>
                                    {paying ? 'Processing...' : `Pay ${fmt(totalSelected())} (Split: ${fmt(totalSplitAmount)})`}
                                </button>
                            </form>
                        </div>
                    )}
                    {/* Payment History */}
                    <div className="billing-section payment-history">
                        <div className="section-header">
                            <h3>Payment History</h3>
                        </div>
                        {(!billing.paymentTransactions || billing.paymentTransactions.length === 0) ? (
                            <div className="no-bills" style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                                {isHospitalAdmin ? 'No past payments recorded for this patient.' : 'No past payments found for this patient. Select items above and make a payment to see the history here.'}
                            </div>
                        ) : (
                            <div className="billing-table-responsive">
                                <table className="billing-table">
                                    <thead><tr><th>Date</th><th>Mode</th><th>Txn ID</th><th>Details</th><th>Amount</th><th>Status</th><th>View</th><th>Download</th></tr></thead>
                                    <tbody>
                                        {billing.paymentTransactions.map(pt => (
                                            <tr key={pt._id}>
                                                <td>
                                                    {(() => {
                                                        const { dateStr, timeStr } = getBookingDateTime(pt);
                                                        return (
                                                            <div className="ha-date-stack">
                                                                <span className="ha-date-text">{dateStr}</span>
                                                                {timeStr && <span className="ha-time-text">{timeStr}</span>}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td>
                                                    {pt.splitPayments && pt.splitPayments.length > 1 ? (
                                                        pt.splitPayments.map(sp => sp.method).join(' + ')
                                                    ) : (
                                                        pt.paymentMode
                                                    )}
                                                </td>
                                                <td>
                                                    {(() => {
                                                        const isCash = (pt.paymentMode || '').toUpperCase() === 'CASH' &&
                                                            (!pt.splitPayments || !pt.splitPayments.some(s => (s.method || '').toUpperCase().includes('UPI')));
                                                        if (isCash) {
                                                            return pt.transactionId || pt.bankReference || '—';
                                                        }
                                                        return pt.transactionId || pt.upiId || pt.bankReference || '—';
                                                    })()}
                                                </td>
                                                <td style={{ maxWidth: '250px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <span style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{pt.description || 'General Payment'}</span>
                                                        {pt.billedItems && (
                                                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                                                {pt.billedItems.appointments?.length > 0 && <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#4f46e5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Appointment</span>}
                                                                {pt.billedItems.labReports?.length > 0 && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Lab</span>}
                                                                {pt.billedItems.pharmacyOrders?.length > 0 && <span style={{ fontSize: '10px', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Medicine</span>}
                                                                {pt.billedItems.facilityCharges?.length > 0 && <span style={{ fontSize: '10px', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Facility</span>}
                                                                {pt.billedItems.admissions?.length > 0 && <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>ICU/Admission</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="amount-cell">{fmt(pt.amount)}</td>
                                                <td>
                                                    <span className={pt.paymentStatus === 'Paid' ? 'paid-icon-check' : 'status-badge'}>
                                                        {pt.paymentStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    {pt.proofUrl ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div
                                                                className="proof-table-thumb"
                                                                onClick={() => setViewProofUrl(pt.proofUrl, { patientName: patient?.name, amount: pt.amount, mode: pt.paymentMode, txnId: pt.transactionId || pt.upiId, date: pt.paymentDate })}
                                                                title="Click to zoom screenshot"
                                                            >
                                                                <img src={pt.proofUrl} alt="Proof" onError={(e) => { e.target.style.display = 'none'; }} />
                                                            </div>
                                                            <button
                                                                onClick={() => setViewProofUrl(pt.proofUrl, { patientName: patient?.name, amount: pt.amount, mode: pt.paymentMode, txnId: pt.transactionId || pt.upiId, date: pt.paymentDate })}
                                                                className="btn-proof-view"
                                                                title="View Screenshot / Proof"
                                                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                                                            >
                                                                <FaEye size={13} /> View
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {pt.proofUrl ? (
                                                        <button onClick={() => window.open(pt.proofUrl, '_blank')} className="btn-proof-dl" title="Download Invoice / Proof" style={{background:'none',border:'none',cursor:'pointer',color:'#10b981'}}>
                                                            <FaDownload size={18} />
                                                        </button>
                                                    ) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Patient Refund History & Admin Approvals (Requirement 5) */}
                    <div className="billing-section refund-history-section" style={{ marginTop: '24px' }}>
                        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <FaRupeeSign color="#dc2626" /> Patient Refund History &amp; Admin Approvals
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {billing?.refundRequests?.some(r => (r.status || '').toUpperCase().includes('PENDING')) && (
                                    <span style={{ fontSize: '0.82rem', background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '12px', fontWeight: 800, border: '1px solid #fde68a' }}>
                                        ⚠️ Action Required: Pending Approval
                                    </span>
                                )}
                                {billing?.refundRequests?.length > 0 && (
                                    <span style={{ fontSize: '0.82rem', background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontWeight: 700 }}>
                                        {billing.refundRequests.length} Refund{billing.refundRequests.length > 1 ? 's' : ''}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={openCreateRefundModal}
                                    style={{
                                        background: '#dc2626',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '7px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)'
                                    }}
                                >
                                    <FaPlus size={12} /> + Request Refund
                                </button>
                            </div>
                        </div>

                        {(!billing?.refundRequests || billing.refundRequests.length === 0) ? (
                            <div className="no-bills" style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b', fontSize: '0.9rem' }}>
                                <p style={{ margin: '0 0 10px', fontWeight: 600 }}>No refund records found for this patient.</p>
                                <button
                                    type="button"
                                    onClick={openCreateRefundModal}
                                    style={{
                                        background: '#059669',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Initiate Refund For This Patient
                                </button>
                            </div>
                        ) : (
                            <div className="billing-table-responsive" style={{ marginTop: '12px' }}>
                                <table className="billing-table">
                                    <thead>
                                        <tr>
                                            <th>Date &amp; Time</th>
                                            <th>Refund Amount</th>
                                            <th>Mode</th>
                                            <th>Status</th>
                                            <th>Processed / Handed Over By</th>
                                            <th>Txn Ref / UTR</th>
                                            <th>Reason / Notes</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {billing.refundRequests.map(rf => {
                                            const rawSt = (rf.status || '').toUpperCase().trim();
                                            const isPending = rawSt === 'PENDING_APPROVAL' || rawSt === 'PENDING' || rawSt.includes('PENDING');
                                            const isApproved = rawSt === 'APPROVED';
                                            const isRefunded = rawSt === 'REFUNDED' || rawSt === 'COMPLETED';
                                            const isRejected = rawSt === 'REJECTED';

                                            return (
                                                <tr key={rf._id} style={{ background: isPending ? '#fffdf7' : 'transparent' }}>
                                                    <td>
                                                        <div className="ha-date-stack">
                                                            <span className="ha-date-text">{fmtDate(rf.processedAt || rf.handedOverAt || rf.approvedAt || rf.createdAt)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.95rem' }}>
                                                            {fmt(rf.refundAmount)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background: rf.refundMode === 'CASH' ? '#fef3c7' : '#e0e7ff',
                                                            color: rf.refundMode === 'CASH' ? '#92400e' : '#3730a3'
                                                        }}>
                                                            {rf.refundMode}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '4px 9px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background:
                                                                isRefunded ? '#dcfce7' :
                                                                isApproved ? '#dbeafe' :
                                                                isPending ? '#fef3c7' : '#fee2e2',
                                                            color:
                                                                isRefunded ? '#15803d' :
                                                                isApproved ? '#1e40af' :
                                                                isPending ? '#b45309' : '#b91c1c'
                                                        }}>
                                                            {isPending ? '⏳ AWAITING APPROVAL' : isApproved ? '✓ APPROVED' : isRefunded ? '✓ REFUNDED' : '✕ REJECTED'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                                                            {rf.handedOverByName || rf.processedByName || rf.approvedByName || rf.requestedByName || '—'}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            {rf.handedOverByName ? 'Cash Handover' : rf.processedByName ? 'Bank/UPI Processed' : isApproved ? `Approved by ${rf.approvedByName}` : `Requested by ${rf.requestedByName || 'Staff'}`}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#475569' }}>
                                                            {rf.refundTransactionId || rf.originalTransactionId || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ maxWidth: '200px' }}>
                                                        <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                                                            {rf.reason || rf.processingNotes || '—'}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {isPending && (
                                                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApproveRefund(rf._id)}
                                                                    disabled={refundActionLoading}
                                                                    style={{
                                                                        background: '#059669',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        borderRadius: '6px',
                                                                        padding: '6px 14px',
                                                                        fontSize: '0.82rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                                                                    }}
                                                                    title="Authorize & Approve Refund"
                                                                >
                                                                    ✓ Approve
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRejectRefund(rf._id)}
                                                                    disabled={refundActionLoading}
                                                                    style={{
                                                                        background: '#fee2e2',
                                                                        color: '#dc2626',
                                                                        border: '1px solid #fecaca',
                                                                        borderRadius: '6px',
                                                                        padding: '6px 10px',
                                                                        fontSize: '0.82rem',
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    title="Reject Refund"
                                                                >
                                                                    ✕ Reject
                                                                </button>
                                                            </div>
                                                        )}

                                                        {isApproved && rf.refundMode === 'CASH' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleHandoverCashRefund(rf._id, rf.refundAmount)}
                                                                disabled={refundActionLoading}
                                                                style={{
                                                                    background: '#10b981',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '6px',
                                                                    padding: '6px 14px',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                                                                }}
                                                                title="Hand Over Cash to Patient"
                                                            >
                                                                💵 Disburse Cash
                                                            </button>
                                                        )}

                                                        {isApproved && ['UPI', 'BANK_TRANSFER'].includes(rf.refundMode) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleProcessOnlineRefund(rf._id, rf.refundAmount)}
                                                                disabled={refundActionLoading}
                                                                style={{
                                                                    background: '#2563eb',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '6px',
                                                                    padding: '6px 14px',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                                                                }}
                                                                title="Enter UTR & Mark Processed"
                                                            >
                                                                ⚡ Enter UTR
                                                            </button>
                                                        )}

                                                        {isRefunded && (
                                                            <span style={{ color: '#059669', fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                ✓ Disbursed
                                                            </span>
                                                        )}

                                                        {isRejected && (
                                                            <span style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                                                                ✕ Declined
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

                    {!patient && !loading && !error && (
                        <div className="billing-empty-prompt" style={{ margin: '30px 0' }}>
                            <div className="empty-prompt-icon">💳</div>
                            <h3>No Patient Selected</h3>
                            <p>Please select a patient from the <button type="button" onClick={() => setActiveTab('history')} style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Payment History</button> register to view and settle billing.</p>
                        </div>
                    )}
                </div>
            )}

    {/* ====== TAB 2: HOSPITAL-WIDE PAYMENT & BILLING HISTORY ====== */}
    {activeTab === 'history' && (
        <div className="ha-billing-page">
            {/* 1. Main Header Banner */}
            <div className="ha-main-header">
                <div className="ha-header-left">
                    <div className="ha-title-icon-card">
                        <FaFileAlt size={20} color="#ffffff" />
                    </div>
                    <div className="ha-title-text-group">
                        <h1 className="ha-page-title">Payment History</h1>
                        <p className="ha-page-sub">Track and manage all patient payments</p>
                    </div>
                </div>

                <div className="ha-header-right">
                    {/* Refresh Button */}
                    <button
                        type="button"
                        className="ha-btn-refresh-header"
                        onClick={() => fetchHospitalHistory()}
                        title="Refresh payment register"
                    >
                        <FaSyncAlt size={12} className={historyLoading ? 'spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* 3. 5 Revenue & Collection Summary Cards */}
            <div className="ha-kpi-grid">
                {/* Card 1: Total Earnings / Overall (Ab tak ka pura) */}
                <div
                    className={`ha-kpi-card ha-kpi-blue clickable ${datePreset === 'all' && historyMode === 'ALL' && !historySearch ? 'active' : ''}`}
                    onClick={() => { setDatePreset('all'); setHistoryMode('ALL'); setHistorySearch(''); setHistoryStatus('ALL'); }}
                    title="Click to reset and view all transactions"
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box blue">
                            <FaRupeeSign size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">Total Earnings</span>
                            <strong className="ha-kpi-value">{fmt(revenueStats.totalRevenue)}</strong>
                            <span className="ha-kpi-sub-count">{revenueStats.totalCount} {revenueStats.totalCount === 1 ? 'payment collected' : 'payments collected'}</span>
                        </div>
                    </div>
                </div>

                {/* Card 2: This Month / Custom Range */}
                <div
                    className={`ha-kpi-card ha-kpi-purple clickable ${datePreset === 'this_month' || datePreset === 'custom' ? 'active' : ''}`}
                    onClick={() => {
                        if (datePreset === 'custom') {
                            setShowCustomRangePicker(true);
                        } else {
                            setDatePreset(prev => prev === 'this_month' ? 'all' : 'this_month');
                        }
                    }}
                    title={datePreset === 'custom' ? "Custom date range active (Click to modify)" : "Click to filter This Month's transactions"}
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box purple">
                            <FaCalendarAlt size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">
                                {datePreset === 'custom' ? 'Custom Range' : 'This Month'}
                            </span>
                            <strong className="ha-kpi-value">
                                {datePreset === 'custom' ? fmt(revenueStats.customRevenue) : fmt(revenueStats.monthRevenue)}
                            </strong>
                            <span className="ha-kpi-sub-count">
                                {datePreset === 'custom'
                                    ? `${revenueStats.customCount} ${revenueStats.customCount === 1 ? 'payment in range' : 'payments in range'}`
                                    : `${revenueStats.monthCount} ${revenueStats.monthCount === 1 ? 'payment this month' : 'payments this month'}`
                                }
                            </span>
                        </div>
                    </div>
                </div>

                {/* Card 3: This Week (Is Hafte Ka - Cool Cyan) */}
                <div
                    className={`ha-kpi-card ha-kpi-cyan clickable ${datePreset === 'this_week' ? 'active' : ''}`}
                    onClick={() => setDatePreset(prev => prev === 'this_week' ? 'all' : 'this_week')}
                    title="Click to filter This Week's transactions"
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box cyan">
                            <FaChartLine size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">This Week</span>
                            <strong className="ha-kpi-value">{fmt(revenueStats.weekRevenue)}</strong>
                            <span className="ha-kpi-sub-count">{revenueStats.weekCount} {revenueStats.weekCount === 1 ? 'payment this week' : 'payments this week'}</span>
                        </div>
                    </div>
                </div>

                {/* Card 4: Today's Collection (Aaj Ka) */}
                <div
                    className={`ha-kpi-card ha-kpi-green clickable ${datePreset === 'today' ? 'active' : ''}`}
                    onClick={() => setDatePreset(prev => prev === 'today' ? 'all' : 'today')}
                    title="Click to filter Today's transactions"
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box green">
                            <FaCheckCircle size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">Today's Collection</span>
                            <strong className="ha-kpi-value">{fmt(revenueStats.todayRevenue)}</strong>
                            <span className="ha-kpi-sub-count">{revenueStats.todayCount} {revenueStats.todayCount === 1 ? 'payment today' : 'payments today'}</span>
                        </div>
                    </div>
                </div>

                {/* Card 5: Cash & Online Mode Count (Dynamic per selected card/period) */}
                <div className={`ha-kpi-card ha-kpi-teal ${historyMode !== 'ALL' ? 'active' : ''}`}>
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box teal">
                            <FaCreditCard size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <div className="ha-kpi-label-row">
                                <span className="ha-kpi-label" title="Cash & Online">Cash &amp; Online</span>
                                <span className="ha-kpi-badge-period">{revenueStats.activePeriodLabel}</span>
                            </div>
                            <div className="ha-kpi-mode-lines">
                                <div
                                    className={`ha-mode-line cash clickable ${historyMode === 'Cash' ? 'active' : ''}`}
                                    onClick={() => setHistoryMode(prev => prev === 'Cash' ? 'ALL' : 'Cash')}
                                    title="Click to filter only Cash payments"
                                >
                                    <span className="ha-mode-badge cash">💵 Cash:</span>
                                    <strong className="ha-mode-count-val">{revenueStats.activeCashCount}</strong>
                                    <span className="ha-mode-sub">{revenueStats.activeCashCount === 1 ? 'payment' : 'payments'}</span>
                                </div>
                                <div
                                    className={`ha-mode-line online clickable ${historyMode === 'UPI' ? 'active' : ''}`}
                                    onClick={() => setHistoryMode(prev => prev === 'UPI' ? 'ALL' : 'UPI')}
                                    title="Click to filter only Online/UPI payments"
                                >
                                    <span className="ha-mode-badge online">📱 Online:</span>
                                    <strong className="ha-mode-count-val">{revenueStats.activeOnlineCount}</strong>
                                    <span className="ha-mode-sub">{revenueStats.activeOnlineCount === 1 ? 'payment' : 'payments'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Filter Toolbar (Desktop) */}
            <div className="ha-filter-toolbar ha-desktop-filter-toolbar">
                <div className="ha-search-box">
                    <span className="ha-search-icon-wrap">
                        <FaSearch className="ha-search-icon" />
                    </span>
                    <input
                        type="text"
                        className="ha-search-input"
                        placeholder="Search by patient name, MRN, or phone..."
                        value={historySearch}
                        onChange={e => handleHistorySearchChange(e.target.value)}
                    />
                    {historySearch && (
                        <button
                            type="button"
                            className="ha-search-clear"
                            onClick={() => {
                                setHistorySearch('');
                                fetchHospitalHistory('', historyMode, datePreset, customStartDate, customEndDate);
                            }}
                        >
                            &times;
                        </button>
                    )}
                </div>

                <div className="ha-filter-group">
                    {/* All Modes Dropdown */}
                    <div className="ha-drop-wrap">
                        <FaCreditCard className="ha-drop-icon" />
                        <select
                            value={historyMode}
                            onChange={e => handleHistoryModeChange(e.target.value)}
                            className="ha-drop-select"
                        >
                            <option value="ALL">All Modes</option>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI / Online</option>
                            <option value="Card">Card</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    </div>

                    {/* All Status Dropdown */}
                    <div className="ha-drop-wrap">
                        <FaCheckCircle className="ha-drop-icon" />
                        <select
                            value={historyStatus}
                            onChange={e => setHistoryStatus(e.target.value)}
                            className="ha-drop-select"
                        >
                            <option value="ALL">All Status</option>
                            <option value="PAID">Paid</option>
                            <option value="PARTIALLY_PAID">Partially Paid</option>
                            <option value="REFUNDED">Refunded</option>
                        </select>
                    </div>

                    {/* Sort Dropdown */}
                    <div className="ha-drop-wrap">
                        <FaSortAmountDown className="ha-drop-icon" />
                        <select
                            value={historySort}
                            onChange={e => setHistorySort(e.target.value)}
                            className="ha-drop-select"
                        >
                            <option value="desc">Newest First</option>
                            <option value="asc">Oldest First</option>
                            <option value="amount_desc">Amount (High → Low)</option>
                            <option value="amount_asc">Amount (Low → High)</option>
                        </select>
                    </div>

                    {/* Date Dropdown */}
                    <div className="ha-drop-wrap" style={{ position: 'relative' }}>
                        <FaCalendarAlt className="ha-drop-icon" />
                        <select
                            value={datePreset}
                            onChange={e => {
                                const val = e.target.value;
                                handlePresetChange(val);
                            }}
                            className="ha-drop-select"
                        >
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="custom">
                                {datePreset === 'custom' && (customStartDate || customEndDate)
                                    ? `Custom: ${customStartDate || 'Start'} to ${customEndDate || 'End'}`
                                    : 'Custom Range'}
                            </option>
                        </select>
                        {showCustomRangePicker && (
                            <div className="ha-custom-date-popover" style={{ top: 'calc(100% + 8px)', right: 0, zIndex: 1100 }}>
                                <div className="ha-cd-header">
                                    <span className="ha-cd-title">Select Date Range</span>
                                    <button
                                        type="button"
                                        className="ha-cd-close"
                                        onClick={() => setShowCustomRangePicker(false)}
                                        title="Close"
                                    >
                                        &times;
                                    </button>
                                </div>
                                <div className="ha-cd-row">
                                    <label>
                                        <span>From Date:</span>
                                        <input
                                            type="date"
                                            value={customStartDate}
                                            onChange={e => setCustomStartDate(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        <span>To Date:</span>
                                        <input
                                            type="date"
                                            value={customEndDate}
                                            onChange={e => setCustomEndDate(e.target.value)}
                                        />
                                    </label>
                                </div>
                                <div className="ha-cd-actions">
                                    <button
                                        type="button"
                                        className="ha-cd-clear"
                                        onClick={() => {
                                            setCustomStartDate('');
                                            setCustomEndDate('');
                                            setDatePreset('all');
                                            setShowCustomRangePicker(false);
                                            toast.info('Custom date range cleared');
                                        }}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        type="button"
                                        className="ha-cd-apply"
                                        onClick={() => {
                                            if (!customStartDate && !customEndDate) {
                                                toast.error('Please select From Date or To Date');
                                                return;
                                            }
                                            if (customStartDate && customEndDate && customStartDate > customEndDate) {
                                                const temp = customStartDate;
                                                setCustomStartDate(customEndDate);
                                                setCustomEndDate(temp);
                                            }
                                            setDatePreset('custom');
                                            setShowCustomRangePicker(false);
                                            toast.success('Custom range applied');
                                        }}
                                    >
                                        Apply Range
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reset Button */}
                    <button
                        type="button"
                        className="ha-btn-reset"
                        onClick={handleResetFilters}
                        title="Reset all filters"
                    >
                        <FaSyncAlt size={12} />
                        <span>Reset</span>
                    </button>
                </div>
            </div>

            {/* 4b. Mobile Filter Bar (Only shown on mobile screen) */}
            <div className="ha-mobile-filter-bar">
                <div className="ha-mobile-search-box">
                    <span className="ha-search-icon-wrap">
                        <FaSearch className="ha-search-icon" />
                    </span>
                    <input
                        type="text"
                        className="ha-search-input"
                        placeholder="Search patient, MRN, phone..."
                        value={historySearch}
                        onChange={e => handleHistorySearchChange(e.target.value)}
                    />
                    {historySearch && (
                        <button
                            type="button"
                            className="ha-search-clear"
                            onClick={() => {
                                setHistorySearch('');
                                fetchHospitalHistory('', historyMode, datePreset, customStartDate, customEndDate);
                            }}
                        >
                            &times;
                        </button>
                    )}
                </div>
                <div className="ha-mobile-filter-actions">
                    <button
                        type="button"
                        className={`ha-mobile-btn-filter ${activeFilterCount > 0 ? 'active' : ''}`}
                        onClick={() => setShowMobileFiltersModal(true)}
                        title="Open filters"
                    >
                        <FaFilter size={13} />
                        <span>Filter</span>
                        {activeFilterCount > 0 && (
                            <span className="ha-mobile-filter-badge">{activeFilterCount}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        className="ha-mobile-btn-reset"
                        onClick={handleResetFilters}
                        title="Reset all filters"
                    >
                        <FaSyncAlt size={12} />
                    </button>
                </div>
            </div>

            {/* Mobile Filter Popup / Bottom Sheet */}
            {showMobileFiltersModal && (
                <div className="modal-overlay ha-mfs-overlay" onClick={() => setShowMobileFiltersModal(false)}>
                    <div className="modal-content ha-mfs-sheet" onClick={e => e.stopPropagation()}>
                        <div className="ha-mfs-header">
                            <div className="ha-mfs-title">
                                <FaFilter size={16} color="#0284c7" />
                                <span>Filter Payments</span>
                            </div>
                            <button
                                type="button"
                                className="ha-mfs-close"
                                onClick={() => setShowMobileFiltersModal(false)}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="ha-mfs-body">
                            {/* Payment Mode */}
                            <div className="ha-mfs-group">
                                <label className="ha-mfs-label">Payment Mode</label>
                                <div className="ha-mfs-chips">
                                    {[
                                        { id: 'ALL', label: 'All Modes' },
                                        { id: 'Cash', label: '💵 Cash' },
                                        { id: 'UPI', label: '📱 UPI' },
                                        { id: 'Card', label: '💳 Card' }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={`ha-mfs-chip ${historyMode === m.id ? 'active' : ''}`}
                                            onClick={() => handleHistoryModeChange(m.id)}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status */}
                            <div className="ha-mfs-group">
                                <label className="ha-mfs-label">Status</label>
                                <div className="ha-mfs-chips">
                                    {[
                                        { id: 'ALL', label: 'All Status' },
                                        { id: 'Paid', label: '✓ Paid' },
                                        { id: 'Pending', label: '⏳ Pending' }
                                    ].map(st => (
                                        <button
                                            key={st.id}
                                            type="button"
                                            className={`ha-mfs-chip ${historyStatus === st.id ? 'active' : ''}`}
                                            onClick={() => setHistoryStatus(st.id)}
                                        >
                                            {st.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sort */}
                            <div className="ha-mfs-group">
                                <label className="ha-mfs-label">Sort By</label>
                                <div className="ha-mfs-chips">
                                    {[
                                        { id: 'newest', label: 'Newest First' },
                                        { id: 'oldest', label: 'Oldest First' },
                                        { id: 'amt_high', label: 'Amount: High to Low' },
                                        { id: 'amt_low', label: 'Amount: Low to High' }
                                    ].map(s => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            className={`ha-mfs-chip ${historySort === s.id ? 'active' : ''}`}
                                            onClick={() => setHistorySort(s.id)}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Date Presets */}
                            <div className="ha-mfs-group">
                                <label className="ha-mfs-label">Date Range</label>
                                <div className="ha-mfs-chips">
                                    {[
                                        { id: 'all', label: 'All Dates' },
                                        { id: 'today', label: 'Today' },
                                        { id: 'yesterday', label: 'Yesterday' },
                                        { id: 'this_week', label: 'This Week' },
                                        { id: 'this_month', label: 'This Month' },
                                        { id: 'custom', label: 'Custom Range' }
                                    ].map(d => (
                                        <button
                                            key={d.id}
                                            type="button"
                                            className={`ha-mfs-chip ${datePreset === d.id ? 'active' : ''}`}
                                            onClick={() => handlePresetChange(d.id)}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>

                                {datePreset === 'custom' && (
                                    <div className="ha-mfs-custom-range">
                                        <div className="ha-mfs-input-col">
                                            <span className="ha-mfs-sublabel">From Date</span>
                                            <input
                                                type="date"
                                                className="ha-mfs-date-input"
                                                value={customStartDate}
                                                onChange={e => setCustomStartDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="ha-mfs-input-col">
                                            <span className="ha-mfs-sublabel">To Date</span>
                                            <input
                                                type="date"
                                                className="ha-mfs-date-input"
                                                value={customEndDate}
                                                onChange={e => setCustomEndDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="ha-mfs-footer">
                            <button
                                type="button"
                                className="ha-mfs-btn-reset"
                                onClick={() => {
                                    handleResetFilters();
                                    setShowMobileFiltersModal(false);
                                }}
                            >
                                Reset All
                            </button>
                            <button
                                type="button"
                                className="ha-mfs-btn-apply"
                                onClick={() => setShowMobileFiltersModal(false)}
                            >
                                Apply ({displayedTransactions.length} Records)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. Sub-Header: Export CSV */}
            <div className="ha-sub-header">
                <button
                    type="button"
                    className="ha-btn-export"
                    onClick={handleExportCSV}
                    title="Export filtered records as Excel/CSV"
                >
                    <FaDownload size={12} />
                    <span>Export CSV</span>
                </button>
            </div>

            {/* 6. Full-Width Payments Table */}
            <div className="ha-table-card">
                {historyLoading ? (
                    <div className="ha-table-loading">
                        <FaSyncAlt className="spin" style={{ marginRight: '8px' }} /> Fetching payment register...
                    </div>
                ) : displayedTransactions.length === 0 ? (
                    <div className="ha-table-empty">
                        No payment transactions found matching your filters.
                    </div>
                ) : (
                    <>
                        <div className="ha-table-responsive">
                            <table className="ha-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                                        <th>PATIENT</th>
                                        <th>SERVICE / DESCRIPTION</th>
                                        <th style={{ textAlign: 'center' }}>MODE</th>
                                        <th style={{ textAlign: 'center' }}>STATUS</th>
                                        <th>DATE &amp; TIME</th>
                                        <th style={{ textAlign: 'center' }}>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentTransactions.map((t, idx) => {
                                        const pat = t.patientId || {};
                                        const isUpi = (t.paymentMode || '').toUpperCase().includes('UPI');
                                        const { dateStr, timeStr } = getBookingDateTime(t);
                                        const avatarStyle = getAvatarStyle(pat.name || 'P');
                                        const rowNum = startIndex + idx + 1;

                                        // Parse service and doctor cleanly
                                        const { serviceTitle, doctorSubtitle } = parseServiceAndDoctor(t);

                                        return (
                                            <tr key={t._id}>
                                                <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                                                    {rowNum}
                                                </td>
                                                <td>
                                                    <div className="ha-pat-cell">
                                                        <div className="ha-pat-avatar" style={{ background: avatarStyle.bg, color: avatarStyle.color }}>
                                                            {(pat.name || 'P').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="ha-pat-info">
                                                            <strong className="ha-pat-name">{formatPatientName(pat.name || 'Walk-in Patient')}</strong>
                                                            <span className="ha-pat-mrn">{pat.mrn || pat.patientId || 'PCF-M365-001'}</span>
                                                            {pat.phone && (
                                                                <span className="ha-pat-phone">
                                                                    <span className="ha-phone-icon">📞</span>
                                                                    <span>{pat.phone}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="ha-service-title">{serviceTitle}</div>
                                                    <div className="ha-doctor-sub">{doctorSubtitle}</div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`ha-mode-pill ${isUpi ? 'mode-upi' : 'mode-cash'}`}>
                                                        {isUpi ? '📱 UPI' : '💵 CASH'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className="ha-status-paid">
                                                        ✓ Paid
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="ha-date-stack">
                                                        <span className="ha-date-text">{dateStr}</span>
                                                        <span className="ha-time-text">{timeStr}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div className="ha-action-cell">
                                                        <button
                                                            type="button"
                                                            className="ha-btn-view-pill"
                                                            onClick={() => openPatientBilling(t)}
                                                            title="View patient billing & past records"
                                                        >
                                                            <FaEye size={12} />
                                                            <span>View</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Table Footer with Pagination */}
                        <div className="ha-table-footer">
                            <span className="ha-pagination-info">
                                Showing {startIndex + 1} - {Math.min(startIndex + itemsPerPage, displayedTransactions.length)} of {displayedTransactions.length} payments
                            </span>
                            <div className="ha-pagination-btns">
                                <button
                                    type="button"
                                    className="ha-page-nav"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                >
                                    <FaChevronLeft size={10} />
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                                    <button
                                        key={pageNum}
                                        type="button"
                                        className={`ha-page-number ${currentPage === pageNum ? 'active' : ''}`}
                                        onClick={() => setCurrentPage(pageNum)}
                                    >
                                        {pageNum}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className="ha-page-nav"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                >
                                    <FaChevronRight size={10} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

        </div>
    )}

    {/* ====== PATIENT BILL BREAKDOWN MODAL ====== */}
    {inspectPatientModal.open && (
        <div className="modal-overlay" onClick={() => setInspectPatientModal({ open: false, loading: false, patient: null, billing: null })}>
            <div className="modal-content patient-breakdown-modal" onClick={e => e.stopPropagation()}>
                <div className="proof-modal-header">
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🧾</span> Patient Billing Statement & Breakdown
                        </h3>
                        {inspectPatientModal.patient && (
                            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.88rem', color: '#475569' }}>
                                <span><strong>Patient:</strong> {formatPatientName(inspectPatientModal.patient.name)}</span>
                                <span><strong>Phone:</strong> {inspectPatientModal.patient.phone || '—'}</span>
                                <span><strong>MRN:</strong> {inspectPatientModal.patient.mrn || inspectPatientModal.patient.patientId || '—'}</span>
                            </div>
                        )}
                    </div>
                    <button className="proof-modal-close" onClick={() => setInspectPatientModal({ open: false, loading: false, patient: null, billing: null })}>&times;</button>
                </div>

                <div className="patient-breakdown-body">
                    {inspectPatientModal.loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <FaSyncAlt className="spin" style={{ marginRight: '8px' }} /> Loading patient billing statement...
                        </div>
                    ) : inspectPatientModal.billing ? (
                        <>
                            {/* Summary Totals */}
                            <div className="breakdown-summary-row">
                                <div className="bs-card total">
                                    <span>Grand Total</span>
                                    <strong>{fmt(inspectGrandTotal(inspectPatientModal.billing))}</strong>
                                </div>
                                <div className="bs-card paid">
                                    <span>Total Paid</span>
                                    <strong>{fmt(inspectPaidTotal(inspectPatientModal.billing))}</strong>
                                </div>
                                <div className="bs-card balance">
                                    <span>Outstanding Balance</span>
                                    <strong>{fmt(Math.max(0, inspectGrandTotal(inspectPatientModal.billing) - inspectPaidTotal(inspectPatientModal.billing)))}</strong>
                                </div>
                            </div>

                            {/* Consultations */}
                            {inspectPatientModal.billing.appointments?.length > 0 && (
                                <div className="breakdown-module">
                                    <h4>Consultations / Appointments ({inspectPatientModal.billing.appointments.length})</h4>
                                    <table className="breakdown-mini-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Doctor</th>
                                                <th>Payment Info</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspectPatientModal.billing.appointments.map(a => (
                                                <tr key={a._id}>
                                                    <td>{fmtDate(a.appointmentDate || a.createdAt)}</td>
                                                    <td>Dr. {a.doctorName || 'Doctor'}</td>
                                                    <td>{a.paymentMethod || 'UPI'}{a.cardRef ? ` (UTR: ${a.cardRef})` : ''}</td>
                                                    <td><span className={a.paymentStatus === 'Paid' ? 'paid-pill' : 'pending-pill'}>{a.paymentStatus}</span></td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Lab Reports */}
                            {inspectPatientModal.billing.labReports?.length > 0 && (
                                <div className="breakdown-module">
                                    <h4>Lab Investigations ({inspectPatientModal.billing.labReports.length})</h4>
                                    <table className="breakdown-mini-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Test Names</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspectPatientModal.billing.labReports.map(l => (
                                                <tr key={l._id}>
                                                    <td>{fmtDate(l.createdAt)}</td>
                                                    <td>{Array.isArray(l.testNames) ? l.testNames.join(', ') : (l.testName || '—')}</td>
                                                    <td><span className={l.paymentStatus === 'Paid' ? 'paid-pill' : 'pending-pill'}>{l.paymentStatus}</span></td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(l.amount || l.price)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Pharmacy Orders */}
                            {inspectPatientModal.billing.pharmacyOrders?.length > 0 && (
                                <div className="breakdown-module">
                                    <h4>Pharmacy & Medicines ({inspectPatientModal.billing.pharmacyOrders.length})</h4>
                                    <table className="breakdown-mini-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Medicines</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspectPatientModal.billing.pharmacyOrders.map(p => (
                                                <tr key={p._id}>
                                                    <td>{fmtDate(p.createdAt)}</td>
                                                    <td>{p.items?.length || 0} Medicines</td>
                                                    <td><span className={p.paymentStatus === 'Paid' ? 'paid-pill' : 'pending-pill'}>{p.paymentStatus}</span></td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(getPharmacyTotal(p))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Admissions */}
                            {inspectPatientModal.billing.admissions?.length > 0 && (
                                <div className="breakdown-module">
                                    <h4>Hospitalizations & Admissions ({inspectPatientModal.billing.admissions.length})</h4>
                                    <table className="breakdown-mini-table">
                                        <thead>
                                            <tr>
                                                <th>Admitted</th>
                                                <th>Discharged</th>
                                                <th>Ward/Bed</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspectPatientModal.billing.admissions.map(adm => (
                                                <tr key={adm._id}>
                                                    <td>{fmtDate(adm.admissionDate || adm.createdAt)}</td>
                                                    <td>{adm.dischargeDate ? fmtDate(adm.dischargeDate) : 'Currently Admitted'}</td>
                                                    <td>{adm.ward || 'General'} ({adm.bedNumber || '—'})</td>
                                                    <td><span className={adm.paymentStatus === 'Paid' ? 'paid-pill' : 'pending-pill'}>{adm.paymentStatus}</span></td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(adm.totalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No bill records found for this patient.</div>
                    )}
                </div>

                <div className="proof-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        type="button"
                        className="btn-proof-open"
                        onClick={() => downloadPatientStatement(inspectPatientModal.patient, inspectPatientModal.billing)}
                        title="Download and print complete patient statement"
                    >
                        <FaDownload size={12} /> Download / Print Statement
                    </button>
                    <button
                        type="button"
                        className="btn-proof-close-action"
                        onClick={() => setInspectPatientModal({ open: false, loading: false, patient: null, billing: null })}
                    >
                        Close Breakdown
                    </button>
                </div>
            </div>
        </div>
    )}

    {/* View Proof Modal */}
    {viewProofModal.open && (
        <div className="modal-overlay" onClick={() => setViewProofUrl('')}>
            <div className="modal-content proof-view-modal" onClick={e => e.stopPropagation()}>
                <div className="proof-modal-header">
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>📷</span> Payment Proof / UPI Screenshot
                        </h3>
                        {viewProofModal.meta && (
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.85rem', color: '#475569' }}>
                                {viewProofModal.meta.patientName && <span><strong>Patient:</strong> {viewProofModal.meta.patientName}</span>}
                                {viewProofModal.meta.amount && <span><strong>Amount:</strong> {fmt(viewProofModal.meta.amount)}</span>}
                                {viewProofModal.meta.mode && <span className="mode-badge" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>{viewProofModal.meta.mode}</span>}
                                {viewProofModal.meta.txnId && <span><strong>UTR:</strong> <code>{viewProofModal.meta.txnId}</code></span>}
                            </div>
                        )}
                    </div>
                    <button className="proof-modal-close" onClick={() => setViewProofUrl('')}>&times;</button>
                </div>

                <div className="proof-modal-body">
                    {viewProofModal.url.endsWith('.pdf') ? (
                        <iframe src={viewProofModal.url} title="Payment Proof" width="100%" height="520px" style={{ border: 'none', borderRadius: '8px' }} />
                    ) : (
                        <div style={{ textAlign: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                            <img src={viewProofModal.url} alt="Payment Proof" className="full-proof-image" onError={(e) => { e.target.alt = 'Could not load image. Click Open Link to view directly.'; }} />
                        </div>
                    )}
                </div>

                <div className="proof-modal-footer">
                    <button
                        type="button"
                        className="btn-proof-open"
                        onClick={() => window.open(viewProofModal.url, '_blank')}
                    >
                        <FaExternalLinkAlt size={12} /> Open Full Size / Download
                    </button>
                    <button
                        type="button"
                        className="btn-proof-close-action"
                        onClick={() => setViewProofUrl('')}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )}
    {/* Create Patient Refund Modal */}
    {showPatientRefundModal && (
        <div className="modal-overlay" onClick={() => setShowPatientRefundModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', padding: '24px', borderRadius: '14px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaRupeeSign color="#dc2626" /> Create Refund Request
                    </h3>
                    <button onClick={() => setShowPatientRefundModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                </div>

                <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{patient?.name}</div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>MRN: {patient?.mrn || patient?.patientId || '—'} | Phone: {patient?.phone || '—'}</div>
                </div>

                {loadingRefundData ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                        Calculating refundable balance...
                    </div>
                ) : (
                    <>
                        {patientRefundData && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#166534', marginBottom: '4px' }}>
                                    <span>Total Collected From Patient:</span>
                                    <strong>{fmt(patientRefundData.totalPaid)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#166534', marginBottom: '4px' }}>
                                    <span>Already Refunded:</span>
                                    <span>{fmt(patientRefundData.alreadyRefunded)}</span>
                                </div>
                                {patientRefundData.pendingRefundAmount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#d97706', marginBottom: '4px' }}>
                                        <span>Pending Approval:</span>
                                        <span>{fmt(patientRefundData.pendingRefundAmount)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800, color: '#15803d', borderTop: '1px dashed #86efac', paddingTop: '6px', marginTop: '4px' }}>
                                    <span>Max Available Refundable:</span>
                                    <span>{fmt(patientRefundData.refundableAmount)}</span>
                                </div>
                            </div>
                        )}

                        {patientRefundData?.refundableAmount <= 0 ? (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '16px' }}>
                                No refundable balance available for this patient. All payments have either been refunded or are currently pending approval.
                            </div>
                        ) : (
                            <>
                                {/* Quick payment selector if transactions exist */}
                                {patientRefundData?.payments?.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                                            Select Payment to Refund (Optional):
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                                            {patientRefundData.payments.slice(0, 4).map(p => {
                                                const isSel = newRefundForm.originalPaymentId === p._id;
                                                const mode = (p.paymentMode || 'Cash').toUpperCase();
                                                const targetMode = mode.includes('UPI') ? 'UPI' : (mode.includes('BANK') || mode.includes('CARD') || mode.includes('ONLINE')) ? 'BANK_TRANSFER' : 'CASH';
                                                return (
                                                    <div
                                                        key={p._id}
                                                        onClick={() => {
                                                            setNewRefundForm(f => ({
                                                                ...f,
                                                                originalPaymentId: isSel ? '' : p._id,
                                                                refundAmount: isSel ? '' : String(Math.min(p.amount, patientRefundData.refundableAmount)),
                                                                refundMode: isSel ? f.refundMode : targetMode
                                                            }));
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '6px 10px',
                                                            borderRadius: '6px',
                                                            border: isSel ? '2px solid #059669' : '1px solid #e2e8f0',
                                                            background: isSel ? '#ecfdf5' : '#f8fafc',
                                                            cursor: 'pointer',
                                                            fontSize: '0.82rem'
                                                        }}
                                                    >
                                                        <div>
                                                            <strong>{fmt(p.amount)}</strong>
                                                            <span style={{ marginLeft: '8px', background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem' }}>{p.paymentMode || 'Cash'}</span>
                                                            {p.transactionId && <span style={{ marginLeft: '6px', color: '#64748b', fontSize: '0.72rem' }}>#{p.transactionId}</span>}
                                                        </div>
                                                        <span style={{ color: isSel ? '#059669' : '#64748b', fontWeight: isSel ? 700 : 500 }}>
                                                            {isSel ? '✓ Selected' : 'Use'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Refund Amount (₹) *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={patientRefundData?.refundableAmount}
                                        value={newRefundForm.refundAmount}
                                        onChange={e => setNewRefundForm(f => ({ ...f, refundAmount: e.target.value }))}
                                        placeholder={`Max ${fmt(patientRefundData?.refundableAmount || 0)}`}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Refund Mode *
                                    </label>
                                    <select
                                        value={newRefundForm.refundMode}
                                        onChange={e => setNewRefundForm(f => ({ ...f, refundMode: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                    >
                                        <option value="CASH">Cash (Handed over at Reception counter)</option>
                                        <option value="UPI">UPI (Processed by Accounts via UTR)</option>
                                        <option value="BANK_TRANSFER">Bank Transfer (Processed by Accounts)</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Reason for Refund
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={newRefundForm.reason}
                                        onChange={e => setNewRefundForm(f => ({ ...f, reason: e.target.value }))}
                                        placeholder="Reason for refund (e.g. consultation cancelled, billing adjustment)..."
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'vertical' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowPatientRefundModal(false)}
                                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreatePatientRefund}
                                        disabled={submittingRefund}
                                        style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                        {submittingRefund ? 'Submitting...' : 'Submit Refund Request'}
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )}
        </div>
    );
};

export default PatientBillingProfile;
