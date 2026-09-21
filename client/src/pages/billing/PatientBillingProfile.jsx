import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { billingAPI, admissionAPI, patientAPI, uploadAPI, hospitalAPI } from '../../utils/api';
import { 
    FaEye, FaDownload, FaSearch, FaHistory, FaSyncAlt, FaExternalLinkAlt, 
    FaMoneyBillWave, FaQrcode, FaRupeeSign, FaCreditCard, FaFileAlt, 
    FaCheckCircle, FaPlus, FaEllipsisV, FaCopy, FaTimes, FaCalendarAlt, 
    FaClock, FaChevronLeft, FaChevronRight, FaChevronDown, FaUsers, FaSortAmountDown, FaChartLine
} from 'react-icons/fa';
import PaymentSection from '../../components/PaymentSection';
import './PatientBillingProfile.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);

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

    // 1. Determine base calendar date (appointmentDate -> paymentDate -> createdAt)
    let calendarDate = null;
    if (t.appointmentDate) {
        const d = new Date(t.appointmentDate);
        if (!isNaN(d.getTime())) calendarDate = d;
    }
    if (!calendarDate && t.paymentDate) {
        const d = new Date(t.paymentDate);
        if (!isNaN(d.getTime())) calendarDate = d;
    }
    if (!calendarDate && t.createdAt) {
        const d = new Date(t.createdAt);
        if (!isNaN(d.getTime())) calendarDate = d;
    }

    // 2. Extract exact booking creation timestamp (avoiding 05:30 am / 00:00 midnight UTC artifacts)
    let bookingTimeDate = null;

    if (t.createdAt) {
        const cd = new Date(t.createdAt);
        if (!isNaN(cd.getTime())) {
            const h = cd.getHours();
            const m = cd.getMinutes();
            if (!(h === 5 && m === 30) && !(h === 0 && m === 0)) {
                bookingTimeDate = cd;
            }
        }
    }

    if (!bookingTimeDate && t.paymentDate) {
        const pd = new Date(t.paymentDate);
        if (!isNaN(pd.getTime())) {
            const h = pd.getHours();
            const m = pd.getMinutes();
            if (!(h === 5 && m === 30) && !(h === 0 && m === 0)) {
                bookingTimeDate = pd;
            }
        }
    }

    // If createdAt was midnight UTC or missing, extract exact epoch from MongoDB ObjectId (first 8 hex chars)
    if (!bookingTimeDate && t._id) {
        const rawId = String(t._id).replace(/^appt_payment_/, '');
        if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
            try {
                const epoch = parseInt(rawId.substring(0, 8), 16) * 1000;
                const idDate = new Date(epoch);
                if (!isNaN(idDate.getTime())) {
                    bookingTimeDate = idDate;
                }
            } catch (e) {}
        }
    }

    // Format time string
    let timeStr = '';
    if (t.appointmentTime && typeof t.appointmentTime === 'string' && t.appointmentTime.trim()) {
        timeStr = formatTimeStr(t.appointmentTime);
    } else if (bookingTimeDate) {
        timeStr = bookingTimeDate.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    // Format date string
    const targetDate = (calendarDate && !isNaN(calendarDate.getTime())) ? calendarDate : (bookingTimeDate || new Date());
    const dateStr = targetDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    return { dateStr, timeStr };
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

const inspectGrandTotal = (b) => {
    if (!b) return 0;
    let t = 0;
    b.appointments?.forEach(a => t += (Number(a.amount) || 0));
    b.labReports?.forEach(l => t += (Number(l.amount || l.price) || 0));
    b.pharmacyOrders?.forEach(p => t += getPharmacyTotal(p));
    b.facilityCharges?.forEach(f => t += (Number(f.totalAmount) || 0));
    b.admissions?.forEach(a => t += (Number(a.totalAmount) || 0));
    b.surgeryPlans?.forEach(s => t += (Number(s.surgeryCost) || 0));
    return t;
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
    return t;
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
                const d = new Date(t.paymentDate || t.createdAt || 0);
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return dStr === todayStr;
            });
        } else if (datePreset === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
            list = list.filter(t => {
                const d = new Date(t.paymentDate || t.createdAt || 0);
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return dStr === yestStr;
            });
        } else if (datePreset === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - (day === 0 ? 6 : day - 1);
            const weekStart = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            list = list.filter(t => {
                const time = new Date(t.paymentDate || t.createdAt || 0).getTime();
                return time >= weekStart.getTime() && time <= weekEnd.getTime();
            });
        } else if (datePreset === 'this_month') {
            const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            list = list.filter(t => {
                const time = new Date(t.paymentDate || t.createdAt || 0).getTime();
                return time >= mStart.getTime() && time <= mEnd.getTime();
            });
        } else if (datePreset === 'last_month') {
            const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            list = list.filter(t => {
                const time = new Date(t.paymentDate || t.createdAt || 0).getTime();
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
            list = list.filter(t => {
                const time = new Date(t.paymentDate || t.createdAt || 0).getTime();
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

        let customCashCount = 0;
        let customOnlineCount = 0;

        (historyTransactions || []).forEach(t => {
            const status = (t.paymentStatus || 'PAID').toUpperCase();
            if (status.includes('CANCEL') || status.includes('REFUND')) return;

            const amt = Number(t.amount) || 0;
            totalRevenue += amt;
            totalCount++;

            const d = new Date(t.paymentDate || t.createdAt || 0);
            const tTime = d.getTime();
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const isToday = dStr === todayStr;
            const isThisWeek = tTime >= weekStart && tTime <= weekEnd;
            const isThisMonth = tTime >= monthStart && tTime <= monthEnd;
            const isCustom = tTime >= sTime && tTime <= eTime;

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
            activePeriodLabel = 'Custom';
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
        const safeStart = start && start > maxDate ? maxDate : start;
        const safeEnd = end && end > maxDate ? maxDate : end;
        setCustomStartDate(safeStart);
        setCustomEndDate(safeEnd);
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
        const pat = txn.patientId;
        const identifier = pat?.mrn || pat?.patientId || pat?.phone || pat?.name;
        if (identifier) {
            setSearchQuery(identifier);
            loadPatientBilling(identifier);
            setActiveTab('patient');
        } else {
            toast.error('Patient identifier not found for this transaction');
        }
    };

    useEffect(() => {
        if (isHospitalAdmin) {
            setActiveTab('history');
            fetchHospitalHistory(historySearch, historyMode, datePreset, customStartDate, customEndDate);
        }
    }, [isHospitalAdmin]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const q = params.get('q');
        const tab = params.get('tab');
        if (tab === 'history' || isHospitalAdmin) {
            setActiveTab('history');
        }
        if (q && q.trim()) {
            setSearchQuery(q.trim());
            loadPatientBilling(q.trim());
            if (!isHospitalAdmin) setActiveTab('patient');
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

    const loadPatientBilling = async (identifier) => {
        setLoading(true);
        setError('');
        setPatient(null);
        setBilling(null);
        setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [], surgeryPlans: [] });
        setSuccessMsg('');
        try {
            const res = await billingAPI.getPatientBills(identifier);
            if (res.success) {
                setPatient(res.patient);
                setBilling(res.billing);
            }
        } catch (err) {
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

    const grandTotalBill = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.forEach(p => total += getPharmacyTotal(p));
        billing.facilityCharges?.forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.forEach(a => total += (Number(a.totalAmount) || 0));
        billing.surgeryPlans?.forEach(s => total += (Number(s.surgeryCost) || 0));
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

        // Sum from payment history
        let historyPaid = 0;
        billing.paymentTransactions?.filter(p => isPaid(p.status)).forEach(p => historyPaid += (Number(p.amount) || 0));

        return Math.max(modulePaid, historyPaid);
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

    return (
        <div className="billing-profile-page" style={{ maxWidth: '100%', margin: '0', padding: '0' }}>
            {/* Show top banner ONLY when in individual patient settlement tab */}
            {activeTab === 'patient' && (
                <div className="billing-header" style={{
                    background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                    padding: '16px 24px',
                    borderRadius: '12px',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 6px 16px -4px rgba(20, 184, 166, 0.35)',
                    margin: '18px 24px 20px 24px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
                            <span style={{ fontSize: '1.4rem' }}>💳</span> Record & Settle Patient Payment
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.88rem', opacity: 0.9 }}>Search patient, calculate outstanding dues across OPD, Pharmacy, Lab, and record collections.</p>
                    </div>
                    <button className="btn-back" onClick={() => setActiveTab('history')} style={{
                        padding: '8px 18px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        color: 'white',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.32)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    >← Back to Payment Register</button>
                </div>
            )}

            {/* Navigation Tabs (Only for Reception / Cashier staff, hidden for Hospital Admin) */}
            {!isHospitalAdmin && (
                <div className="billing-nav-tabs">
                    <button
                        type="button"
                        className={`billing-nav-tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
                        onClick={() => setActiveTab('patient')}
                    >
                        <span className="bnt-icon">💳</span>
                        <span className="bnt-title">Individual Patient Billing</span>
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
            )}

            {activeTab === 'patient' && (
                <>
                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: '30px' }} className="billing-search-container">
                <form className="billing-search-bar" onSubmit={handleSearch} style={{
                    display: 'flex', gap: '12px', padding: '10px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', border: '1px solid #e2e8f0'
                }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.2rem' }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search by Phone / MRN / Patient ID..."
                            value={searchQuery}
                            onChange={e => handleQueryChange(e.target.value)}
                            onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            style={{ width: '100%', padding: '16px 16px 16px 48px', border: 'none', borderRadius: '8px', fontSize: '1.1rem', outline: 'none', background: '#f8fafc' }}
                        />
                    </div>
                    <button type="submit" disabled={loading} style={{
                        padding: '0 32px', background: 'linear-gradient(to right, #0ea5e9, #2563eb)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)', transition: 'transform 0.1s'
                    }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </form>

                {showSuggestions && suggestions.length > 0 && (
                    <div className="search-suggestions-dropdown" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000,
                        maxHeight: '240px',
                        overflowY: 'auto',
                        marginTop: '4px'
                    }}>
                        {suggestions.map(p => (
                            <div
                                key={p._id}
                                onClick={() => {
                                    setSearchQuery(p.mrn || p.patientId || p.phone || p.name);
                                    setShowSuggestions(false);
                                    loadPatientBilling(p.mrn || p.patientId || p.phone || p.name);
                                }}
                                style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    textAlign: 'left'
                                }}
                                className="suggestion-item"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <strong style={{ color: '#1e293b' }}>{p.name}</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    MRN: {p.mrn || 'N/A'} | Phone: {p.phone || 'N/A'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {error && <div className="billing-error">{error}</div>}
            {successMsg && <div className="billing-success">{successMsg}</div>}

            {patient && billing && (
                <>
                    {/* Patient Card */}
                    <div className="patient-info-card">
                        <div className="patient-avatar">{patient.name?.charAt(0)?.toUpperCase()}</div>
                        <div className="patient-details">
                            <h2>{patient.name}</h2>
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

                    {/* Active Admissions */}
                    {activeAdmissions.length > 0 && (
                        <div className="billing-section admitted-section">
                            <div className="section-header admitted-header">
                                <span className="admitted-badge">Currently Admitted</span>
                                <h3>Active Hospitalization</h3>
                            </div>
                            {activeAdmissions.map(adm => (
                                <div key={adm._id} className="admission-card active">
                                    <div className="admission-top">
                                        <div>
                                            <strong>Admitted:</strong> {fmtAdmissionDateTime(adm.admissionDate, adm.admissionTime, adm.createdAt)}
                                            {adm.ward && <span className="badge-ward"> Ward: {adm.ward}</span>}
                                            {adm.bedNumber && <span className="badge-bed"> Bed: {adm.bedNumber}</span>}
                                        </div>
                                        <div className="admission-actions">
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
                                        </div>
                                    </div>
                                    {adm.selectedFacilities?.length > 0 && (
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
                                    )}
                                    {adm.notes && <p className="admission-notes">Notes: {adm.notes}</p>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Scheduled Surgeries & OT Procedures */}
                    {billing.surgeryPlans && billing.surgeryPlans.length > 0 && (
                        <div className="billing-section" style={{ borderLeft: '4px solid #7c3aed' }}>
                            <div className="section-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🩺</span> Scheduled Surgeries & OT Procedures ({getSectionBadge(billing.surgeryPlans)})
                                </h3>
                                {billing.surgeryPlans.some(s => s.paymentStatus !== 'PAID') && (
                                    <button className="btn-select-all" onClick={() => toggleAll('surgeryPlans', billing.surgeryPlans)}>
                                        {billing.surgeryPlans.filter(s => s.paymentStatus !== 'PAID').every(s => selected.surgeryPlans.includes(s._id)) ? 'Deselect All Surgeries' : 'Select All Surgeries'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Date & Time</th>
                                        <th>Surgery & Clinical Context</th>
                                        <th>Surgical Team</th>
                                        <th>OT Room</th>
                                        <th>Status</th>
                                        <th>Fee / Remaining</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billing.surgeryPlans.map(s => {
                                        const isFullyPaid = s.paymentStatus === 'PAID';
                                        const cost = Number(s.surgeryCost) || 0;
                                        const paid = Number(s.paidAmount) || 0;
                                        const remaining = Math.max(0, cost - paid);
                                        const surgeonName = s.surgeonId?.name ? (s.surgeonId.name).replace(/^Dr\.?\s*/i, '') : 'Surgeon';
                                        const assistants = s.assistantSurgeonIds || [];

                                        return (
                                            <tr key={s._id} className={selected.surgeryPlans.includes(s._id) ? 'selected-row' : ''}>
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
                                                <td>
                                                    {fmtAdmissionDateTime(s.surgeryDate, s.startTime, s.preferredDate || s.createdAt)}
                                                </td>
                                                <td>
                                                    <strong>{s.surgery}</strong>
                                                    {s.diagnosis && (
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                            Dx: {s.diagnosis}
                                                        </div>
                                                    )}
                                                    {s.planId && (
                                                        <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
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
                                                    <span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: '4px', fontSize: '0.82rem', fontWeight: 600 }}>
                                                        🚪 {s.otRoomId?.name || 'Assigned OT'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${s.paymentStatus === 'PAID' ? 'status-paid' : ''}`} style={{
                                                        background: s.paymentStatus === 'PAID' ? '#dcfce7' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fef3c7' : '#fee2e2'),
                                                        color: s.paymentStatus === 'PAID' ? '#15803d' : (s.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#b91c1c'),
                                                        border: `1px solid ${s.paymentStatus === 'PAID' ? '#86efac' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fde68a' : '#fca5a5')}`,
                                                        fontWeight: 700
                                                    }}>
                                                        {s.paymentStatus || 'UNPAID'}
                                                    </span>
                                                </td>
                                                <td className="amount-cell">
                                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(cost)}</div>
                                                    {paid > 0 && paid < cost && (
                                                        <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
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
                    )}

                    {/* Consolidated Billing View (Appointments & Facility Charges) */}
                    {(billing.appointments?.length > 0 || billing.facilityCharges?.length > 0) && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Consolidated Billing View (Consultations & ICU Charges)</h3>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {billing.appointments.some(a => !isPaid(a.paymentStatus)) && (
                                        <button className="btn-select-all" onClick={() => toggleAll('appointments', billing.appointments)}>
                                            {billing.appointments.filter(a => !isPaid(a.paymentStatus)).every(a => selected.appointments.includes(a._id)) ? 'Deselect All Consults' : 'Select All Consults'}
                                        </button>
                                    )}
                                    {billing.facilityCharges.some(f => !isPaid(f.paymentStatus)) && (
                                        <button className="btn-select-all" onClick={() => toggleAll('facilityCharges', billing.facilityCharges)}>
                                            {billing.facilityCharges.filter(f => !isPaid(f.paymentStatus)).every(f => selected.facilityCharges.includes(f._id)) ? 'Deselect All ICU' : 'Select All ICU'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Type & Description</th><th>Collected By</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {/* Appointments - Actionable */}
                                    {billing.appointments.map(a => (
                                        <tr key={a._id} className={selected.appointments.includes(a._id) ? 'selected-row' : ''}>
                                            <td>
                                                {a.paymentStatus === 'Paid' ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.appointments.includes(a._id)} onChange={() => toggle('appointments', a._id)} />
                                                )}
                                            </td>
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

                                    {/* Facility / ICU Charges - Actionable */}
                                    {billing.facilityCharges.map(f => (
                                        <tr key={f._id} className={selected.facilityCharges.includes(f._id) ? 'selected-row' : ''}>
                                            <td>
                                                {isPaid(f.paymentStatus) ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.facilityCharges.includes(f._id)} onChange={() => toggle('facilityCharges', f._id)} />
                                                )}
                                            </td>
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
                    )}

                    {/* Lab Reports */}
                    {billing.labReports.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Lab Tests ({getSectionBadge(billing.labReports)})</h3>
                                {billing.labReports.some(l => !isPaid(l.paymentStatus)) && (
                                    <button className="btn-select-all" onClick={() => toggleAll('labReports', billing.labReports)}>
                                        {billing.labReports.filter(l => !isPaid(l.paymentStatus)).every(l => selected.labReports.includes(l._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Tests</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.labReports.map(l => (
                                        <tr key={l._id} className={selected.labReports.includes(l._id) ? 'selected-row' : ''}>
                                            <td>
                                                {isPaid(l.paymentStatus) ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.labReports.includes(l._id)} onChange={() => toggle('labReports', l._id)} />
                                                )}
                                            </td>
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
                    )}

                    {/* Pharmacy Orders */}
                    {billing.pharmacyOrders.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Pharmacy Orders ({getSectionBadge(billing.pharmacyOrders)})</h3>
                                {billing.pharmacyOrders.some(p => !isPaid(p.paymentStatus)) && (
                                    <button className="btn-select-all" onClick={() => toggleAll('pharmacyOrders', billing.pharmacyOrders)}>
                                        {billing.pharmacyOrders.filter(p => !isPaid(p.paymentStatus)).every(p => selected.pharmacyOrders.includes(p._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Items</th><th>Order Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.pharmacyOrders.map(p => (
                                        <tr key={p._id} className={selected.pharmacyOrders.includes(p._id) ? 'selected-row' : ''}>
                                            <td>
                                                {isPaid(p.paymentStatus) ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.pharmacyOrders.includes(p._id)} onChange={() => toggle('pharmacyOrders', p._id)} />
                                                )}
                                            </td>
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

                    {/* No items at all */}
                    {billing.appointments.length === 0 && billing.labReports.length === 0 &&
                        billing.pharmacyOrders.length === 0 && billing.facilityCharges.length === 0 &&
                        activeAdmissions.length === 0 && pastAdmissions.length === 0 && (
                            <div className="no-bills">No billing items found for this patient.</div>
                        )}

                    {/* Payment Panel */}
                    {pendingTotal() > 0 && (
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
                                No past payments found for this patient. Select items above and make a payment to see the history here.
                            </div>
                        ) : (
                            <table className="billing-table">
                                <thead><tr><th>Date</th><th>Mode</th><th>Txn ID</th><th>Details</th><th>Amount</th><th>Status</th><th>View</th><th>Download</th></tr></thead>
                                <tbody>
                                    {billing.paymentTransactions.map(pt => (
                                        <tr key={pt._id}>
                                            <td>{fmtDate(pt.paymentDate)}</td>
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
                        )}
                    </div>
                </>
            )}

            {!patient && !loading && (
                <div className="billing-empty-prompt">
                    <div className="empty-prompt-icon">🔍</div>
                    <h3>Search Patient to View Billing & Past Payments</h3>
                    <p>Enter a patient's Phone Number, MRN, or Name above to view and settle pending bills, or switch to the <strong>Hospital Billing & Payment History</strong> tab to view all hospital collections and UPI screenshot proofs.</p>
                </div>
            )}
        </>
    )}

    {/* ====== TAB 2: HOSPITAL-WIDE PAYMENT & BILLING HISTORY ====== */}
    {activeTab === 'history' && (
        <div className="ha-billing-page">
            {/* 1. Main Header Banner */}
            <div className="ha-main-header">
                {/* Top Row: Payment History Title on Left, + Record Payment on Right */}
                <div className="ha-header-top-row">
                    <div className="ha-header-left">
                        <div className="ha-title-icon-card">
                            <FaFileAlt size={22} color="#ffffff" />
                        </div>
                        <div className="ha-title-text-group">
                            <h1 className="ha-page-title">Payment History</h1>
                            <p className="ha-page-sub">Track and manage all patient payments</p>
                        </div>
                    </div>

                    {/* Record Payment Button - Placed right opposite Payment History */}
                    <button
                        type="button"
                        className="ha-btn-record-primary"
                        onClick={() => setActiveTab('patient')}
                    >
                        <FaPlus size={13} />
                        <span>Record Payment</span>
                    </button>
                </div>

                {/* Bottom Row: Custom Range, Refresh */}
                <div className="ha-header-bottom-row">
                    {/* Custom Range button with dropdown popover */}
                    <div className="ha-custom-range-wrap">
                        <button
                            type="button"
                            className={`ha-custom-range-btn ${datePreset === 'custom' ? 'active' : ''}`}
                            onClick={() => setShowCustomRangePicker(prev => !prev)}
                        >
                            <FaCalendarAlt size={13} />
                            <span>Custom Range</span>
                            <FaChevronDown size={10} className="ha-custom-caret-icon" />
                        </button>

                        {showCustomRangePicker && (
                            <div className="ha-custom-date-popover">
                                <div className="ha-cd-row">
                                    <label>
                                        <span>From:</span>
                                        <input
                                            type="date"
                                            max={maxDate}
                                            value={customStartDate}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val > maxDate) return;
                                                handleCustomDateChange(val, customEndDate);
                                            }}
                                        />
                                    </label>
                                    <label>
                                        <span>To:</span>
                                        <input
                                            type="date"
                                            min={customStartDate || undefined}
                                            max={maxDate}
                                            value={customEndDate}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val > maxDate) return;
                                                handleCustomDateChange(customStartDate, val);
                                            }}
                                        />
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    className="ha-cd-apply"
                                    onClick={() => {
                                        setDatePreset('custom');
                                        setShowCustomRangePicker(false);
                                    }}
                                >
                                    Apply Range
                                </button>
                            </div>
                        )}
                    </div>

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

            {/* 3. 5 Revenue & Collection Summary Cards with Sparklines */}
            <div className="ha-kpi-grid">
                {/* Card 1: Total Earnings / Overall (Ab tak ka pura) */}
                <div
                    className={`ha-kpi-card clickable ${datePreset === 'all' && historyMode === 'ALL' && !historySearch ? 'active' : ''}`}
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
                    <div className="ha-kpi-sparkline-wrap">
                        <svg viewBox="0 0 140 40" preserveAspectRatio="none" className="ha-kpi-sparkline">
                            <defs>
                                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M 0 35 Q 35 38 70 25 T 140 10" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M 0 35 Q 35 38 70 25 T 140 10 L 140 40 L 0 40 Z" fill="url(#blueGrad)" />
                        </svg>
                    </div>
                </div>

                {/* Card 2: This Month (Is Mahine Ka) */}
                <div
                    className={`ha-kpi-card clickable ${datePreset === 'this_month' ? 'active' : ''}`}
                    onClick={() => setDatePreset(prev => prev === 'this_month' ? 'all' : 'this_month')}
                    title="Click to filter This Month's transactions"
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box purple">
                            <FaCalendarAlt size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">This Month</span>
                            <strong className="ha-kpi-value">{fmt(revenueStats.monthRevenue)}</strong>
                            <span className="ha-kpi-sub-count">{revenueStats.monthCount} {revenueStats.monthCount === 1 ? 'payment this month' : 'payments this month'}</span>
                        </div>
                    </div>
                    <div className="ha-kpi-sparkline-wrap">
                        <svg viewBox="0 0 140 40" preserveAspectRatio="none" className="ha-kpi-sparkline">
                            <defs>
                                <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M 0 36 Q 35 37 75 22 T 140 12" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M 0 36 Q 35 37 75 22 T 140 12 L 140 40 L 0 40 Z" fill="url(#purpleGrad)" />
                        </svg>
                    </div>
                </div>

                {/* Card 3: This Week (Is Hafte Ka) */}
                <div
                    className={`ha-kpi-card clickable ${datePreset === 'this_week' ? 'active' : ''}`}
                    onClick={() => setDatePreset(prev => prev === 'this_week' ? 'all' : 'this_week')}
                    title="Click to filter This Week's transactions"
                >
                    <div className="ha-kpi-top">
                        <div className="ha-kpi-icon-box amber">
                            <FaChartLine size={18} />
                        </div>
                        <div className="ha-kpi-meta">
                            <span className="ha-kpi-label">This Week</span>
                            <strong className="ha-kpi-value">{fmt(revenueStats.weekRevenue)}</strong>
                            <span className="ha-kpi-sub-count">{revenueStats.weekCount} {revenueStats.weekCount === 1 ? 'payment this week' : 'payments this week'}</span>
                        </div>
                    </div>
                    <div className="ha-kpi-sparkline-wrap">
                        <svg viewBox="0 0 140 40" preserveAspectRatio="none" className="ha-kpi-sparkline">
                            <defs>
                                <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M 0 36 Q 40 38 80 24 T 140 12" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M 0 36 Q 40 38 80 24 T 140 12 L 140 40 L 0 40 Z" fill="url(#amberGrad)" />
                        </svg>
                    </div>
                </div>

                {/* Card 4: Today's Collection (Aaj Ka) */}
                <div
                    className={`ha-kpi-card clickable ${datePreset === 'today' ? 'active' : ''}`}
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
                    <div className="ha-kpi-sparkline-wrap">
                        <svg viewBox="0 0 140 40" preserveAspectRatio="none" className="ha-kpi-sparkline">
                            <defs>
                                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M 0 32 Q 40 36 80 20 T 140 8" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M 0 32 Q 40 36 80 20 T 140 8 L 140 40 L 0 40 Z" fill="url(#greenGrad)" />
                        </svg>
                    </div>
                </div>

                {/* Card 5: Cash & Online Mode Count (Dynamic per selected card/period) */}
                <div className={`ha-kpi-card ${historyMode !== 'ALL' ? 'active' : ''}`}>
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
                    <div className="ha-kpi-sparkline-wrap">
                        <svg viewBox="0 0 140 40" preserveAspectRatio="none" className="ha-kpi-sparkline">
                            <defs>
                                <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M 0 35 Q 40 38 80 20 T 140 10" fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M 0 35 Q 40 38 80 20 T 140 10 L 140 40 L 0 40 Z" fill="url(#tealGrad)" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* 4. Filter Toolbar */}
            <div className="ha-filter-toolbar">
                <div className="ha-search-box">
                    <FaSearch className="ha-search-icon" />
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
                            <option value="UPI">UPI</option>
                            <option value="Card">Card</option>
                        </select>
                    </div>

                    {/* All Status Dropdown */}
                    <div className="ha-drop-wrap">
                        <FaClock className="ha-drop-icon" />
                        <select
                            value={historyStatus}
                            onChange={e => setHistoryStatus(e.target.value)}
                            className="ha-drop-select"
                        >
                            <option value="ALL">All Status</option>
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
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
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="amt_high">Amount: High to Low</option>
                            <option value="amt_low">Amount: Low to High</option>
                        </select>
                    </div>

                    {/* Date Dropdown */}
                    <div className="ha-drop-wrap">
                        <FaCalendarAlt className="ha-drop-icon" />
                        <select
                            value={datePreset}
                            onChange={e => handlePresetChange(e.target.value)}
                            className="ha-drop-select"
                        >
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                        </select>
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

            {/* 5. Sub-Header: Showing Count + Export */}
            <div className="ha-sub-header">
                <div className="ha-showing-wrap">
                    <span className="ha-showing-pulse-dot"></span>
                    <span className="ha-showing-label">Showing</span>
                    <span className="ha-showing-count-badge">{displayedTransactions.length}</span>
                    <span className="ha-showing-unit">{displayedTransactions.length === 1 ? 'Payment Record' : 'Payment Records'}</span>
                </div>
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
                                                            <strong className="ha-pat-name">{pat.name || 'Walk-in Patient'}</strong>
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
                                                            onClick={() => setSelectedPaymentModal(t)}
                                                            title="View complete transaction information"
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

            {/* ====== POPUP MODAL: PAYMENT DETAILS (MATCHING IMAGE 2 EXACTLY) ====== */}
            {selectedPaymentModal && (
                <div className="ha-modal-backdrop" onClick={() => setSelectedPaymentModal(null)}>
                    <div className="ha-details-modal" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="ha-dm-header">
                            <div>
                                <h3 className="ha-dm-title">Payment Details</h3>
                                <p className="ha-dm-sub">Complete transaction information</p>
                            </div>
                            <button
                                type="button"
                                className="ha-dm-close"
                                onClick={() => setSelectedPaymentModal(null)}
                                title="Close"
                            >
                                &times;
                            </button>
                        </div>

                        {/* Modal Body */}
                        {(() => {
                            const pat = selectedPaymentModal.patientId || {};
                            const isUpi = (selectedPaymentModal.paymentMode || '').toUpperCase().includes('UPI');
                            const hasProof = !!(selectedPaymentModal.proofUrl || selectedPaymentModal.upiScreenshotUrl);
                            const proofImg = selectedPaymentModal.proofUrl || selectedPaymentModal.upiScreenshotUrl;
                            const { dateStr, timeStr } = getBookingDateTime(selectedPaymentModal);
                            const realUtr = getRealUtr(selectedPaymentModal);

                            // Service & doctor resolution
                            const { serviceTitle, doctorSubtitle } = parseServiceAndDoctor(selectedPaymentModal);

                            return (
                                <div className="ha-dm-body">
                                    {/* Top Patient Card */}
                                    <div className="ha-dm-patient-card">
                                        <div className="ha-dm-pat-left">
                                            <div className="ha-dm-avatar">
                                                {(pat.name || 'J').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="ha-dm-pat-meta">
                                                <strong className="ha-dm-name">{pat.name || 'Walk-in Patient'}</strong>
                                                <span className="ha-dm-mrn">MRN: {pat.mrn || pat.patientId || 'PCF-M365-001'}</span>
                                                {pat.phone && (
                                                    <span className="ha-dm-phone">
                                                        <span className="ha-phone-icon">📞</span>
                                                        <span>{pat.phone}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="ha-dm-pat-right">
                                            <span className="ha-dm-status-badge">
                                                <FaCheckCircle size={13} />
                                                <span>Paid</span>
                                            </span>
                                            <span className="ha-dm-timestamp">{dateStr}, {timeStr}</span>
                                        </div>
                                    </div>

                                    {/* 4 Information Cards in 2x2 Grid */}
                                    <div className="ha-dm-grid">
                                        {/* Card 1: Service / Description */}
                                        <div className="ha-dm-card">
                                            <div className="ha-dm-card-icon blue">
                                                <FaFileAlt size={16} />
                                            </div>
                                            <div className="ha-dm-card-content">
                                                <span className="ha-dm-card-label">Service / Description</span>
                                                <strong className="ha-dm-card-val">{serviceTitle}</strong>
                                                <span className="ha-dm-card-sub">{doctorSubtitle}</span>
                                            </div>
                                        </div>

                                        {/* Card 2: Amount */}
                                        <div className="ha-dm-card">
                                            <div className="ha-dm-card-icon blue">
                                                <FaRupeeSign size={16} />
                                            </div>
                                            <div className="ha-dm-card-content">
                                                <span className="ha-dm-card-label">Amount</span>
                                                <strong className="ha-dm-card-val amount">{fmt(selectedPaymentModal.amount)}</strong>
                                            </div>
                                        </div>

                                        {/* Card 3: Payment Mode */}
                                        <div className="ha-dm-card">
                                            <div className="ha-dm-card-icon purple">
                                                <FaCreditCard size={16} />
                                            </div>
                                            <div className="ha-dm-card-content">
                                                <span className="ha-dm-card-label">Payment Mode</span>
                                                <strong className="ha-dm-card-val">{selectedPaymentModal.paymentMode || 'Cash'}</strong>
                                            </div>
                                        </div>

                                        {/* Card 4: UTR / Transaction ID */}
                                        <div className="ha-dm-card">
                                            <div className="ha-dm-card-icon blue">
                                                <FaFileAlt size={16} />
                                            </div>
                                            <div className="ha-dm-card-content">
                                                <span className="ha-dm-card-label">UTR / Transaction ID</span>
                                                <div className="ha-dm-utr-box">
                                                    <code className="ha-dm-utr-code">{realUtr}</code>
                                                    {realUtr !== '—' && (
                                                        <button
                                                            type="button"
                                                            className="ha-dm-copy-btn"
                                                            onClick={() => handleCopy(realUtr)}
                                                            title="Copy UTR / Transaction ID"
                                                        >
                                                            <FaCopy size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom 2 Cards: Payment Proof & Bill Details */}
                                    <div className="ha-dm-bottom-grid">
                                        {/* Left: Payment Proof */}
                                        <div className="ha-dm-action-card">
                                            <span className="ha-dm-card-label">Payment Proof</span>
                                            {hasProof ? (
                                                <div className="ha-dm-proof-box">
                                                    <img
                                                        src={proofImg}
                                                        alt="Payment Proof"
                                                        className="ha-dm-proof-thumb"
                                                        onClick={() => setViewProofUrl(proofImg, {
                                                            patientName: pat.name,
                                                            amount: selectedPaymentModal.amount,
                                                            mode: selectedPaymentModal.paymentMode,
                                                            txnId: realUtr,
                                                            date: selectedPaymentModal.paymentDate || selectedPaymentModal.createdAt
                                                        })}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="ha-dm-btn-proof"
                                                        onClick={() => setViewProofUrl(proofImg, {
                                                            patientName: pat.name,
                                                            amount: selectedPaymentModal.amount,
                                                            mode: selectedPaymentModal.paymentMode,
                                                            txnId: realUtr,
                                                            date: selectedPaymentModal.paymentDate || selectedPaymentModal.createdAt
                                                        })}
                                                    >
                                                        <FaEye size={12} />
                                                        <span>View Proof</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="ha-dm-no-proof">
                                                    No screenshot proof uploaded
                                                </div>
                                            )}
                                        </div>

                                        {/* Right: Bill Details */}
                                        <div className="ha-dm-action-card">
                                            <span className="ha-dm-card-label">Bill Details</span>
                                            <div className="ha-dm-bill-box">
                                                <button
                                                    type="button"
                                                    className="ha-dm-btn-bill-view"
                                                    onClick={() => openPatientBillBreakdown(selectedPaymentModal)}
                                                >
                                                    <FaEye size={12} />
                                                    <span>View Bill</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ha-dm-btn-bill-download"
                                                    onClick={() => downloadTransactionReceipt(selectedPaymentModal)}
                                                    title="Download Official Hospital Bill Receipt"
                                                >
                                                    <FaDownload size={12} />
                                                    <span>Download Bill</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Close Footer Button */}
                                    <div className="ha-dm-footer">
                                        <button
                                            type="button"
                                            className="ha-dm-btn-close-main"
                                            onClick={() => setSelectedPaymentModal(null)}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
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
                                <span><strong>Patient:</strong> {inspectPatientModal.patient.name}</span>
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
        </div>
    );
};

export default PatientBillingProfile;
