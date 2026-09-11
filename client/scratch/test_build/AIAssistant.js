import React, { useState, useEffect, useRef } from "react";
import {
  FiSearch,
  FiUser,
  FiFileText,
  FiImage,
  FiPaperclip,
  FiMic,
  FiSend,
  FiRefreshCw,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertCircle,
  FiDownload,
  FiPrinter,
  FiMaximize2,
  FiZoomIn,
  FiZoomOut,
  FiRotateCw,
  FiMoreVertical,
  FiFilter,
  FiBell,
  FiChevronDown,
  FiPlus,
  FiInfo,
  FiTrash2,
  FiActivity,
  FiUsers,
  FiCalendar,
  FiDollarSign,
  FiClock,
  FiCheck,
  FiHeadphones,
  FiX,
  FiAlertTriangle,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiChevronUp,
  FiEye,
  FiExternalLink
} from "react-icons/fi";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { reportAPI, patientAPI, doctorAPI, aiWalletAPI } from "../../utils/api";
import socket from "../../utils/socket";
import AIResponseRenderer from "../../components/AIResponseRenderer";
import VoiceScribe from "../../components/voicescribe/VoiceScribe";
import "./AIAssistant.css";
const formatCredits = (amount) => {
  const num = Number(amount) || 0;
  return `${num.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Credits`;
};
const formatINR = formatCredits;
const getWalletStatusInfo = (status) => {
  switch (status) {
    case "LOW":
      return { label: "Low Balance", color: "#f59e0b", bgColor: "#fef3c7", icon: "\u26A0\uFE0F" };
    case "CRITICAL":
      return { label: "Critical", color: "#f97316", bgColor: "#ffedd5", icon: "\u{1F536}" };
    case "VERY_CRITICAL":
      return { label: "Very Low", color: "#ef4444", bgColor: "#fee2e2", icon: "\u{1F534}" };
    case "EXHAUSTED":
      return { label: "Exhausted", color: "#dc2626", bgColor: "#fecaca", icon: "\u{1F6AB}" };
    default:
      return { label: "Active", color: "#16a34a", bgColor: "#dcfce7", icon: "\u2705" };
  }
};
const isImageMime = (mime, url = "") => {
  if (mime && mime.startsWith("image/")) return true;
  if (url && (url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".png") || url.endsWith(".webp"))) return true;
  return false;
};
const isPdfMime = (mime, url = "") => {
  if (mime === "application/pdf") return true;
  if (url && url.endsWith(".pdf")) return true;
  return false;
};
const AIAssistant = () => {
  const location = useLocation();
  const [activeAIMode, setActiveAIMode] = useState(location.state?.tab === "voice_scribe" ? "voice_scribe" : "reports");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [isFetchingPatients, setIsFetchingPatients] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientDetails, setShowPatientDetails] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportFilterQuery, setReportFilterQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [isReportSearchOpen, setIsReportSearchOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [insideSearchQuery, setInsideSearchQuery] = useState("");
  const [insideSearchResults, setInsideSearchResults] = useState([]);
  const [isSearchingInside, setIsSearchingInside] = useState(false);
  const [insideSearchMessage, setInsideSearchMessage] = useState(null);
  const [compareReport1, setCompareReport1] = useState("");
  const [compareReport2, setCompareReport2] = useState("");
  const [comparisonResult, setComparisonResult] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletLogs, setWalletLogs] = useState([]);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "ai",
      text: "Hello! I'm your AI Assistant.\nYou can ask me anything about this patient's reports, labs, medications or health trends.\nHow can I help you today?",
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  useEffect(() => {
    fetchWalletData();
    fetchDoctorPatients();
  }, []);
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatLoading]);
  useEffect(() => {
    let hospitalId = null;
    try {
      const authStr = localStorage.getItem("user") || localStorage.getItem("authUser");
      if (authStr) {
        const authData = JSON.parse(authStr);
        hospitalId = authData.hospitalId || authData.user?.hospitalId;
      }
    } catch (e) {
    }
    if (!hospitalId) return;
    if (!socket.connected) socket.connect();
    socket.emit("joinHospitalRoom", hospitalId);
    const handleWalletUpdate = (data) => {
      if (data && data.hospitalId === hospitalId) {
        setWallet((prev) => ({
          ...prev,
          remainingAmount: data.remainingAmount,
          usedAmount: data.usedAmount,
          budgetAmount: data.budgetAmount,
          status: data.status || data.warningLevel,
          warningLevel: data.warningLevel,
          warningMessage: data.warningMessage
        }));
      }
    };
    socket.on("AI_WALLET_UPDATED", handleWalletUpdate);
    return () => {
      socket.off("AI_WALLET_UPDATED", handleWalletUpdate);
    };
  }, []);
  const fetchWalletData = async () => {
    try {
      const res = await aiWalletAPI.getWallet();
      if (res && res.success && res.wallet) {
        setWallet(res.wallet);
      }
    } catch (err) {
      console.error("Error fetching AI wallet:", err);
    }
  };
  const fetchWalletModalData = async () => {
    setIsWalletLoading(true);
    try {
      const [walletRes, historyRes] = await Promise.all([
        aiWalletAPI.getWallet(),
        aiWalletAPI.getUsageHistory(30)
      ]);
      if (walletRes && walletRes.success && walletRes.wallet) setWallet(walletRes.wallet);
      if (historyRes && historyRes.success) setWalletLogs(historyRes.logs || []);
    } catch (err) {
      console.error("Error fetching AI wallet analytics:", err);
    } finally {
      setIsWalletLoading(false);
    }
  };
  const fetchDoctorPatients = async () => {
    setIsFetchingPatients(true);
    try {
      const res = await doctorAPI.getPatients();
      if (res && res.success && Array.isArray(res.patients) && res.patients.length > 0) {
        setAllPatients(res.patients);
        const targetPatientId = location.state?.patientId;
        const matchedPatient = targetPatientId ? res.patients.find((pt) => String(pt._id) === String(targetPatientId)) : null;
        const p = matchedPatient || res.patients[0];
        const patientObj = {
          _id: p._id,
          name: p.name || "Patient",
          status: "Active",
          profile: {
            mrn: p.profile?.mrn || p.patientId || p.mrn || "CIT-" + String(p._id).slice(-4),
            gender: p.profile?.gender || p.gender || "Not specified",
            age: p.profile?.age || p.age || "--",
            phone: p.phone || p.mobile || "Not available"
          }
        };
        setSelectedPatient(patientObj);
        loadPatientDocuments(p._id);
      } else if (location.state?.patientId) {
        try {
          const singleRes = await patientAPI.getPatient(location.state.patientId);
          if (singleRes && singleRes.patient) {
            const p = singleRes.patient;
            const patientObj = {
              _id: p._id,
              name: p.name || "Patient",
              status: "Active",
              profile: {
                mrn: p.patientId || p.mrn || "CIT-" + String(p._id).slice(-4),
                gender: p.gender || "Not specified",
                age: p.age || "--",
                phone: p.phone || "Not available"
              }
            };
            setSelectedPatient(patientObj);
            setAllPatients([p]);
            loadPatientDocuments(p._id);
          }
        } catch (e) {
          setAllPatients([]);
          setSelectedPatient(null);
          setReports([]);
        }
      } else {
        setAllPatients([]);
        setSelectedPatient(null);
        setReports([]);
      }
    } catch (err) {
      console.error("Error fetching patients:", err);
      setAllPatients([]);
    } finally {
      setIsFetchingPatients(false);
    }
  };
  const isReportSelected = (r) => {
    if (!selectedReport || !r) return false;
    if (selectedReport._id && r._id) return String(selectedReport._id) === String(r._id);
    if (selectedReport.url && r.url) return selectedReport.url === r.url;
    if (selectedReport.fileUrl && r.fileUrl) return selectedReport.fileUrl === r.fileUrl;
    if (selectedReport.fileName && r.fileName) return selectedReport.fileName === r.fileName;
    if (selectedReport.name && r.name) return selectedReport.name === r.name;
    return false;
  };
  const loadPatientDocuments = async (patientId) => {
    setIsReportsLoading(true);
    setSummary(null);
    setSelectedReport(null);
    setInsideSearchResults([]);
    setInsideSearchMessage(null);
    setComparisonResult(null);
    try {
      const res = await patientAPI.getDocuments(patientId);
      if (res && res.success && Array.isArray(res.documents) && res.documents.length > 0) {
        setReports(res.documents);
        setSelectedReport(null);
        if (res.documents.length >= 2) {
          setCompareReport1(res.documents[0].url || res.documents[0]._id || "");
          setCompareReport2(res.documents[1].url || res.documents[1]._id || "");
        } else if (res.documents.length === 1) {
          setCompareReport1(res.documents[0].url || res.documents[0]._id || "");
          setCompareReport2(res.documents[0].url || res.documents[0]._id || "");
        }
      } else {
        setReports([]);
        setSelectedReport(null);
        setCompareReport1("");
        setCompareReport2("");
      }
    } catch (err) {
      console.warn("Error loading patient documents:", err?.message);
      setReports([]);
      setSelectedReport(null);
    } finally {
      setIsReportsLoading(false);
    }
  };
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const filtered = allPatients.filter((p) => {
      const nameMatch = p.name && p.name.toLowerCase().includes(q);
      const mrnMatch = (p.profile?.mrn || p.patientId || "").toLowerCase().includes(q);
      const phoneMatch = p.phone && String(p.phone).includes(q);
      return nameMatch || mrnMatch || phoneMatch;
    });
    setSearchResults(filtered);
  }, [searchQuery, allPatients]);
  const handleSelectPatient = (p) => {
    const patientObj = {
      _id: p._id,
      name: p.name || "Patient",
      status: "Active",
      profile: {
        mrn: p.profile?.mrn || p.patientId || p.mrn || "CIT-" + String(p._id).slice(-4),
        gender: p.profile?.gender || p.gender || "Not specified",
        age: p.profile?.age || p.age || "--",
        phone: p.phone || p.mobile || "Not available"
      }
    };
    setSelectedPatient(patientObj);
    setSearchQuery("");
    setSearchResults([]);
    setSummary(null);
    loadPatientDocuments(p._id);
  };
  const handleGenerateSummary = async () => {
    if (!selectedReport || isExhausted) return;
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const fileUrl = selectedReport.url || selectedReport.fileUrl;
      const mimeType = selectedReport.mimeType || "application/pdf";
      const fileName = selectedReport.fileName || selectedReport.name || "Medical Report";
      if (!fileUrl) {
        throw new Error("Selected report does not have a valid file URL.");
      }
      const res = await reportAPI.generateAISummary(fileUrl, mimeType, fileName);
      if (res && res.success && res.summary) {
        const s = res.summary;
        if (typeof s === "string") {
          setSummary(s);
        } else {
          let formatted = `### \u{1F4CB} ${s.ReportType || s.ContentType || "Clinical Report Summary"}

`;
          if (s.OverallSummary) formatted += `**Summary:** ${s.OverallSummary}

`;
          if (Array.isArray(s.ImportantFindings) && s.ImportantFindings.length > 0) {
            formatted += `#### \u{1F50E} Key Findings
${s.ImportantFindings.map((f) => `- ${f}`).join("\n")}

`;
          }
          if (Array.isArray(s.AbnormalValues) && s.AbnormalValues.length > 0) {
            formatted += `#### \u26A0\uFE0F Abnormal Values
${s.AbnormalValues.map((a) => `- **${a.parameter || a}**: \`${a.value || ""}\` (${a.interpretation || "Review clinically"})`).join("\n")}

`;
          }
          if (Array.isArray(s.VisibleObservations) && s.VisibleObservations.length > 0) {
            formatted += `#### \u{1F441}\uFE0F Observations
${s.VisibleObservations.map((o) => `- ${o}`).join("\n")}
`;
          }
          setSummary(formatted.trim());
        }
        if (res.wallet) setWallet((prev) => ({ ...prev, ...res.wallet }));
        else if (res.usage?.wallet) setWallet((prev) => ({ ...prev, ...res.usage.wallet }));
      } else {
        throw new Error(res?.message || "Failed to generate summary");
      }
    } catch (err) {
      console.error("Summary error:", err);
      const errMsg = err.response?.data?.message || err.message || "Failed to generate summary";
      if (err.response?.status === 402) {
        if (err.response?.data?.wallet) setWallet((prev) => ({ ...prev, ...err.response.data.wallet }));
      }
      setSummaryError(errMsg);
    } finally {
      setIsSummaryLoading(false);
    }
  };
  const handleInsideSearch = async () => {
    const query = insideSearchQuery.trim();
    if (!query || !selectedPatient) return;
    setIsSearchingInside(true);
    setInsideSearchMessage(null);
    setInsideSearchResults([]);
    try {
      const res = await reportAPI.searchReports(selectedPatient._id, query);
      if (res && res.success && Array.isArray(res.results)) {
        setInsideSearchResults(res.results);
        if (res.results.length === 0) {
          setInsideSearchMessage(`No matches found for "${query}" in this patient's reports.`);
        }
      } else {
        setInsideSearchMessage(res?.message || `No matches found for "${query}".`);
      }
    } catch (err) {
      console.error("Search inside error:", err);
      setInsideSearchMessage(err.response?.data?.message || "Error searching inside reports.");
    } finally {
      setIsSearchingInside(false);
    }
  };
  const handleCompare = async () => {
    if (!compareReport1 || !compareReport2 || isExhausted) return;
    setIsComparing(true);
    setCompareError(null);
    setComparisonResult(null);
    try {
      const r1 = reports.find((r) => (r.url || r._id) === compareReport1);
      const r2 = reports.find((r) => (r.url || r._id) === compareReport2);
      if (!r1 || !r2 || !r1.url || !r2.url) {
        throw new Error("Please select two valid reports to compare.");
      }
      const res = await reportAPI.compareReports(
        r1.url,
        r1.mimeType || "application/pdf",
        r2.url,
        r2.mimeType || "application/pdf",
        selectedPatient?._id
      );
      if (res && res.success && res.comparison) {
        setComparisonResult(res.comparison);
        if (res.wallet) setWallet((prev) => ({ ...prev, ...res.wallet }));
        else if (res.usage?.wallet) setWallet((prev) => ({ ...prev, ...res.usage.wallet }));
      } else {
        throw new Error(res?.message || "Unable to compare these reports right now. Please try again.");
      }
    } catch (err) {
      console.error("Compare error:", err);
      setCompareError(err.response?.data?.message || err.message || "Unable to compare these reports right now. Please try again.");
    } finally {
      setIsComparing(false);
    }
  };
  const handleChatSend = async (overridePrompt = null) => {
    const text = (overridePrompt || chatInput).trim();
    if (!text || isExhausted) return;
    const doctorMsg = {
      role: "doctor",
      text,
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setChatMessages((prev) => [...prev, doctorMsg]);
    if (!overridePrompt) setChatInput("");
    setIsChatLoading(true);
    try {
      const apiMessages = chatMessages.map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text
      }));
      let reportContext = "";
      if (selectedReport) {
        reportContext = `Current Selected Report: "${selectedReport.fileName || selectedReport.name || "Medical Report"}". `;
        if (summary) {
          reportContext += `Generated Summary Context: ${typeof summary === "string" ? summary.substring(0, 500) : ""}. `;
        }
      }
      const patientContext = selectedPatient ? `Patient: ${selectedPatient.name}, MRN: ${selectedPatient.profile.mrn}, Age: ${selectedPatient.profile.age}, Gender: ${selectedPatient.profile.gender}. ${reportContext}` : reportContext;
      apiMessages.push({
        role: "user",
        content: (patientContext ? `[Clinical Context: ${patientContext}]

` : "") + text
      });
      const mediaUrls = selectedReport && selectedReport.url ? [{
        url: selectedReport.url,
        mimeType: selectedReport.mimeType || "application/pdf"
      }] : [];
      const res = await reportAPI.chatWithAssistant(apiMessages, mediaUrls);
      if (res && res.success && res.reply) {
        const aiMsg = {
          role: "ai",
          text: res.reply,
          timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setChatMessages((prev) => [...prev, aiMsg]);
        if (res.wallet) setWallet((prev) => ({ ...prev, ...res.wallet }));
        else if (res.usage?.wallet) setWallet((prev) => ({ ...prev, ...res.usage.wallet }));
      } else {
        throw new Error(res?.message || "No reply received");
      }
    } catch (err) {
      console.error("Chat error:", err);
      if (err.response?.status === 402) {
        if (err.response?.data?.wallet) setWallet((prev) => ({ ...prev, ...err.response.data.wallet }));
        const aiMsg = {
          role: "ai",
          text: "\u26A0\uFE0F **AI Credits Exhausted**\n\nYour hospital's AI Credits have been fully used. Please contact your Hospital Administrator to recharge.",
          timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const aiMsg = {
          role: "ai",
          text: `\u26A0\uFE0F **Clinical Analysis Notice**

Unable to process this query right now. Please retry shortly.

*Error details:* ${err.message}`,
          timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      }
    } finally {
      setIsChatLoading(false);
    }
  };
  const handleClearChat = () => {
    setChatMessages([]);
  };
  const filteredReports = reports.filter(
    (r) => (r.fileName || r.name || "").toLowerCase().includes(reportFilterQuery.toLowerCase())
  );
  const remainingRupees = wallet ? Number(wallet.remainingAmount) || 0 : 2e3;
  const budgetRupees = wallet ? Number(wallet.budgetAmount) || 2e3 : 2e3;
  const usedRupees = wallet ? Number(wallet.usedAmount) || 0 : 0;
  const usedPercent = budgetRupees > 0 ? Math.min(100, Math.round(usedRupees / budgetRupees * 100)) : 0;
  const walletStatus = wallet?.status || wallet?.warningLevel || "ACTIVE";
  const isExhausted = walletStatus === "EXHAUSTED";
  const statusInfo = getWalletStatusInfo(walletStatus);
  const patientInitials = selectedPatient?.name ? selectedPatient.name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase() : "PT";
  return /* @__PURE__ */ React.createElement("div", { className: "cca-exact-page-container" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-top-header-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-header-left" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-title-wrap" }, /* @__PURE__ */ React.createElement("h1", { className: "cca-exact-title" }, "AI Assistant"), /* @__PURE__ */ React.createElement("span", { className: "cca-exact-ai-pill" }, "AI Powered")), /* @__PURE__ */ React.createElement("p", { className: "cca-exact-header-subtitle" }, "Intelligent clinical companion to analyze patient reports, abnormal values & medical trends.")), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-credits-header-box", onClick: () => {
    setIsWalletOpen(true);
    fetchWalletModalData();
  } }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-cw-top" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-cw-left" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-cw-label" }, "AI Credits ", /* @__PURE__ */ React.createElement(FiInfo, { size: 13 })), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-cw-amount" }, formatINR(remainingRupees)), /* @__PURE__ */ React.createElement("span", { className: "cca-exact-cw-sub" }, "of ", formatINR(budgetRupees), " total budget")), /* @__PURE__ */ React.createElement("button", { className: "cca-exact-btn-buy", onClick: (e) => {
    e.stopPropagation();
    setIsWalletOpen(true);
    fetchWalletModalData();
  } }, "Buy More Credits")), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-cw-progress-track" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-cw-progress-fill", style: {
    width: `${usedPercent}%`,
    background: isExhausted ? "#dc2626" : walletStatus === "VERY_CRITICAL" ? "#ef4444" : walletStatus === "CRITICAL" ? "#f97316" : walletStatus === "LOW" ? "#f59e0b" : "#4f46e5"
  } }), /* @__PURE__ */ React.createElement("span", { className: "cca-exact-cw-progress-text" }, usedPercent, "%")))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-main-grid" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-left-col" }, /* @__PURE__ */ React.createElement("div", { className: "cca-patient-search-row-unified" }, /* @__PURE__ */ React.createElement("div", { className: "cca-compact-search-col" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-search-input-box" }, /* @__PURE__ */ React.createElement("button", { className: "cca-exact-search-ico-btn", title: "Search" }, /* @__PURE__ */ React.createElement(FiSearch, null)), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "cca-exact-search-input",
      placeholder: "Search patient by name, MRN, phone...",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value)
    }
  ), searchQuery && /* @__PURE__ */ React.createElement("button", { className: "cca-compact-clear-btn", onClick: () => {
    setSearchQuery("");
    setSearchResults([]);
  } }, /* @__PURE__ */ React.createElement(FiX, { size: 13 }))), searchResults.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-patient-dropdown", "data-lenis-prevent": true }, searchResults.map((p) => /* @__PURE__ */ React.createElement("div", { key: p._id, className: "cca-dropdown-item", onClick: () => handleSelectPatient(p) }, /* @__PURE__ */ React.createElement("div", { className: "cca-dd-avatar" }, (p.name || "P").charAt(0)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "cca-dd-name" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "cca-dd-sub" }, p.profile?.mrn || p.patientId || "CIT-001", " \u2022 ", p.profile?.gender || p.gender || "Patient", " \u2022 ", p.profile?.age || p.age || "--", " Y")))))), /* @__PURE__ */ React.createElement("div", { className: "cca-compact-patient-col" }, selectedPatient ? /* @__PURE__ */ React.createElement("div", { className: "cca-exact-patient-card compact" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-patient-left" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-avatar-circle" }, patientInitials), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-p-info" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-p-name-row" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-p-name" }, selectedPatient.name), /* @__PURE__ */ React.createElement("span", { className: "cca-exact-active-tag" }, "Active")), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-p-meta" }, "MRN: ", selectedPatient.profile?.mrn))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-patient-right" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-exact-btn-view-details",
      onClick: () => setShowPatientDetails(!showPatientDetails)
    },
    "View Profile ",
    /* @__PURE__ */ React.createElement(FiChevronDown, { size: 13 })
  ))) : /* @__PURE__ */ React.createElement("div", { className: "cca-exact-patient-card empty compact" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "12px", color: "#64748b" } }, "\u{1F50D} Search patient to load medical records")))), /* @__PURE__ */ React.createElement("div", { className: "cca-ai-mode-nav", style: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#f1f5f9",
    padding: "5px",
    borderRadius: "12px",
    margin: "14px 0 16px 0",
    border: "1px solid #e2e8f0"
  } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `cca-mode-btn ${activeAIMode === "reports" ? "active" : ""}`,
      onClick: () => setActiveAIMode("reports"),
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "9px 14px",
        border: "none",
        borderRadius: "8px",
        fontSize: "0.86rem",
        fontWeight: activeAIMode === "reports" ? 700 : 500,
        background: activeAIMode === "reports" ? "#ffffff" : "transparent",
        color: activeAIMode === "reports" ? "#3b82f6" : "#64748b",
        boxShadow: activeAIMode === "reports" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
        cursor: "pointer",
        transition: "all 0.2s ease"
      }
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F4D1}"),
    " Document & Report Intelligence"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `cca-mode-btn ${activeAIMode === "voice_scribe" ? "active" : ""}`,
      onClick: () => setActiveAIMode("voice_scribe"),
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "9px 14px",
        border: "none",
        borderRadius: "8px",
        fontSize: "0.86rem",
        fontWeight: activeAIMode === "voice_scribe" ? 700 : 500,
        background: activeAIMode === "voice_scribe" ? "linear-gradient(135deg, #059669, #10b981)" : "transparent",
        color: activeAIMode === "voice_scribe" ? "#ffffff" : "#64748b",
        boxShadow: activeAIMode === "voice_scribe" ? "0 2px 8px rgba(16, 185, 129, 0.25)" : "none",
        cursor: "pointer",
        transition: "all 0.2s ease"
      }
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F399}\uFE0F"),
    " AI Clinical Voice Scribe"
  )), activeAIMode === "voice_scribe" && /* @__PURE__ */ React.createElement("div", { className: "cca-voice-scribe-container", style: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    padding: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
  } }, /* @__PURE__ */ React.createElement(
    VoiceScribe,
    {
      appointmentId: location.state?.appointmentId,
      patientId: selectedPatient?._id,
      patient: selectedPatient,
      appointment: location.state?.appointment,
      isLocked: false
    }
  )), activeAIMode === "reports" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card cca-exact-reports-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-title" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-card-icon blue" }, "\u{1F4D1}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Uploaded Reports (", filteredReports.length, ")"), /* @__PURE__ */ React.createElement("span", { className: "cca-sec-pill blue" }, "Patient Documents"))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-actions" }, isReportSearchOpen ? /* @__PURE__ */ React.createElement("div", { className: "cca-header-inline-search-box" }, /* @__PURE__ */ React.createElement("span", { className: "cca-rep-search-inline-ico" }, /* @__PURE__ */ React.createElement(FiSearch, { size: 13 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "cca-rep-search-inline-input",
      placeholder: "Filter reports...",
      autoFocus: true,
      value: reportFilterQuery,
      onChange: (e) => setReportFilterQuery(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-rep-search-close-btn",
      onClick: () => {
        setIsReportSearchOpen(false);
        setReportFilterQuery("");
      },
      title: "Close search"
    },
    /* @__PURE__ */ React.createElement(FiX, { size: 13 })
  )) : /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-header-search-icon-btn",
      title: "Search reports",
      onClick: () => setIsReportSearchOpen(true)
    },
    /* @__PURE__ */ React.createElement(FiSearch, { size: 15 })
  ))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-reports-scroll-fixed" }, isReportsLoading ? /* @__PURE__ */ React.createElement("div", { className: "cca-reports-loading" }, "Loading reports...") : filteredReports.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cca-exact-empty-reports" }, /* @__PURE__ */ React.createElement(FiFileText, { size: 24, style: { color: "#94a3b8", marginBottom: "6px" } }), /* @__PURE__ */ React.createElement("span", null, "No uploaded reports for this patient.")) : filteredReports.map((r, i) => {
    const isSelected = isReportSelected(r);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: r._id || i,
        className: `cca-report-item ${isSelected ? "active" : ""}`,
        onClick: () => setSelectedReport(r)
      },
      /* @__PURE__ */ React.createElement("div", { className: "cca-report-icon-box" }, isImageMime(r.mimeType, r.url || r.fileUrl) ? /* @__PURE__ */ React.createElement(FiImage, { className: "cca-ico-image" }) : /* @__PURE__ */ React.createElement(FiFileText, { className: "cca-ico-pdf" })),
      /* @__PURE__ */ React.createElement("div", { className: "cca-report-info" }, /* @__PURE__ */ React.createElement("div", { className: "cca-report-name" }, r.fileName || r.name || "Medical Document"), /* @__PURE__ */ React.createElement("div", { className: "cca-report-meta" }, r.docType || (isPdfMime(r.mimeType, r.url) ? "PDF" : "Image"), " \u2022 ", r.date || (r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString("en-IN") : "Uploaded"))),
      /* @__PURE__ */ React.createElement("div", { className: "cca-report-item-actions", onClick: (e) => e.stopPropagation() }, isSelected ? /* @__PURE__ */ React.createElement("span", { className: "cca-report-selected-tag" }, /* @__PURE__ */ React.createElement(FiCheck, { size: 11 }), " Selected") : /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "cca-btn-select-report",
          onClick: () => setSelectedReport(r)
        },
        "Select"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "cca-btn-view-doc",
          title: "View document preview",
          onClick: () => setPreviewDoc(r)
        },
        /* @__PURE__ */ React.createElement(FiEye, { size: 13 }),
        " View"
      ))
    );
  }))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card cca-exact-summary-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-title" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-card-icon purple" }, "\u{1F916}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "AI Report Summary"), /* @__PURE__ */ React.createElement("span", { className: "cca-selected-rep-hint" }, selectedReport ? `Target: ${selectedReport.fileName || selectedReport.name}` : "Select a report above"))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-exact-btn-generate",
      onClick: handleGenerateSummary,
      disabled: isSummaryLoading || isExhausted || !selectedReport,
      title: !selectedReport ? "Select a report above first" : isExhausted ? "AI Credits Exhausted" : "Generate AI Summary"
    },
    "\u2728 ",
    isSummaryLoading ? "Generating..." : "Generate Summary"
  ))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-summary-body-fixed" }, summaryError && /* @__PURE__ */ React.createElement("div", { className: "cca-summary-error-banner" }, /* @__PURE__ */ React.createElement(FiAlertCircle, null), " ", summaryError), isSummaryLoading && /* @__PURE__ */ React.createElement("div", { className: "cca-summary-loading-state" }, /* @__PURE__ */ React.createElement("div", { className: "cca-spinner" }), /* @__PURE__ */ React.createElement("span", null, "AI is analyzing report parameters and medical values...")), !isSummaryLoading && summary && /* @__PURE__ */ React.createElement("div", { className: "cca-exact-summary-markdown-box ai-markdown-body" }, /* @__PURE__ */ React.createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      components: {
        table: ({ node, ...props }) => /* @__PURE__ */ React.createElement("div", { className: "ai-markdown-table-wrapper" }, /* @__PURE__ */ React.createElement("table", { className: "ai-markdown-table", ...props })),
        th: ({ node, ...props }) => /* @__PURE__ */ React.createElement("th", { className: "ai-table-th", ...props }),
        td: ({ node, ...props }) => /* @__PURE__ */ React.createElement("td", { className: "ai-table-td", ...props }),
        h1: ({ node, ...props }) => /* @__PURE__ */ React.createElement("h3", { className: "ai-md-h1", ...props }),
        h2: ({ node, ...props }) => /* @__PURE__ */ React.createElement("h4", { className: "ai-md-h2", ...props }),
        h3: ({ node, ...props }) => /* @__PURE__ */ React.createElement("h5", { className: "ai-md-h3", ...props }),
        ul: ({ node, ...props }) => /* @__PURE__ */ React.createElement("ul", { className: "ai-md-ul", ...props }),
        ol: ({ node, ...props }) => /* @__PURE__ */ React.createElement("ol", { className: "ai-md-ol", ...props }),
        li: ({ node, ...props }) => /* @__PURE__ */ React.createElement("li", { className: "ai-md-li", ...props })
      }
    },
    summary
  )), !isSummaryLoading && !summary && /* @__PURE__ */ React.createElement("div", { className: "cca-exact-empty-summary" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-empty-icon" }, "\u{1F4D1}"), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-empty-text" }, /* @__PURE__ */ React.createElement("h4", null, selectedReport ? `Ready to summarize "${selectedReport.fileName || selectedReport.name}"` : "No report selected"), /* @__PURE__ */ React.createElement("p", null, selectedReport ? "Click 'Generate Summary' to analyze parameters and clinical observations." : "Select an uploaded report above to view AI generated summary"))))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card cca-exact-inside-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-header no-border" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-title" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-card-icon green" }, "\u{1F50D}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Search Inside Reports"), /* @__PURE__ */ React.createElement("span", { className: "cca-sec-pill green" }, "Keyword Search")))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-inside-input-row" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-inside-input-box" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-inside-search-ico" }, /* @__PURE__ */ React.createElement(FiSearch, null)), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "cca-exact-inside-input",
      placeholder: "Search keywords (e.g. Hemoglobin, TLC, Kidney Profile, Sugar)...",
      value: insideSearchQuery,
      onChange: (e) => setInsideSearchQuery(e.target.value),
      onKeyDown: (e) => e.key === "Enter" && handleInsideSearch()
    }
  ), insideSearchQuery && /* @__PURE__ */ React.createElement("button", { className: "cca-inside-clear-btn", onClick: () => {
    setInsideSearchQuery("");
    setInsideSearchResults([]);
    setInsideSearchMessage(null);
  } }, /* @__PURE__ */ React.createElement(FiX, { size: 14 }))), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-exact-btn-inside-search",
      onClick: handleInsideSearch,
      disabled: isSearchingInside || !insideSearchQuery.trim() || !selectedPatient
    },
    isSearchingInside ? "Searching..." : "Search Inside"
  )), insideSearchMessage && /* @__PURE__ */ React.createElement("div", { className: "cca-inside-search-msg" }, insideSearchMessage), insideSearchResults.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-exact-inside-results-fixed" }, insideSearchResults.map((res, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, className: "cca-inside-result-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-inside-result-header" }, /* @__PURE__ */ React.createElement("span", { className: "cca-inside-res-docname" }, "\u{1F4C4} ", res.reportName), /* @__PURE__ */ React.createElement("span", { className: "cca-inside-res-page" }, "Page ", res.pageNumber || 1)), /* @__PURE__ */ React.createElement("div", { className: "cca-inside-res-match" }, '"...', res.match, '..."'))))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card cca-exact-compare-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-header no-border" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-card-title" }, /* @__PURE__ */ React.createElement("span", { className: "cca-exact-card-icon orange" }, "\u{1F4CA}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Compare Reports"), /* @__PURE__ */ React.createElement("span", { className: "cca-sec-pill orange" }, "Biomarker Trends"))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-compare-controls-row" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "cca-exact-compare-select",
      value: compareReport1,
      onChange: (e) => setCompareReport1(e.target.value),
      disabled: reports.length === 0
    },
    reports.length === 0 ? /* @__PURE__ */ React.createElement("option", { value: "" }, "No reports") : reports.map((r, i) => /* @__PURE__ */ React.createElement("option", { key: r._id || i, value: r.url || r._id }, r.fileName || r.name || `Report ${i + 1}`))
  ), /* @__PURE__ */ React.createElement("span", { className: "cca-vs-text" }, "vs"), /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "cca-exact-compare-select",
      value: compareReport2,
      onChange: (e) => setCompareReport2(e.target.value),
      disabled: reports.length === 0
    },
    reports.length === 0 ? /* @__PURE__ */ React.createElement("option", { value: "" }, "No reports") : reports.map((r, i) => /* @__PURE__ */ React.createElement("option", { key: r._id || i, value: r.url || r._id }, r.fileName || r.name || `Report ${i + 1}`))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-exact-btn-compare",
      onClick: handleCompare,
      disabled: isComparing || isExhausted || reports.length < 2,
      title: reports.length < 2 ? "Need at least 2 reports to compare" : isExhausted ? "AI Credits Exhausted" : "Compare Reports"
    },
    /* @__PURE__ */ React.createElement("span", null, "\u26A1"),
    " ",
    isComparing ? "Comparing..." : "Compare"
  ))), compareError && /* @__PURE__ */ React.createElement("div", { className: "cca-summary-error-banner", style: { margin: "10px 0 0 0" } }, /* @__PURE__ */ React.createElement(FiAlertCircle, null), " ", compareError), comparisonResult && /* @__PURE__ */ React.createElement("div", { className: "cca-exact-comparison-results-fixed" }, comparisonResult.OverallChange && /* @__PURE__ */ React.createElement("div", { className: "cca-comp-overall" }, /* @__PURE__ */ React.createElement("strong", null, "Overall Assessment:"), " ", comparisonResult.OverallChange), /* @__PURE__ */ React.createElement("div", { className: "cca-comp-grid" }, Array.isArray(comparisonResult.ChangedFindings) && comparisonResult.ChangedFindings.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-comp-card changed" }, /* @__PURE__ */ React.createElement("h4", null, "\u26A1 Changed Values & Trends"), /* @__PURE__ */ React.createElement("ul", null, comparisonResult.ChangedFindings.map((cf, i) => /* @__PURE__ */ React.createElement("li", { key: i }, typeof cf === "string" ? cf : `${cf.parameter || cf.name}: ${cf.previousValue || ""} \u2794 ${cf.currentValue || ""} (${cf.significance || ""})`)))), Array.isArray(comparisonResult.NewFindings) && comparisonResult.NewFindings.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-comp-card new" }, /* @__PURE__ */ React.createElement("h4", null, "\u{1F50E} New Findings"), /* @__PURE__ */ React.createElement("ul", null, comparisonResult.NewFindings.map((nf, i) => /* @__PURE__ */ React.createElement("li", { key: i }, nf)))), Array.isArray(comparisonResult.StableFindings) && comparisonResult.StableFindings.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-comp-card stable" }, /* @__PURE__ */ React.createElement("h4", null, "\u2705 Stable Findings"), /* @__PURE__ */ React.createElement("ul", null, comparisonResult.StableFindings.map((sf, i) => /* @__PURE__ */ React.createElement("li", { key: i }, sf)))), Array.isArray(comparisonResult.ImportantObservations) && comparisonResult.ImportantObservations.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cca-comp-card observations" }, /* @__PURE__ */ React.createElement("h4", null, "\u{1F4A1} Important Observations"), /* @__PURE__ */ React.createElement("ul", null, comparisonResult.ImportantObservations.map((io, i) => /* @__PURE__ */ React.createElement("li", { key: i }, io))))))))), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-right-chat-col" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-card" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-header" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-title-group" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-bot-icon" }, "\u{1F916}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-head-row" }, /* @__PURE__ */ React.createElement("h4", null, "AI Assistant Chat"), /* @__PURE__ */ React.createElement("span", { className: "cca-exact-chat-live-badge" }, "Live Clinical Intelligence")), /* @__PURE__ */ React.createElement("p", { className: "cca-exact-chat-subtitle" }, "Get AI-driven insights and answers about this patient."))), /* @__PURE__ */ React.createElement("button", { className: "cca-exact-btn-clear-chat", onClick: handleClearChat }, /* @__PURE__ */ React.createElement(FiTrash2, { size: 13 }), " Clear Chat")), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-stream", "data-lenis-prevent": true }, chatMessages.map((msg, i) => /* @__PURE__ */ React.createElement(
    AIResponseRenderer,
    {
      key: i,
      content: msg.text,
      role: msg.role,
      timestamp: msg.timestamp
    }
  )), isChatLoading && /* @__PURE__ */ React.createElement(
    AIResponseRenderer,
    {
      role: "ai",
      isTyping: true,
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ), /* @__PURE__ */ React.createElement("div", { ref: chatEndRef })), /* @__PURE__ */ React.createElement("div", { className: "cca-chat-quick-chips", "data-lenis-prevent": true }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-quick-chip",
      onClick: () => handleChatSend("Iska ilaj kaise hoga? Give 2 to 3 standard evidence-based clinical treatment pathways and management options."),
      disabled: isChatLoading || isExhausted
    },
    "\u{1FA7A} Iska ilaj kaise hoga?"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-quick-chip",
      onClick: () => handleChatSend("Analyze all abnormal values in this report and highlight critical parameters."),
      disabled: isChatLoading || isExhausted
    },
    "\u26A0\uFE0F Abnormal Values"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-quick-chip",
      onClick: () => handleChatSend("Provide recommended follow-up diagnostic tests and diet/lifestyle guidelines."),
      disabled: isChatLoading || isExhausted
    },
    "\u{1F957} Follow-up & Diet"
  )), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-input-box" }, /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-input-row" }, /* @__PURE__ */ React.createElement("div", { className: "cca-chat-input-actions-left" }, /* @__PURE__ */ React.createElement("button", { className: "cca-chat-ico-btn", title: "Attach report / media" }, /* @__PURE__ */ React.createElement(FiPaperclip, { size: 17 })), /* @__PURE__ */ React.createElement("button", { className: "cca-chat-ico-btn", title: "Voice dictation" }, /* @__PURE__ */ React.createElement(FiMic, { size: 17 }))), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "cca-exact-chat-input",
      placeholder: isExhausted ? "AI Credits Exhausted \u2014 Contact Admin to recharge" : 'Ask anything about the patient, reports, or "Iska ilaj kaise hoga?"...',
      value: chatInput,
      onChange: (e) => setChatInput(e.target.value),
      onKeyDown: (e) => e.key === "Enter" && !isExhausted && handleChatSend(),
      disabled: isExhausted
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "cca-exact-btn-send",
      onClick: () => handleChatSend(),
      disabled: !chatInput.trim() || isChatLoading || isExhausted,
      title: isExhausted ? "AI Credits Exhausted" : "Send message"
    },
    /* @__PURE__ */ React.createElement(FiSend, { size: 15 })
  )), /* @__PURE__ */ React.createElement("div", { className: "cca-exact-chat-footer-disclaimer" }, /* @__PURE__ */ React.createElement("span", null, "\u2728 Medical365 AI"), " \u2022 Verified clinical algorithms. Please verify clinically."))))), previewDoc && /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-modal-overlay", onClick: () => setPreviewDoc(null) }, /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-modal", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-header" }, /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-title" }, /* @__PURE__ */ React.createElement("span", { className: "cca-doc-preview-icon" }, isImageMime(previewDoc.mimeType, previewDoc.url) ? "\u{1F5BC}\uFE0F" : "\u{1F4C4}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", null, previewDoc.fileName || previewDoc.name || "Medical Document Preview"), /* @__PURE__ */ React.createElement("span", null, previewDoc.docType || (isPdfMime(previewDoc.mimeType, previewDoc.url) ? "PDF Document" : "Medical Image")))), /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-actions" }, /* @__PURE__ */ React.createElement(
    "a",
    {
      href: previewDoc.url,
      target: "_blank",
      rel: "noreferrer",
      className: "cca-btn-preview-ext",
      title: "Open original file in new tab"
    },
    /* @__PURE__ */ React.createElement(FiExternalLink, { size: 14 }),
    " Open"
  ), /* @__PURE__ */ React.createElement("button", { className: "cca-btn-preview-close", onClick: () => setPreviewDoc(null) }, /* @__PURE__ */ React.createElement(FiX, { size: 18 })))), /* @__PURE__ */ React.createElement("div", { className: "cca-doc-preview-canvas", "data-lenis-prevent": true }, isImageMime(previewDoc.mimeType, previewDoc.url) ? /* @__PURE__ */ React.createElement(
    "img",
    {
      src: previewDoc.url,
      alt: "Medical Report",
      className: "cca-doc-preview-img"
    }
  ) : /* @__PURE__ */ React.createElement(
    "iframe",
    {
      src: previewDoc.url,
      title: "PDF Document Preview",
      className: "cca-doc-preview-iframe"
    }
  )))), isWalletOpen && /* @__PURE__ */ React.createElement("div", { className: "ai-modal-overlay", onClick: () => setIsWalletOpen(false) }, /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-modal", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-header" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "24px" } }, "\u{1F3E5}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0, fontSize: "18px", color: "#0f172a" } }, "Hospital AI Wallet & AI Credits"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "12px", color: "#64748b" } }, "Live budget and credit usage logs."))), /* @__PURE__ */ React.createElement("button", { className: "ai-tracker-close-btn", onClick: () => setIsWalletOpen(false) }, "\u2715")), /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-body", "data-lenis-prevent": true }, wallet && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-kpi-grid" }, /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-card" }, /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-title" }, "Available Balance"), /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-value", style: { color: statusInfo.color } }, "\u26A1 ", formatCredits(wallet.remainingAmount)), /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-sub" }, "Status: ", /* @__PURE__ */ React.createElement("strong", { style: { color: statusInfo.color } }, statusInfo.icon, " ", statusInfo.label))), /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-card" }, /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-title" }, "Used Credits"), /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-value" }, formatCredits(wallet.usedAmount)), /* @__PURE__ */ React.createElement("span", { className: "ai-tracker-card-sub" }, "Total Pool: ", formatCredits(wallet.budgetAmount || 2e3)))), /* @__PURE__ */ React.createElement("div", { className: "ai-tracker-table-container" }, /* @__PURE__ */ React.createElement("table", { className: "ai-tracker-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Time"), /* @__PURE__ */ React.createElement("th", null, "Operation"), /* @__PURE__ */ React.createElement("th", null, "Tokens"), /* @__PURE__ */ React.createElement("th", null, "Credits Used"))), /* @__PURE__ */ React.createElement("tbody", null, walletLogs.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "4", style: { textAlign: "center", color: "#64748b", padding: "20px" } }, "No AI requests recorded yet.")) : walletLogs.map((log) => /* @__PURE__ */ React.createElement("tr", { key: log._id }, /* @__PURE__ */ React.createElement("td", { style: { color: "#64748b" } }, new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), /* @__PURE__ */ React.createElement("td", null, log.operation || "CLINICAL_CHAT"), /* @__PURE__ */ React.createElement("td", null, log.totalTokens || 0), /* @__PURE__ */ React.createElement("td", { style: { color: "#6366f1", fontWeight: 600 } }, "\u26A1 ", (log.actualApiCost || log.estimatedCostInr || 0).toFixed(2), " Credits")))))))))));
};
export default AIAssistant;
