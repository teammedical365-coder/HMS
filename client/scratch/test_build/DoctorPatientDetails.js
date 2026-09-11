import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { confirmToast } from "../../utils/confirmToast";
import { doctorAPI, labTestAPI, questionLibraryAPI, hospitalAPI, patientAPI, receptionAPI, otAPI, adminEntitiesAPI, referralAPI, publicAPI } from "../../utils/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./DoctorPatientDetails.css";
import DynamicQuestionForm from "../../components/DynamicQuestionForm";
import { useAuth } from "../../store/hooks";
import AppointmentReports from "../../components/AppointmentReports";
import DoctorIPDOrdersPanel from "../../components/ipd/DoctorIPDOrdersPanel";
const doseOptions = [
  "OD \u2013 Once Daily",
  "BD \u2013 Twice Daily",
  "TDS \u2013 Three Times Daily",
  "QID \u2013 Four Times Daily",
  "OM \u2013 Every Morning",
  "ON \u2013 Every Night",
  "QOD \u2013 Every Alternate Day",
  "OW \u2013 Once Weekly",
  "SOS \u2013 As Needed"
];
const timingOptions = [
  "Before Breakfast (BBF)",
  "After Breakfast (ABF)",
  "Before Lunch (BL)",
  "After Lunch (AL)",
  "Before Dinner (BDN)",
  "After Dinner (ADN)",
  "Before Meals (AC)",
  "After Meals (PC)",
  "With Food",
  "On Empty Stomach",
  "At Bedtime (HS)"
];
const DoctorPatientDetails = () => {
  const { id } = useParams();
  const location = useLocation();
  const [appointmentId, setAppointmentId] = useState(location.state?.appointmentId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const roleName = user?._roleData?.name?.toLowerCase() || (typeof user?.role === "string" ? user.role.toLowerCase() : "");
  const isJrDoctor = roleName.includes("jr") && roleName.includes("doctor");
  const [medSearch, setMedSearch] = useState("");
  const [appointment, setAppointment] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogTests, setCatalogTests] = useState([]);
  const [catalogMedicines, setCatalogMedicines] = useState([]);
  const [dynamicLibrary, setDynamicLibrary] = useState(null);
  const [hospitalDepartments, setHospitalDepartments] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [hospitalContext, setHospitalContext] = useState(null);
  const [toast2, setToast] = useState({ show: false, message: "", title: "" });
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(null);
  const [operationRequired, setOperationRequired] = useState(false);
  const [showSurgeryPlanModal, setShowSurgeryPlanModal] = useState(false);
  const [surgeonsList, setSurgeonsList] = useState([]);
  const [surgeryPlanData, setSurgeryPlanData] = useState({
    surgery: "",
    diagnosis: "",
    surgeonId: "",
    preferredDate: "",
    preferredTime: "",
    admissionRequired: false,
    admissionDate: "",
    preOpRequired: false,
    notes: ""
  });
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralData, setReferralData] = useState({ referredToDoctorId: "", reason: "", notes: "" });
  const [patientReferrals, setPatientReferrals] = useState([]);
  const [showReferralReviewModal, setShowReferralReviewModal] = useState(false);
  const [activeReferralForReview, setActiveReferralForReview] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [viewingPastSession, setViewingPastSession] = useState(null);
  const [sessionData, setSessionData] = useState({
    diagnosis: "",
    notes: "",
    medicines: [],
    labTests: ""
  });
  const [intakeData, setIntakeData] = useState({});
  const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);
  const tabsRef = useRef(null);
  const handleTabsWheel = (e) => {
    if (tabsRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        tabsRef.current.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    }
  };
  const scrollTabs = (dir) => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
    }
  };
  useEffect(() => {
    const el = tabsRef.current;
    if (el) {
      el.addEventListener("wheel", handleTabsWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener("wheel", handleTabsWheel);
    };
  }, []);
  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        let currentApptId = appointmentId || location.state?.appointmentId;
        let refObj = location.state?.referral || null;
        if (location.state?.referralId && !refObj) {
          try {
            const refRes = await referralAPI.getById(location.state.referralId);
            if (refRes.success && refRes.referral) {
              refObj = refRes.referral;
            }
          } catch (e) {
            console.error("Error fetching referral by ID", e);
          }
        }
        if (refObj) {
          setActiveReferralForReview(refObj);
          if (!currentApptId && refObj.appointmentId) {
            currentApptId = typeof refObj.appointmentId === "object" ? refObj.appointmentId._id : refObj.appointmentId;
          }
          setSurgeryPlanData((prev) => ({
            ...prev,
            surgery: refObj.reason || prev.surgery,
            diagnosis: refObj.notes || prev.diagnosis
          }));
        }
        if (!currentApptId && id) {
          try {
            const apptsRes = await doctorAPI.getAllAppointments().catch(() => null) || await doctorAPI.getAppointments().catch(() => null);
            if (apptsRes && apptsRes.success) {
              const ptAppts = (apptsRes.appointments || []).filter(
                (a) => a.userId?.patientId === id || a.clinicPatientId?.patientUid === id || a.patientId === id || a.userId?._id && a.userId._id.toString() === id.toString() || (a.userId?.name || "").replace(/\s+/g, "-") === id || (a.clinicPatientId?.name || "").replace(/\s+/g, "-") === id || a._id === id
              );
              if (ptAppts.length > 0) {
                currentApptId = ptAppts[0]._id;
                setAppointmentId(currentApptId);
              }
            }
          } catch (e) {
            console.error("Error finding appointment", e);
          }
        }
        if (currentApptId) {
          const res = await doctorAPI.getAppointmentDetails(currentApptId);
          if (res.success && res.appointment) {
            setAppointment(res.appointment);
            const cp = res.appointment.clinicPatientId || {};
            const fert = res.appointment.userId?.fertilityProfile || {};
            setIntakeData({
              ...cp,
              ...fert,
              ...cp.vitals || {},
              age: cp.age || fert.age || res.appointment.userId?.age || "",
              gender: cp.gender || fert.gender || res.appointment.userId?.gender || "",
              bloodGroup: cp.bloodGroup || fert.bloodGroup || "",
              address: cp.address || fert.address || "",
              allergies: cp.allergies || fert.allergies || "",
              chronicConditions: cp.chronicConditions || fert.chronicConditions || ""
            });
            if (res.appointment.status === "completed") {
              setIsLocked(true);
              setToast({
                show: true,
                title: "\u2705 Session Completed Successfully",
                message: "This consultation has already been completed. This record is now read-only."
              });
              setTimeout(() => {
                setToast((prev) => ({ ...prev, show: false }));
              }, 3e3);
            }
            const pId = res.appointment.clinicPatientId?._id || res.appointment.clinicPatientId || res.appointment.userId?._id;
            const deptContext = res.appointment.department || res.appointment.serviceName || "Unassigned";
            if (pId) {
              const histRes = await doctorAPI.getPatientHistory(pId, deptContext);
              if (histRes.success) setHistory(histRes.history || histRes.data || []);
              try {
                const fRes = await receptionAPI.getFollowupStatus(pId, "auto");
                if (fRes.success) setCurrentFollowupStatus(fRes);
              } catch (e) {
                console.error("Error fetching follow-up", e);
              }
            }
            setSessionData({
              diagnosis: res.appointment.diagnosis || "",
              notes: res.appointment.doctorNotes || "",
              medicines: (res.appointment.pharmacy || []).map((p) => ({
                medicineName: p.medicineName || "",
                saltName: p.saltName || "",
                dose: p.frequency || "",
                days: p.duration || ""
              })),
              labTests: (res.appointment.labTests || []).join(", ")
            });
            if (res.departments) {
              setHospitalDepartments(res.departments);
            }
            setLoading(false);
            return;
          }
        }
        const targetPatientId = refObj?.patientId?._id || (typeof refObj?.patientId === "string" ? refObj.patientId : null) || id;
        if (targetPatientId) {
          try {
            const profRes = await doctorAPI.getFullPatientProfile(targetPatientId).catch(() => null) || await patientAPI.getPatient(targetPatientId).catch(() => null);
            if (profRes && (profRes.patient || profRes.user)) {
              const pt = profRes.patient || profRes.user;
              const loggedUser = JSON.parse(localStorage.getItem("user") || "{}");
              const fallbackAppt = {
                _id: "session-" + (pt._id || targetPatientId),
                patientId: pt.patientId || pt.mrn || targetPatientId,
                userId: pt,
                doctorName: loggedUser.name || "Doctor",
                status: "in-progress",
                serviceName: refObj ? "Surgery Referral Consultation" : "Doctor Consultation",
                appointmentDate: /* @__PURE__ */ new Date(),
                appointmentTime: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              };
              setAppointment(fallbackAppt);
              const cp = pt.fertilityProfile || {};
              setIntakeData({
                ...cp,
                ...cp.vitals || {},
                age: pt.age || cp.age || "",
                gender: pt.gender || cp.gender || "",
                bloodGroup: pt.bloodGroup || cp.bloodGroup || "",
                address: pt.address || cp.address || "",
                allergies: pt.allergies || cp.allergies || "",
                chronicConditions: pt.chronicConditions || cp.chronicConditions || ""
              });
              if (profRes.appointments) {
                setHistory(profRes.appointments);
              }
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error("Error loading fallback profile", e);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
      try {
        const testRes = await labTestAPI.getLabTests();
        if (testRes.success) {
          setCatalogTests(testRes.data || []);
        }
      } catch (err) {
        console.error("Error fetching lab test catalog", err);
      }
      try {
        const medRes = await doctorAPI.getMedicines();
        if (medRes.success) {
          setCatalogMedicines(medRes.medicines || []);
        }
      } catch (err) {
        console.error("Error fetching pharmacy inventory", err);
      }
      try {
        const libRes = await questionLibraryAPI.getLibrary();
        if (libRes.success && libRes.data && libRes.data.data) {
          setDynamicLibrary(libRes.data.data);
        }
      } catch (err) {
        console.error("Error fetching dynamic question library", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
    const fetchHospital = async () => {
      try {
        const res = await hospitalAPI.getMyHospital();
        if (res.success) setHospitalContext(res.hospital);
      } catch (err) {
      }
    };
    fetchHospital();
    const fetchSurgeons = async () => {
      try {
        const hospitalId = user?.hospitalId || appointment?.hospitalId || "";
        const res = await publicAPI.getDoctors(null, hospitalId || null);
        let docs = (res.doctors || res.data || []).slice();
        const currentDocId = user?._id || user?.id;
        if (currentDocId && !docs.some((d) => (d.userId?._id || d.userId || d._id)?.toString() === currentDocId?.toString())) {
          docs.push({
            _id: currentDocId,
            userId: currentDocId,
            name: user.name || "Current Doctor",
            specialty: user.specialty || ""
          });
        }
        setSurgeonsList(docs);
      } catch (err) {
        console.error("fetchSurgeons error:", err);
        const currentDocId = user?._id || user?.id;
        if (currentDocId) {
          setSurgeonsList([{
            _id: currentDocId,
            userId: currentDocId,
            name: user.name || "Current Doctor",
            specialty: user.specialty || ""
          }]);
        }
      }
    };
    fetchSurgeons();
  }, [appointmentId, user, appointment?.hospitalId]);
  useEffect(() => {
    const fetchPatientReferrals = async () => {
      try {
        const pid = appointment?.clinicPatientId?._id || appointment?.userId?._id || appointment?.patientId;
        if (!pid) return;
        const res = await referralAPI.getPatientReferrals(pid);
        if (res.success) setPatientReferrals(res.referrals || []);
      } catch (err) {
      }
    };
    if (appointment) fetchPatientReferrals();
  }, [appointment]);
  const handleIntakeChange = (e) => {
    const { name, value } = e.target;
    if (name === "height" || name === "weight") {
      const h = name === "height" ? value : intakeData.height;
      const w = name === "weight" ? value : intakeData.weight;
      if (h && w) {
        const hM = parseFloat(h) / 100;
        const bmi = (parseFloat(w) / (hM * hM)).toFixed(2);
        setIntakeData((prev) => ({ ...prev, [name]: value, bmi }));
        return;
      }
    }
    setIntakeData((prev) => ({ ...prev, [name]: value }));
  };
  const handleSessionChange = (e) => {
    if (isLocked) return;
    setSessionData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleCreateReferral = async (e) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        patientId: appointment?.userId?._id || appointment?.patientId || intakeData?.userId,
        appointmentId: appointment?._id,
        referredToDoctorId: referralData.referredToDoctorId,
        reason: referralData.reason,
        notes: referralData.notes
      };
      const res = await referralAPI.create(dataToSubmit);
      if (res.success) {
        toast2.success("Referral created successfully!");
        setShowReferralModal(false);
        setReferralData({ referredToDoctorId: "", reason: "", notes: "" });
        const pid = appointment?.userId?._id || appointment?.patientId;
        if (pid) {
          const refRes = await referralAPI.getPatientReferrals(pid);
          if (refRes.success) setPatientReferrals(refRes.referrals || []);
        }
      }
    } catch (err) {
      toast2.error(err.response?.data?.message || "Error creating referral");
    }
  };
  const handleReviewReferral = async (referralId, status, reviewNotes) => {
    try {
      const res = await referralAPI.review(referralId, { status, reviewNotes });
      if (res.success) {
        toast2.success(`Referral ${status.toLowerCase()} successfully!`);
        setShowReferralReviewModal(false);
        setActiveReferralForReview(null);
        const pid = appointment?.userId?._id || appointment?.patientId;
        if (pid) {
          const refRes = await referralAPI.getPatientReferrals(pid);
          if (refRes.success) setPatientReferrals(refRes.referrals || []);
        }
      }
    } catch (err) {
      toast2.error(err.response?.data?.message || "Error reviewing referral");
    }
  };
  const handleCreateSurgeryPlan = async (e) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        ...surgeryPlanData,
        patientId: appointment?.userId?._id || appointment?.patientId || intakeData?.userId,
        appointmentId: appointment?._id,
        referralId: surgeryPlanData.referralId || void 0,
        referringDoctorId: surgeryPlanData.referringDoctorId || void 0
      };
      const res = await otAPI.createSurgeryPlan(dataToSubmit);
      if (res.success) {
        toast2.success("Surgery Plan created successfully!");
        setShowSurgeryPlanModal(false);
        setOperationRequired(false);
        setSurgeryPlanData({
          surgery: "",
          diagnosis: "",
          surgeonId: "",
          preferredDate: "",
          preferredTime: "",
          admissionRequired: false,
          admissionDate: "",
          preOpRequired: false,
          notes: ""
        });
      }
    } catch (err) {
      toast2.error(err.response?.data?.message || "Error creating surgery plan");
    }
  };
  const handleSaveProfile = async () => {
    const patientId = appointment?.clinicPatientId?._id || appointment?.userId?._id;
    if (!patientId) return;
    setSaving(true);
    try {
      await doctorAPI.updatePatientProfile(patientId, intakeData);
      toast2.success("Patient profile saved successfully!");
    } catch (err) {
      toast2.error("Error saving profile: " + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndMerge = async () => {
    if (!await confirmToast("Save all changes and finish session?", { title: "Finish Consultation", danger: false, confirmText: "Save & Finish" })) return;
    setSaving(true);
    try {
      const patientId = appointment?.clinicPatientId?._id || appointment?.userId?._id;
      if (patientId) {
        await doctorAPI.updatePatientProfile(patientId, intakeData);
      }
      const payload = {
        status: "completed",
        diagnosis: sessionData.diagnosis,
        notes: sessionData.notes,
        labTests: sessionData.labTests.split(",").map((s) => s.trim()).filter(Boolean),
        pharmacy: (sessionData.medicines || []).filter((m) => m.medicineName?.trim()).map((m) => ({
          medicineName: m.medicineName?.trim() || "",
          saltName: m.saltName?.trim() || "",
          frequency: m.dose?.trim() || "",
          duration: m.days?.trim() || ""
        }))
      };
      await doctorAPI.updateSession(appointmentId, payload);
      setIsLocked(true);
      if (await confirmToast("Consultation Completed. Do you want to transition to the Reception Desk to Admit/Hospitalize this patient?", { title: "Admit Patient?", danger: false, confirmText: "Go to Reception", cancelText: "Stay Here" })) {
        const patientData = appointment?.userId || appointment?.clinicPatientId || appointment;
        navigate("/reception/dashboard?view=intake", { state: { patient: patientData } });
        return;
      } else {
        toast2.success("Consultation completed successfully!");
      }
      setAppointment((prev) => ({
        ...prev,
        status: "completed",
        diagnosis: sessionData.diagnosis,
        doctorNotes: sessionData.notes,
        labTests: payload.labTests,
        pharmacy: payload.pharmacy,
        vitals: {
          ...prev?.vitals,
          weight: intakeData.weight || prev?.vitals?.weight || "",
          height: intakeData.height || prev?.vitals?.height || "",
          bmi: intakeData.bmi || prev?.vitals?.bmi || "",
          bp: intakeData.historyBp || intakeData.bp || intakeData.bloodPressure || prev?.vitals?.bp || "",
          pulse: intakeData.historyPulse || intakeData.pulse || intakeData.pulseRate || prev?.vitals?.pulse || "",
          temperature: intakeData.temperature || intakeData.temp || prev?.vitals?.temperature || "",
          spo2: intakeData.spo2 || prev?.vitals?.spo2 || "",
          rr: intakeData.respiratoryRate || intakeData.rr || prev?.vitals?.rr || ""
        }
      }));
      const pdf = generatePrescriptionPDF(false);
      setPendingDownload({
        doc: pdf.doc,
        filename: pdf.filename,
        title: "Prescription",
        navigateOnClose: true
      });
    } catch (err) {
      toast2.error("Error: " + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };
  const generateCumulativePDF = (intake, pastHistory, currentData) => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text(hospitalContext?.name || "HOSPITAL", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(hospitalContext?.tagline || "Excellence in Healthcare", 105, y, { align: "center" });
    y += 15;
    doc.setLineWidth(0.5);
    doc.setDrawColor(200);
    doc.line(10, y, 200, y);
    y += 10;
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text("CLINICAL RECORD / PRESCRIPTION", 105, y, { align: "center" });
    y += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y, 182, 42, "F");
    doc.setFontSize(11);
    const cardX = 20;
    let cardY = y + 8;
    doc.setFont("helvetica", "bold");
    doc.text(`Patient Name:`, cardX, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`${intake.firstName || appointment.userId?.name || ""} ${intake.lastName || ""}`, cardX + 30, cardY);
    doc.setFont("helvetica", "bold");
    doc.text(`MRN / ID:`, cardX + 100, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`${appointment.userId?.patientId || "N/A"}`, cardX + 130, cardY);
    cardY += 8;
    doc.setFont("helvetica", "bold");
    doc.text(`Age / Gender:`, cardX, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`${intake.age || "-"} / ${intake.gender || "-"}`, cardX + 30, cardY);
    doc.setFont("helvetica", "bold");
    doc.text(`Date:`, cardX + 100, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`${(/* @__PURE__ */ new Date()).toLocaleDateString()}`, cardX + 130, cardY);
    cardY += 8;
    doc.setFont("helvetica", "bold");
    doc.text(`Contact:`, cardX, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`${appointment.userId?.phone || "-"}`, cardX + 30, cardY);
    doc.setFont("helvetica", "bold");
    doc.text(`Doctor:`, cardX + 100, cardY);
    doc.setFont("helvetica", "normal");
    doc.text(`Dr. ${appointment.doctorName || user?.name || "-"}`, cardX + 130, cardY);
    y += 50;
    const dynamicEntries = Object.entries(intake).filter(
      ([key, val]) => key !== "_id" && key !== "createdAt" && key !== "updatedAt" && key !== "__v" && typeof val !== "object" && val !== ""
    ).map(([key, val]) => [key, String(val)]);
    if (dynamicEntries.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Clinical Questionnaire", "Response"]],
        body: dynamicEntries,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        columnStyles: { 0: { fontStyle: "bold", width: 80 } }
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    if (pastHistory.length > 0) {
      doc.setFillColor(220, 240, 255);
      doc.rect(14, y, 180, 8, "F");
      doc.text("PAST SESSIONS", 16, y + 6);
      y += 12;
      const rows = pastHistory.filter((h) => h.status === "completed" && h._id !== appointmentId).map((h) => [
        new Date(h.appointmentDate).toLocaleDateString(),
        h.diagnosis || "-",
        h.doctorNotes || "-"
      ]);
      if (rows.length > 0) {
        autoTable(doc, { startY: y, head: [["Date", "Diagnosis", "Notes"]], body: rows });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(200, 255, 200);
    doc.rect(14, y, 180, 8, "F");
    doc.text(`CURRENT SESSION: ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`, 16, y + 6);
    y += 12;
    doc.setFontSize(10);
    doc.text(`Diagnosis: ${currentData.diagnosis}`, 16, y);
    y += 10;
    doc.text("Notes:", 16, y);
    y += 6;
    const notes = doc.splitTextToSize(currentData.notes, 170);
    doc.text(notes, 16, y);
    y += notes.length * 5 + 10;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Prescription / Medicines:", 16, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rxItems = currentData.pharmacy || [];
    if (rxItems.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "Medicine Name", "Salt / Generic", "Dose / Frequency", "Days"]],
        body: rxItems.map((p, i) => [i + 1, p.medicineName, p.saltName || "-", p.frequency || "-", p.duration || "-"]),
        theme: "striped",
        headStyles: { fillColor: [76, 175, 80], textColor: 255 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.text("No medicines prescribed.", 16, y);
      y += 8;
    }
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Lab Tests Ordered:", 16, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const labItems = currentData.labTests || [];
    if (labItems.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "Test Name"]],
        body: labItems.map((t, i) => [i + 1, t]),
        theme: "striped",
        headStyles: { fillColor: [33, 150, 243], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.text("No lab tests ordered.", 16, y);
      y += 8;
    }
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(200);
    doc.line(14, y, 196, y);
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Doctor: Dr. ${appointment.doctorName || user?.name || "N/A"}`, 16, y);
    doc.text(`Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()}`, 130, y);
    doc.save("Patient_Record.pdf");
  };
  const generatePrescriptionPDF = (shouldSave = true) => {
    const pt = patient;
    const prof = profile;
    const doc = new jsPDF();
    const hName = hospitalContext?.name || "HOSPITAL";
    const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(", ");
    const hPhone = hospitalContext?.phone || "";
    let y = 18;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(hName, 105, y, { align: "center" });
    y += 7;
    if (hAddr) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(hAddr, 105, y, { align: "center" });
      y += 5;
    }
    if (hPhone) {
      doc.text(`Ph: ${hPhone}`, 105, y, { align: "center" });
      y += 5;
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(76, 175, 80);
    doc.text("PRESCRIPTION SLIP", 105, y, { align: "center" });
    y += 5;
    doc.setDrawColor(76, 175, 80);
    doc.setLineWidth(0.5);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      body: [
        ["Patient", pt.name || "-", "MRN", pt.patientId || "N/A"],
        ["Age / Gender", `${profile?.age || "-"} / ${profile?.gender || "-"}`, "Phone", pt.phone || "-"],
        ["Doctor", `Dr. ${appointment?.doctorName || user?.name || "-"}`, "Date", (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN")],
        ["Diagnosis", appointment?.diagnosis || sessionData.diagnosis || "-", "", ""]
      ],
      theme: "grid",
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 38 },
        2: { fontStyle: "bold", cellWidth: 28 }
      },
      bodyStyles: { fontSize: 10 }
    });
    y = doc.lastAutoTable.finalY + 10;
    const rxItems = sessionData.medicines?.length > 0 ? sessionData.medicines.filter((m) => m.medicineName?.trim()) : (appointment?.pharmacy || []).map((p) => ({ medicineName: p.medicineName, saltName: p.saltName || "", dose: p.frequency || "", days: p.duration || "" }));
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(33, 37, 41);
    doc.text("Medicines Prescribed", 14, y);
    y += 6;
    if (rxItems.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "Medicine Name", "Salt / Generic", "Dose / Frequency", "Days"]],
        body: rxItems.map((m, i) => [i + 1, m.medicineName || "-", m.saltName || "-", m.dose || "-", m.days || "-"]),
        theme: "striped",
        headStyles: { fillColor: [76, 175, 80], textColor: 255 },
        bodyStyles: { fontSize: 10 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("No medicines prescribed.", 16, y);
      y += 8;
    }
    const labItems = sessionData.labTests ? sessionData.labTests.split(",").map((t) => t.trim()).filter(Boolean) : appointment?.labTests || [];
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(33, 37, 41);
    doc.text("Lab Tests Ordered", 14, y);
    y += 6;
    if (labItems.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "Test Name"]],
        body: labItems.map((t, i) => [i + 1, t]),
        theme: "striped",
        headStyles: { fillColor: [33, 150, 243], textColor: 255 },
        bodyStyles: { fontSize: 10 }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("No lab tests ordered.", 16, y);
      y += 8;
    }
    if (sessionData.notes || appointment?.doctorNotes) {
      const notesText = sessionData.notes || appointment?.doctorNotes || "";
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(33, 37, 41);
      doc.text("Clinical Notes", 14, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60);
      const wrapped = doc.splitTextToSize(notesText, 170);
      doc.text(wrapped, 16, y);
      y += wrapped.length * 5 + 8;
    }
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(200);
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || "N/A"}`, 14, y);
    doc.text(`Generated: ${(/* @__PURE__ */ new Date()).toLocaleString("en-IN")}`, 196, y, { align: "right" });
    y += 5;
    doc.setFontSize(8);
    doc.text("This prescription is valid for 30 days from the date of issue.", 105, y, { align: "center" });
    const filename = `Prescription_${pt.patientId || "Patient"}_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.pdf`;
    if (shouldSave) {
      doc.save(filename);
    }
    return { doc, filename };
  };
  const generateReceiptPDF = () => {
    const pt = patient;
    const doc = new jsPDF();
    const hName = hospitalContext?.name || "HOSPITAL";
    const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(", ");
    const hPhone = hospitalContext?.phone || "";
    const hEmail = hospitalContext?.email || "";
    let y = 18;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(hName, 105, y, { align: "center" });
    y += 7;
    if (hAddr) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(hAddr, 105, y, { align: "center" });
      y += 5;
    }
    if (hPhone || hEmail) {
      const contact = [hPhone && `Ph: ${hPhone}`, hEmail && `Email: ${hEmail}`].filter(Boolean).join("  |  ");
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(contact, 105, y, { align: "center" });
      y += 5;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 128, 185);
    doc.text("Consultation Receipt", 105, y, { align: "center" });
    y += 5;
    doc.setDrawColor(41, 128, 185);
    doc.setLineWidth(0.5);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    const dateDisplay = new Date(appointment?.appointmentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    autoTable(doc, {
      startY: y,
      body: [
        ["Patient Name", pt.name || "-"],
        ["MRN / ID", pt.patientId || "N/A"],
        ["Phone", pt.phone || "-"],
        ["Doctor", `Dr. ${appointment?.doctorName || user?.name || "-"}`],
        ["Date & Time", `${dateDisplay} @ ${appointment?.appointmentTime || "-"}`],
        ["Service", appointment?.serviceName || "Consultation"],
        ["Consultation Fee", `Rs. ${Number(appointment?.amount || 0).toLocaleString("en-IN")}`],
        ["Payment Method", appointment?.paymentMethod || "Cash"],
        ["Payment Status", (appointment?.paymentStatus || "Paid").toUpperCase() + " \u2713"]
      ],
      theme: "grid",
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 52 } },
      bodyStyles: { fontSize: 10 },
      alternateRowStyles: { fillColor: [245, 249, 255] }
    });
    y = doc.lastAutoTable.finalY + 10;
    doc.setDrawColor(200);
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || "N/A"}`, 14, y);
    doc.text(`Generated: ${(/* @__PURE__ */ new Date()).toLocaleString("en-IN")}`, 196, y, { align: "right" });
    y += 5;
    doc.text(`Thank you for choosing ${hName}`, 105, y, { align: "center" });
    doc.save(`Receipt_${pt.patientId || "Patient"}.pdf`);
  };
  if (loading) {
    return /* @__PURE__ */ React.createElement("div", { className: "dpd-loading" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-spinner" }), /* @__PURE__ */ React.createElement("p", null, "Loading patient data..."));
  }
  if (!appointment) {
    return /* @__PURE__ */ React.createElement("div", { className: "dpd-loading" }, /* @__PURE__ */ React.createElement("p", null, "\u274C Appointment not found."), /* @__PURE__ */ React.createElement("button", { onClick: () => navigate("/doctor/patients"), className: "dpd-back-btn" }, "\u2190 Back to Dashboard"));
  }
  const rawPatient = appointment.userId || {};
  const clinicPatient = appointment.clinicPatientId || {};
  let calculatedAge = "";
  const dobVal = clinicPatient.dob || rawPatient.dob;
  if (dobVal) {
    const ageDifMs = Date.now() - new Date(dobVal).getTime();
    const ageDate = new Date(ageDifMs);
    calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970).toString();
  }
  const patient = {
    ...rawPatient,
    name: clinicPatient.name || rawPatient.name || "Unknown Patient",
    patientId: clinicPatient.patientUid || rawPatient.patientId || "N/A",
    phone: clinicPatient.phone || rawPatient.phone || "-",
    email: clinicPatient.email || rawPatient.email || "-",
    address: clinicPatient.address || rawPatient.address || "-"
  };
  const rawProfile = rawPatient.fertilityProfile || intakeData || {};
  const profile = {
    ...rawProfile,
    age: clinicPatient.age || calculatedAge || rawProfile.age || "-",
    gender: clinicPatient.gender || rawProfile.gender || "-",
    bloodGroup: clinicPatient.bloodGroup || rawProfile.bloodGroup || "-",
    height: clinicPatient.vitals?.height || clinicPatient.height || rawProfile.height || "-",
    weight: clinicPatient.vitals?.weight || clinicPatient.weight || rawProfile.weight || "-",
    bmi: clinicPatient.vitals?.bmi || clinicPatient.bmi || rawProfile.bmi || "-",
    chiefComplaint: clinicPatient.chiefComplaint || rawProfile.chiefComplaint || "-",
    reasonForVisit: clinicPatient.reasonForVisit || rawProfile.reasonForVisit || "-",
    partnerFirstName: clinicPatient.partnerFirstName || rawProfile.partnerFirstName || "",
    partnerLastName: clinicPatient.partnerLastName || rawProfile.partnerLastName || "",
    partnerMobile: clinicPatient.partnerMobile || rawProfile.partnerMobile || "",
    partnerAge: clinicPatient.partnerAge || rawProfile.partnerAge || rawProfile.husbandAge || "",
    partnerBloodGroup: clinicPatient.partnerBloodGroup || rawProfile.partnerBloodGroup || "",
    allergies: clinicPatient.allergies || rawProfile.allergies || "-",
    chronicConditions: clinicPatient.chronicConditions || rawProfile.chronicConditions || "-"
  };
  const tabs = [
    { id: "overview", label: "Overview", icon: "\u{1F4CB}" },
    { id: "ipd_orders", label: "IPD / Admission Orders", icon: "\u{1F3E5}" },
    { id: "history", label: "Past Visits", icon: "\u{1F4DC}" },
    { id: "reports", label: "Reports & Files", icon: "\u{1F4C1}" }
  ];
  let dynamicTabs = [];
  if (dynamicLibrary) {
    const docDept = user?.department || user?._roleData?.department || "";
    const apptDept = appointment?.department || appointment?.serviceName || "";
    let targetDept = docDept || apptDept || "";
    const normalizedTarget = targetDept.toLowerCase().trim();
    const isGeneral = !normalizedTarget || normalizedTarget.includes("general") || normalizedTarget === "unassigned";
    let allowedDepts = [];
    if (isGeneral) {
      const generalMatch = Object.keys(dynamicLibrary).find((d) => d.toLowerCase() === "general" || d.toLowerCase() === "general medicine");
      if (generalMatch) allowedDepts.push(generalMatch);
    } else {
      const exactMatch = Object.keys(dynamicLibrary).find((d) => d.toLowerCase() === normalizedTarget);
      if (exactMatch) {
        allowedDepts.push(exactMatch);
      } else {
        const partialMatch = Object.keys(dynamicLibrary).find(
          (d) => d.toLowerCase().includes(normalizedTarget) || normalizedTarget.includes(d.toLowerCase())
        );
        if (partialMatch) allowedDepts.push(partialMatch);
      }
      if (allowedDepts.length === 0) {
        const generalMatch = Object.keys(dynamicLibrary).find((d) => d.toLowerCase() === "general" || d.toLowerCase() === "general medicine");
        if (generalMatch) allowedDepts.push(generalMatch);
      }
    }
    allowedDepts.forEach((dept) => {
      if (dynamicLibrary[dept]) {
        Object.keys(dynamicLibrary[dept]).forEach((catKey, i) => {
          dynamicTabs.push({
            id: `dyn_${dept.replace(/\s/g, "")}_${i}`,
            label: `${dept} - ${catKey}`,
            icon: "\u{1F4CB}",
            data: dynamicLibrary[dept][catKey]
          });
        });
      }
    });
  }
  const allTabs = [...tabs, ...dynamicTabs];
  return /* @__PURE__ */ React.createElement("div", { className: "dpd-container", style: isJrDoctor ? { gridTemplateColumns: "1fr" } : {} }, /* @__PURE__ */ React.createElement("div", { className: "dpd-left" }, pendingDownload && /* @__PURE__ */ React.createElement("div", { style: {
    margin: "12px",
    padding: "12px 20px",
    background: "#ecfdf5",
    border: "1.5px solid #a7f3d0",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.05)",
    fontFamily: "var(--font-primary)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { color: "#065f46", fontWeight: 600, fontSize: "0.9rem" } }, "\u2705 ", pendingDownload.title || "Document Generated", " \u2014 ", pendingDownload.filename, " is ready"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        pendingDownload.doc.save(pendingDownload.filename);
        setPendingDownload(null);
        if (pendingDownload.navigateOnClose) navigate("/doctor/patients");
      },
      style: {
        padding: "8px 16px",
        background: "#059669",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontWeight: 700,
        fontSize: "0.8rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    },
    "\u{1F4E5} Download"
  )), /* @__PURE__ */ React.createElement("div", { className: "dpd-patient-header" }, /* @__PURE__ */ React.createElement("button", { className: "dpd-back-link", onClick: () => navigate("/doctor/patients") }, "\u2190 Back"), /* @__PURE__ */ React.createElement("div", { className: "dpd-patient-identity" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-patient-avatar" }, (patient.name || "P")[0].toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "dpd-patient-meta" }, /* @__PURE__ */ React.createElement("h2", null, patient.name || "Unknown Patient"), /* @__PURE__ */ React.createElement("div", { className: "dpd-patient-tags" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-tag tag-mrn" }, "MRN: ", patient.patientId || "N/A"), /* @__PURE__ */ React.createElement("span", { className: "dpd-tag tag-phone" }, "\u{1F4F1} ", patient.phone || "-"), profile.age && /* @__PURE__ */ React.createElement("span", { className: "dpd-tag tag-age" }, "Age: ", profile.age), profile.gender && /* @__PURE__ */ React.createElement("span", { className: "dpd-tag tag-gender" }, profile.gender), profile.bloodGroup && /* @__PURE__ */ React.createElement("span", { className: "dpd-tag tag-blood" }, profile.bloodGroup)))), /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-info" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-item" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-label" }, "Date"), /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-value" }, new Date(appointment.appointmentDate).toLocaleDateString("en-IN"))), /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-item" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-label" }, "Time"), /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-value" }, appointment.appointmentTime)), /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-item" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-label" }, "Status"), /* @__PURE__ */ React.createElement("span", { className: `dpd-appt-status status-${appointment.status}` }, appointment.status, " ", isLocked && "\u{1F512} Locked")), /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-item" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-label" }, "Service"), /* @__PURE__ */ React.createElement("span", { className: "dpd-appt-value" }, appointment.serviceName || "Consultation")), /* @__PURE__ */ React.createElement("div", { className: "dpd-appt-item", style: { alignSelf: "center", marginLeft: "auto" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "dpd-open-ai-btn",
      onClick: () => navigate("/doctor/ai-assistant", {
        state: { patientId: patient._id || id, appointmentId: appointmentId || appointment?._id }
      }),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 14px",
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        fontSize: "0.8rem",
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
        transition: "all 0.2s ease"
      },
      title: "Open AI Assistant & Scribe in Sidebar"
    },
    "\u{1F916} Open AI Assistant"
  )))), /* @__PURE__ */ React.createElement("div", { className: "dpd-tabs-container" }, /* @__PURE__ */ React.createElement("button", { className: "dpd-tab-scroll-btn", onClick: () => scrollTabs("left"), title: "Scroll Left" }, "\u2039"), /* @__PURE__ */ React.createElement("div", { className: "dpd-tabs-nav", ref: tabsRef }, allTabs.map((tab) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: tab.id,
      className: `dpd-tab-btn ${activeTab === tab.id ? "active" : ""}`,
      onClick: () => setActiveTab(tab.id)
    },
    /* @__PURE__ */ React.createElement("span", { className: "dpd-tab-icon" }, tab.icon),
    /* @__PURE__ */ React.createElement("span", { className: "dpd-tab-label" }, tab.label)
  ))), /* @__PURE__ */ React.createElement("button", { className: "dpd-tab-scroll-btn", onClick: () => scrollTabs("right"), title: "Scroll Right" }, "\u203A")), /* @__PURE__ */ React.createElement("div", { className: "dpd-tab-content" }, activeTab === "overview" && /* @__PURE__ */ React.createElement("div", { className: "dpd-tab-panel" }, /* @__PURE__ */ React.createElement("h3", { className: "dpd-panel-title" }, "\u{1F4CB} Patient Overview"), /* @__PURE__ */ React.createElement("div", { className: "dpd-overview-grid" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Full Name"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, patient.name || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Phone"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, patient.phone || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Email"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, patient.email || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Age"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.age || intakeData.age || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Gender"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.gender || intakeData.gender || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Blood Group"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.bloodGroup || intakeData.bloodGroup || "-")), (() => {
    const apptVitals = appointment?.vitals || {};
    const vitalsInfo = {
      height: apptVitals.height || profile.height || intakeData.height || intakeData.vitals?.height,
      weight: apptVitals.weight || profile.weight || intakeData.weight || intakeData.vitals?.weight,
      bmi: apptVitals.bmi || profile.bmi || intakeData.bmi || intakeData.vitals?.bmi,
      bp: apptVitals.bp || profile.bp || profile.bloodPressure || profile.historyBp || intakeData.bp || intakeData.bloodPressure || intakeData.historyBp || intakeData.vitals?.bloodPressure || intakeData.vitals?.bp,
      pulse: apptVitals.pulse || profile.pulse || profile.pulseRate || profile.historyPulse || intakeData.pulse || intakeData.pulseRate || intakeData.historyPulse || intakeData.vitals?.pulse,
      rr: apptVitals.rr || apptVitals.respiratoryRate || profile.rr || profile.respiratoryRate || intakeData.rr || intakeData.respiratoryRate || intakeData.vitals?.respiratoryRate,
      temp: apptVitals.temperature || apptVitals.temp || profile.temperature || profile.temp || intakeData.temperature || intakeData.temp || intakeData.vitals?.temperature,
      spo2: apptVitals.spo2 || profile.spo2 || intakeData.spo2 || intakeData.vitals?.spo2,
      bloodSugar: apptVitals.bloodSugar || profile.bloodSugar || profile.blood_sugar || intakeData.bloodSugar || intakeData.blood_sugar,
      heartRate: apptVitals.heartRate || apptVitals.heart_rate || profile.heartRate || profile.heart_rate || intakeData.heartRate || intakeData.heart_rate,
      painScale: apptVitals.painScale || apptVitals.pain_scale || profile.painScale || profile.pain_scale || intakeData.painScale || intakeData.pain_scale,
      allergies: profile.allergies && profile.allergies !== "-" ? profile.allergies : intakeData.allergies && intakeData.allergies !== "-" ? intakeData.allergies : "",
      medications: profile.currentMedications || profile.currentMedication || intakeData.currentMedications || intakeData.currentMedication || profile.medications || intakeData.medications,
      history: profile.chronicConditions && profile.chronicConditions !== "-" ? profile.chronicConditions : intakeData.chronicConditions && intakeData.chronicConditions !== "-" ? intakeData.chronicConditions : ""
    };
    const isValAvailable = (val) => {
      return val && val !== "-" && val !== "None" && val.toString().trim() !== "";
    };
    return /* @__PURE__ */ React.createElement(React.Fragment, null, isValAvailable(vitalsInfo.height) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Height"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.height, " cm")), isValAvailable(vitalsInfo.weight) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Weight"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.weight, " kg")), isValAvailable(vitalsInfo.bmi) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "BMI"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.bmi)), isValAvailable(vitalsInfo.bp) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Blood Pressure"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.bp)), isValAvailable(vitalsInfo.pulse) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Pulse Rate"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.pulse, " bpm")), isValAvailable(vitalsInfo.rr) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Respiratory Rate"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.rr, " breaths/min")), isValAvailable(vitalsInfo.temp) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Temperature"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.temp, " \xB0F")), isValAvailable(vitalsInfo.spo2) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Oxygen Saturation (SpO\u2082)"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.spo2, "%")), isValAvailable(vitalsInfo.bloodSugar) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Blood Sugar"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.bloodSugar)), isValAvailable(vitalsInfo.heartRate) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Heart Rate"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.heartRate, " bpm")), isValAvailable(vitalsInfo.painScale) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Pain Scale"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.painScale, " / 10")), isValAvailable(vitalsInfo.allergies) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Allergies"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.allergies)), isValAvailable(vitalsInfo.medications) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Current Medications"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.medications)), isValAvailable(vitalsInfo.history) && /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Medical History"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, vitalsInfo.history)));
  })(), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Address"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, patient.address || profile.address || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Reason for Visit"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.reasonForVisit || intakeData.reasonForVisit || "-"))), (profile.partnerFirstName || intakeData.partnerFirstName) && /* @__PURE__ */ React.createElement("div", { className: "dpd-partner-quick" }, /* @__PURE__ */ React.createElement("h4", null, "\u{1F46B} Spouse/Partner Info"), /* @__PURE__ */ React.createElement("div", { className: "dpd-overview-grid" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Partner Name"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.partnerFirstName || intakeData.partnerFirstName || "-", " ", profile.partnerLastName || intakeData.partnerLastName || "")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Partner Phone"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.partnerMobile || intakeData.partnerMobile || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Partner Age"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.partnerAge || intakeData.partnerAge || profile.husbandAge || intakeData.husbandAge || "-")), /* @__PURE__ */ React.createElement("div", { className: "dpd-ov-card" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-label" }, "Partner Blood Group"), /* @__PURE__ */ React.createElement("span", { className: "dpd-ov-value" }, profile.partnerBloodGroup || intakeData.partnerBloodGroup || "-"))))), activeTab === "history" && (() => {
    const currentDept = (appointment?.department || appointment?.serviceName || "").toLowerCase();
    const filteredHistory = history.filter((h) => {
      if (!currentDept) return true;
      if (h._id === appointmentId) return true;
      const hDept = (h.department || h.serviceName || h.doctorConsultation?.department || "").toLowerCase();
      return hDept === currentDept;
    });
    return /* @__PURE__ */ React.createElement("div", { className: "dpd-tab-panel" }, /* @__PURE__ */ React.createElement("h3", { className: "dpd-panel-title" }, "\u{1F4DC} Previous Consultations (", filteredHistory.length, ")"), filteredHistory.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "dpd-empty-hist" }, /* @__PURE__ */ React.createElement("p", null, "No previous visits recorded in this department context.")) : /* @__PURE__ */ React.createElement("div", { className: "dpd-history-list" }, filteredHistory.map((h) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: h._id,
        className: `dpd-history-card ${h._id === appointmentId ? "current" : ""} ${viewingPastSession && viewingPastSession._id === h._id ? "viewing-active" : ""}`,
        onClick: () => {
          if (h._id === appointmentId) setViewingPastSession(null);
          else setViewingPastSession(viewingPastSession && viewingPastSession._id === h._id ? null : h);
        },
        style: { cursor: "pointer", transition: "all 0.2s", border: viewingPastSession && viewingPastSession._id === h._id ? "2px solid #3b82f6" : "" }
      },
      viewingPastSession && viewingPastSession._id === h._id && /* @__PURE__ */ React.createElement("div", { style: { background: "#3b82f6", color: "#fff", padding: "2px 8px", fontSize: "11px", borderRadius: "4px", display: "inline-block", marginBottom: "8px", fontWeight: "bold" } }, "\u{1F441}\uFE0F Viewing Right Now"),
      /* @__PURE__ */ React.createElement("div", { className: "dpd-hist-top" }, /* @__PURE__ */ React.createElement("span", { className: "dpd-hist-date" }, new Date(h.appointmentDate || h.visitDate || h.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })), /* @__PURE__ */ React.createElement("span", { className: `dpd-hist-status status-${h.status}` }, h.status)),
      /* @__PURE__ */ React.createElement("div", { className: "dpd-hist-diagnosis" }, /* @__PURE__ */ React.createElement("strong", null, "Diagnosis:"), " ", h.doctorConsultation?.diagnosis?.length > 0 ? h.doctorConsultation.diagnosis.join(", ") : h.diagnosis || "No diagnosis recorded"),
      (h.doctorConsultation?.clinicalNotes || h.doctorNotes) && /* @__PURE__ */ React.createElement("div", { className: "dpd-hist-notes" }, /* @__PURE__ */ React.createElement("strong", null, "Notes:"), " ", h.doctorConsultation?.clinicalNotes || h.doctorNotes),
      (h.doctorConsultation?.prescription?.length > 0 || h.pharmacy?.length > 0) && /* @__PURE__ */ React.createElement("div", { className: "dpd-hist-notes" }, /* @__PURE__ */ React.createElement("strong", null, "\u{1F48A} Medicines:"), " ", h.doctorConsultation?.prescription?.length > 0 ? h.doctorConsultation.prescription.map((p) => `${p.medicine} (${p.dosage}, ${p.duration})`).join(" \xB7 ") : h.pharmacy.map((p) => `${p.medicineName} (${p.frequency || p.dose || "-"}, ${p.duration || p.days || "-"} days)`).join(" \xB7 ")),
      (h.doctorConsultation?.labTests?.length > 0 || h.labTests?.length > 0) && /* @__PURE__ */ React.createElement("div", { className: "dpd-hist-notes" }, /* @__PURE__ */ React.createElement("strong", null, "\u{1F9EA} Lab Tests:"), " ", h.doctorConsultation?.labTests?.length > 0 ? h.doctorConsultation.labTests.join(", ") : (h.labTests || []).join(", ")),
      h._id === appointmentId && /* @__PURE__ */ React.createElement("span", { className: "dpd-current-badge" }, "\u{1F4CC} Current Session")
    ))));
  })(), activeTab === "ipd_orders" && /* @__PURE__ */ React.createElement(
    DoctorIPDOrdersPanel,
    {
      patientId: id || patient?._id,
      patient,
      appointment,
      currentUser: user
    }
  ), activeTab === "reports" && /* @__PURE__ */ React.createElement(AppointmentReports, { appointmentId: appointment?._id, prescriptions: appointment?.prescriptions }), dynamicTabs.map((dTab) => activeTab === dTab.id && /* @__PURE__ */ React.createElement("div", { key: dTab.id, style: { display: "block" } }, /* @__PURE__ */ React.createElement(
    DynamicQuestionForm,
    {
      categoryName: dTab.label,
      questions: dTab.data,
      intakeData,
      setIntakeData,
      readOnly: isLocked
    }
  ), !isLocked && /* @__PURE__ */ React.createElement("button", { className: "dpd-save-section", onClick: handleSaveProfile, disabled: saving, style: { marginTop: "20px" } }, saving ? "Saving..." : `\u{1F4BE} Save ${dTab.label} Data`))))), !isJrDoctor && /* @__PURE__ */ React.createElement("div", { className: `dpd-right ${viewingPastSession ? "time-machine-active" : ""}`, style: viewingPastSession ? { background: "#f8fafc", borderLeft: "4px solid #3b82f6" } : {} }, viewingPastSession ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "dpd-right-header", style: { background: "#eff6ff", borderBottom: "1px solid #bfdbfe" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("h2", { style: { color: "#1e3a8a" } }, "\u{1F570}\uFE0F Past Session"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "12px", background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "12px", fontWeight: "bold" } }, "Read-only")), /* @__PURE__ */ React.createElement("p", { className: "dpd-right-subtitle", style: { color: "#3b82f6", fontWeight: 600 } }, "Viewing notes from ", new Date(viewingPastSession.appointmentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setViewingPastSession(null),
      style: { padding: "6px 14px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }
    },
    "\u2715 Exit Time Machine"
  )), /* @__PURE__ */ React.createElement("div", { className: "dpd-right-content" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F50D} Diagnosis at the time"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", background: "rgba(255,255,255,0.7)", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#334155" } }, viewingPastSession.diagnosis || /* @__PURE__ */ React.createElement("em", { style: { color: "#94a3b8" } }, "No diagnosis recorded"))), /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F4CB} Clinical Notes"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", background: "rgba(255,255,255,0.7)", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#334155", minHeight: "80px", whiteSpace: "pre-wrap" } }, viewingPastSession.doctorNotes || /* @__PURE__ */ React.createElement("em", { style: { color: "#94a3b8" } }, "No notes recorded"))), /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F48A} Prescription Given"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", background: "rgba(255,255,255,0.7)", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#334155", minHeight: "60px" } }, viewingPastSession.pharmacy?.length > 0 ? /* @__PURE__ */ React.createElement("ul", { style: { margin: 0, paddingLeft: "20px" } }, viewingPastSession.pharmacy.map((p, i) => /* @__PURE__ */ React.createElement("li", { key: i }, /* @__PURE__ */ React.createElement("strong", null, p.medicineName)))) : /* @__PURE__ */ React.createElement("em", { style: { color: "#94a3b8" } }, "No prescription recorded"))), /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F9EA} Lab Tests Ordered"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", background: "rgba(255,255,255,0.7)", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#334155" } }, (viewingPastSession.labTests || []).length > 0 ? (viewingPastSession.labTests || []).join(", ") : /* @__PURE__ */ React.createElement("em", { style: { color: "#94a3b8" } }, "No lab tests ordered")))), /* @__PURE__ */ React.createElement("div", { className: "dpd-right-footer", style: { background: "#f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setSessionData({
          diagnosis: viewingPastSession.diagnosis || "",
          notes: viewingPastSession.doctorNotes || "",
          prescription: viewingPastSession.pharmacy?.map((p) => p.medicineName).join("\n") || "",
          labTests: (viewingPastSession.labTests || []).join(", ")
        });
        setViewingPastSession(null);
        toast2.success("Historical data copied into your Current Session editor!");
      },
      style: { padding: "10px 18px", background: "transparent", color: "#3b82f6", border: "1px solid #3b82f6", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }
    },
    "\u{1F4CB} Copy to Current Session"
  ), /* @__PURE__ */ React.createElement("button", { className: "dpd-btn-finish", onClick: () => setViewingPastSession(null), style: { background: "#64748b" } }, "Return to Current Editing"))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "dpd-right-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u{1F4DD} Current Session"), /* @__PURE__ */ React.createElement("p", { className: "dpd-right-subtitle" }, "Record diagnosis, notes & prescription")), /* @__PURE__ */ React.createElement("span", { className: `dpd-session-status status-${appointment.status}` }, appointment.status)), /* @__PURE__ */ React.createElement("div", { className: "dpd-right-content" }, /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F50D} Diagnosis"), /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "diagnosis",
      value: sessionData.diagnosis,
      onChange: handleSessionChange,
      placeholder: "Enter diagnosis...",
      className: "dpd-diag-input",
      disabled: isLocked
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field dpd-notes-field" }, /* @__PURE__ */ React.createElement("label", null, "\u{1F4CB} Clinical Notes"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      name: "notes",
      value: sessionData.notes,
      onChange: handleSessionChange,
      placeholder: "Write detailed clinical notes, observations, examination findings...",
      className: "dpd-notes-textarea",
      disabled: isLocked
    }
  )), !isLocked && /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field", style: { background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px" } }, patientReferrals.filter((r) => r.status === "REFERRED" && (r.referredToDoctorId?._id === user?._id || r.referredToDoctorId === user?._id)).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "referral-banner", style: { background: "linear-gradient(135deg, #fef3c7, #fde68a)", padding: "14px", borderRadius: "12px", border: "2px solid #f59e0b", marginBottom: "16px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "700", color: "#92400e", fontSize: "14px", marginBottom: "8px" } }, "\u{1F4CB} Surgery Referral Pending"), patientReferrals.filter((r) => r.status === "REFERRED" && (r.referredToDoctorId?._id === user?._id || r.referredToDoctorId === user?._id)).map((ref) => /* @__PURE__ */ React.createElement("div", { key: ref._id, style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "13px", color: "#78350f" } }, /* @__PURE__ */ React.createElement("strong", null, "From:"), " ", ref.referringDoctorId?.name || "Unknown", " \xA0|\xA0", /* @__PURE__ */ React.createElement("strong", null, "Reason:"), " ", ref.reason), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setActiveReferralForReview(ref);
        setShowReferralReviewModal(true);
      },
      style: { marginTop: "6px", padding: "6px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }
    },
    "Review Referral"
  )))), /* @__PURE__ */ React.createElement("label", { style: { display: "block", marginBottom: "12px", color: "#1e293b", fontWeight: "bold" } }, "\u{1F52A} Operation Required?"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "radio", name: "operationRequired", checked: !operationRequired, onChange: () => setOperationRequired(false) }), /* @__PURE__ */ React.createElement("span", null, "No")), /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "radio", name: "operationRequired", checked: operationRequired, onChange: () => setOperationRequired(true) }), /* @__PURE__ */ React.createElement("span", null, "Yes"))), operationRequired && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setSurgeryPlanData((prev) => ({
          ...prev,
          diagnosis: sessionData.diagnosis || prev.diagnosis || "",
          surgeonId: prev.surgeonId || user?._id || user?.id || ""
        }));
        setShowSurgeryPlanModal(true);
      },
      style: { padding: "12px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", width: "100%", fontSize: "14px", boxShadow: "0 2px 4px rgba(37,99,235,0.2)" }
    },
    "+ Create Surgery Plan (Self / Direct)"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setReferralData((prev) => ({
          ...prev,
          reason: sessionData.diagnosis || ""
        }));
        setShowReferralModal(true);
      },
      style: { padding: "12px 20px", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", width: "100%", fontSize: "14px", boxShadow: "0 2px 4px rgba(124,58,237,0.2)" }
    },
    "\u{1F504} Refer for Surgery (To Another Doctor)"
  ))), /* @__PURE__ */ React.createElement("div", { className: "dpd-session-field" }, !isLocked && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowPrescribeModal(true),
      style: { padding: "14px", fontSize: "15px", background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 10px rgba(79, 70, 229, 0.25)", marginTop: "10px" }
    },
    "\u{1F48A} / \u{1F9EA} Prescribe Medicines & Lab Tests"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setActiveTab("ipd_orders"),
      style: {
        padding: "12px",
        fontSize: "14px",
        background: "linear-gradient(135deg, #0284c7, #0369a1)",
        color: "white",
        border: "none",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "bold",
        boxShadow: "0 4px 10px rgba(2, 132, 199, 0.25)",
        marginTop: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        width: "100%"
      }
    },
    "\u{1F3E5} Hospitalization & IPD Orders"
  )), (sessionData.medicines?.length > 0 || sessionData.labTests || isLocked && appointment.pharmacy?.length > 0) && /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", marginTop: "10px", fontSize: "13px", color: "#475569" } }, (sessionData.medicines?.length > 0 || isLocked && appointment.pharmacy?.length > 0) && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "4px" } }, /* @__PURE__ */ React.createElement("b", null, "\u2705 Medicines included (", sessionData.medicines?.length || appointment.pharmacy?.length || 0, ")")), (sessionData.labTests || isLocked && appointment.labTests?.length > 0) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("b", null, "\u2705 Lab Tests included")), !isLocked && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", fontSize: "12px", color: "#3b82f6", cursor: "pointer", fontWeight: "bold" }, onClick: () => setShowPrescribeModal(true) }, "Click above button to view/edit details."), isLocked && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", fontSize: "12px" } }, "Check the Consultation Report (PDF) for full history.")))), /* @__PURE__ */ React.createElement("div", { className: "dpd-right-footer" }, !isLocked ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "dpd-btn-save-draft", onClick: handleSaveProfile, disabled: saving }, "\u{1F4BE} Save Profile"), /* @__PURE__ */ React.createElement("button", { className: "dpd-btn-finish", onClick: handleSaveAndMerge, disabled: saving }, saving ? "\u23F3 Saving..." : "\u2705 Save & Generate Prescription")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "dpd-btn-save-draft",
      onClick: generatePrescriptionPDF
    },
    "\u{1F4C4} Reprint Prescription"
  ), /* @__PURE__ */ React.createElement("button", { className: "dpd-btn-finish", onClick: () => navigate("/doctor/patients"), style: { background: "#64748b" } }, "\u2190 Back to Queue"))))), !isJrDoctor && showPrescribeModal && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", padding: "24px", borderRadius: "16px", width: "850px", maxWidth: "95vw", height: "85vh", maxHeight: "850px", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, color: "#0f172a", fontSize: "1.4rem", fontWeight: "800" } }, "\u2695\uFE0F Prescribe Medicines & Lab Tests"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPrescribeModal(false), style: { background: "#f1f5f9", border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" } }, "\u2715")), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "30px", paddingRight: "8px" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 12px", color: "#1e293b", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" } }, "\u{1F48A} Medicines Prescribed"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "14px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "6px" } }, "Search Medicine From Inventory"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: "Search medicine by name...",
      style: { width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", boxSizing: "border-box" },
      value: medSearch,
      onChange: (e) => setMedSearch(e.target.value)
    }
  )), medSearch && /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", marginBottom: "16px", maxHeight: "180px", overflowY: "auto" } }, catalogMedicines.filter((m) => m.name.toLowerCase().includes(medSearch.toLowerCase())).length > 0 ? catalogMedicines.filter((m) => m.name.toLowerCase().includes(medSearch.toLowerCase())).map((med) => {
    const isIncluded = sessionData.medicines.some((m) => m.medicineName === med.name);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: med._id,
        onClick: () => {
          if (!isIncluded) {
            setSessionData((prev) => ({ ...prev, medicines: [...prev.medicines, { medicineName: med.name, saltName: "", dose: "", days: "7" }] }));
          }
          setMedSearch("");
        },
        style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: "#fff" },
        onMouseEnter: (e) => e.currentTarget.style.background = "#f8fafc",
        onMouseLeave: (e) => e.currentTarget.style.background = "#fff"
      },
      /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "600", color: "#1e293b", fontSize: "13px" } }, med.name),
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: "11px", color: "#94a3b8", background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px" } }, med.genericName || "Inventory")
    );
  }) : /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", textAlign: "center", color: "#94a3b8", fontSize: "13px" } }, "No medicines found.")), /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "#f1f5f9" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: "700", color: "#374151", borderBottom: "1px solid #e2e8f0", width: "35%" } }, "Medicine Name"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: "700", color: "#374151", borderBottom: "1px solid #e2e8f0", width: "25%" } }, "Dose / Frequency"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: "700", color: "#374151", borderBottom: "1px solid #e2e8f0", width: "25%" } }, "Food / Timing Instructions"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: "700", color: "#374151", borderBottom: "1px solid #e2e8f0", width: "10%" } }, "Days"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", fontWeight: "700", color: "#374151", borderBottom: "1px solid #e2e8f0", width: "5%" } }))), /* @__PURE__ */ React.createElement("tbody", null, sessionData.medicines.map((med, idx) => /* @__PURE__ */ React.createElement("tr", { key: idx, style: { background: idx % 2 === 0 ? "#fff" : "#f8fafc" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", borderBottom: "1px solid #f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: med.medicineName,
      onChange: (e) => setSessionData((prev) => {
        const m = [...prev.medicines];
        m[idx] = { ...m[idx], medicineName: e.target.value };
        return { ...prev, medicines: m };
      }),
      placeholder: "Paracetamol 500mg",
      style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "5px 7px", fontSize: "12px", boxSizing: "border-box" }
    }
  )), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", borderBottom: "1px solid #f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: med.dose,
      onChange: (e) => setSessionData((prev) => {
        const m = [...prev.medicines];
        m[idx] = { ...m[idx], dose: e.target.value };
        return { ...prev, medicines: m };
      }),
      style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "5px 7px", fontSize: "12px", boxSizing: "border-box", background: "#fff" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Select Dose --"),
    doseOptions.map((opt) => /* @__PURE__ */ React.createElement("option", { key: opt, value: opt }, opt))
  )), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", borderBottom: "1px solid #f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: med.saltName,
      onChange: (e) => setSessionData((prev) => {
        const m = [...prev.medicines];
        m[idx] = { ...m[idx], saltName: e.target.value };
        return { ...prev, medicines: m };
      }),
      style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "5px 7px", fontSize: "12px", boxSizing: "border-box", background: "#fff" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Select Timing --"),
    timingOptions.map((opt) => /* @__PURE__ */ React.createElement("option", { key: opt, value: opt }, opt))
  )), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", borderBottom: "1px solid #f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: med.days,
      onChange: (e) => setSessionData((prev) => {
        const m = [...prev.medicines];
        m[idx] = { ...m[idx], days: e.target.value };
        return { ...prev, medicines: m };
      }),
      placeholder: "e.g. 7",
      style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "5px 7px", fontSize: "12px", boxSizing: "border-box" }
    }
  )), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #f1f5f9" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setSessionData((prev) => ({ ...prev, medicines: prev.medicines.filter((_, i) => i !== idx) })),
      style: { background: "#fee2e2", border: "none", borderRadius: "4px", color: "#dc2626", width: "24px", height: "24px", cursor: "pointer", fontSize: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }
    },
    "\xD7"
  )))), sessionData.medicines.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, style: { padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "13px" } }, 'No medicines added yet. Use quick-add above or click "+ Add Row".'))))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setSessionData((prev) => ({ ...prev, medicines: [...prev.medicines, { medicineName: "", saltName: "", dose: "", days: "" }] })),
      style: { marginTop: "8px", padding: "6px 14px", fontSize: "12px", background: "#f0fdf4", border: "1px dashed #86efac", borderRadius: "6px", color: "#16a34a", cursor: "pointer", fontWeight: "600" }
    },
    "+ Add Row"
  )), /* @__PURE__ */ React.createElement("hr", { style: { border: "none", borderTop: "2px dashed #e2e8f0", margin: "0" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 12px", color: "#1e293b", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" } }, "\u{1F9EA} Select Lab Tests"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" } }, catalogTests.length > 0 ? catalogTests.filter((t) => t.isActive).map((test) => {
    const isChecked = sessionData.labTests.split(", ").includes(test.name);
    return /* @__PURE__ */ React.createElement("label", { key: test._id, style: { display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", cursor: "pointer", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "10px", background: isChecked ? "#eff6ff" : "#fafafa", borderColor: isChecked ? "#93c5fd" : "#e2e8f0", transition: "all 0.2s" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: isChecked,
        onChange: (e) => {
          let currentTests = sessionData.labTests ? sessionData.labTests.split(", ") : [];
          if (e.target.checked) {
            currentTests.push(test.name);
          } else {
            currentTests = currentTests.filter((t) => t !== test.name);
          }
          setSessionData((prev) => ({ ...prev, labTests: currentTests.join(", ") }));
        },
        style: { marginTop: "2px", cursor: "pointer", width: "16px", height: "16px" }
      }
    ), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "700", color: "#0f172a" } }, test.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "2px" } }, test.category)));
  }) : /* @__PURE__ */ React.createElement("p", { style: { color: "#94a3b8", fontSize: "13px", gridColumn: "1 / -1", textAlign: "center", padding: "20px", background: "#f8fafc", borderRadius: "8px" } }, "No lab tests defined by Super Admin.")), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "13px", fontWeight: "700", color: "#475569", display: "block", marginBottom: "6px" } }, "Edit Final Lab Tests (Comma separated):"), /* @__PURE__ */ React.createElement(
    "input",
    {
      name: "labTests",
      value: sessionData.labTests,
      onChange: handleSessionChange,
      placeholder: "CBC, LFT, KFT...",
      className: "dpd-diag-input",
      style: { width: "100%", boxSizing: "border-box" }
    }
  ))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "12px" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPrescribeModal(false), style: { padding: "12px 24px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" } }, "Close"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPrescribeModal(false), style: { padding: "12px 30px", background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "15px", boxShadow: "0 4px 6px rgba(59, 130, 246, 0.3)" } }, "Save Selections & Resume Note")))), !isJrDoctor && showSurgeryPlanModal && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", padding: "24px", borderRadius: "16px", width: "600px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, color: "#0f172a", fontSize: "1.4rem", fontWeight: "800" } }, "\u{1F52A} Create Surgery Plan"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowSurgeryPlanModal(false), style: { background: "#f1f5f9", border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", color: "#475569" } }, "\u2715")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateSurgeryPlan, style: { display: "flex", flexDirection: "column", gap: "16px" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", color: "#334155" } }, /* @__PURE__ */ React.createElement("strong", null, "Patient:"), " ", intakeData?.name || appointment?.userId?.name || appointment?.patientId || "N/A", " ", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", null, "MRN / Age / Gender:"), " ", intakeData?.patientUid || appointment?.userId?.patientId || "-", " / ", intakeData?.age || "-", " / ", intakeData?.gender || "-"), surgeryPlanData.referralId && /* @__PURE__ */ React.createElement("div", { style: { background: "#f5f3ff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #ddd6fe", fontSize: "13px", color: "#5b21b6", fontWeight: 600 } }, "\u{1F504} ", /* @__PURE__ */ React.createElement("strong", null, "Referred Surgery Case"), " (Referral linked to this Surgery Plan)"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Surgery / Procedure *"), /* @__PURE__ */ React.createElement("input", { required: true, value: surgeryPlanData.surgery, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, surgery: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Diagnosis / Reason"), /* @__PURE__ */ React.createElement("input", { value: surgeryPlanData.diagnosis, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, diagnosis: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Surgeon *"), /* @__PURE__ */ React.createElement("select", { required: true, value: surgeryPlanData.surgeonId, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, surgeonId: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Select Surgeon --"), surgeonsList.map((s) => {
    const id2 = s.userId?._id || s.userId || s._id;
    const docName = s.name || s.userId?.name || "Doctor";
    return /* @__PURE__ */ React.createElement("option", { key: s._id || id2, value: id2 }, "Dr. ", docName.replace(/^Dr\.?\s*/i, ""), " ", s.specialty ? `(${s.specialty})` : "");
  }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Preferred Date *"), /* @__PURE__ */ React.createElement("input", { type: "date", required: true, min: (/* @__PURE__ */ new Date()).toISOString().split("T")[0], value: surgeryPlanData.preferredDate, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, preferredDate: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Preferred Time *"), /* @__PURE__ */ React.createElement("input", { type: "time", required: true, value: surgeryPlanData.preferredTime, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, preferredTime: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "13px", color: "#475569", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: surgeryPlanData.admissionRequired, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, admissionRequired: e.target.checked })) }), "Admission Required")), surgeryPlanData.admissionRequired && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Admission Date *"), /* @__PURE__ */ React.createElement("input", { type: "date", required: surgeryPlanData.admissionRequired, value: surgeryPlanData.admissionDate, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, admissionDate: e.target.value })), style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "13px", color: "#475569", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: surgeryPlanData.preOpRequired, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, preOpRequired: e.target.checked })) }), "Pre-Operative Preparation Required")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Notes"), /* @__PURE__ */ React.createElement("textarea", { value: surgeryPlanData.notes, onChange: (e) => setSurgeryPlanData((prev) => ({ ...prev, notes: e.target.value })), placeholder: "Any specific requirements...", style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", minHeight: "80px" } })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "12px" } }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setShowSurgeryPlanModal(false), style: { padding: "10px 20px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "submit", style: { padding: "10px 24px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" } }, "Save Surgery Plan"))))), showReferralModal && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", padding: "24px", borderRadius: "16px", width: "550px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, color: "#0f172a", fontSize: "1.4rem", fontWeight: "800" } }, "\u{1F504} Refer for Surgery"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowReferralModal(false), style: { background: "#f1f5f9", border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", color: "#475569" } }, "\u2715")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateReferral, style: { display: "flex", flexDirection: "column", gap: "16px" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", color: "#334155" } }, /* @__PURE__ */ React.createElement("strong", null, "Patient:"), " ", intakeData?.name || appointment?.userId?.name || "N/A", " ", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", null, "MRN:"), " ", intakeData?.patientUid || appointment?.userId?.patientId || "-"), /* @__PURE__ */ React.createElement("div", { style: { background: "#f0fdf4", padding: "12px", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "14px", color: "#166534" } }, /* @__PURE__ */ React.createElement("strong", null, "Referring Doctor:"), " ", user?.name || "Current Doctor", " (You)"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Refer To Doctor / Surgeon *"), /* @__PURE__ */ React.createElement(
    "select",
    {
      required: true,
      value: referralData.referredToDoctorId,
      onChange: (e) => setReferralData((prev) => ({ ...prev, referredToDoctorId: e.target.value })),
      style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Select Doctor --"),
    surgeonsList.filter((s) => {
      const docUserId = (s.userId?._id || s.userId || s._id)?.toString();
      const currentUserId = (user?._id || user?.id)?.toString();
      return docUserId !== currentUserId;
    }).map((s) => {
      const id2 = s.userId?._id || s.userId || s._id;
      const docName = s.name || s.userId?.name || "Doctor";
      return /* @__PURE__ */ React.createElement("option", { key: s._id || id2, value: id2 }, "Dr. ", docName.replace(/^Dr\.?\s*/i, ""), " ", s.specialty ? `(${s.specialty})` : "");
    })
  ), surgeonsList.filter((s) => (s.userId?._id || s.userId || s._id)?.toString() !== (user?._id || user?.id)?.toString()).length === 0 && /* @__PURE__ */ React.createElement("small", { style: { color: "#ef4444", marginTop: "6px", display: "block", fontSize: "12px" } }, "\u26A0\uFE0F No other doctors found in this hospital to refer to. Please create another doctor in Admin > Staff.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Reason for Referral *"), /* @__PURE__ */ React.createElement("input", { required: true, value: referralData.reason, onChange: (e) => setReferralData((prev) => ({ ...prev, reason: e.target.value })), placeholder: "e.g. Appendectomy required", style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "13px", color: "#475569" } }, "Notes (Optional)"), /* @__PURE__ */ React.createElement("textarea", { value: referralData.notes, onChange: (e) => setReferralData((prev) => ({ ...prev, notes: e.target.value })), placeholder: "Any additional information...", style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", minHeight: "70px" } })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "12px" } }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setShowReferralModal(false), style: { padding: "10px 20px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" } }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "submit", style: { padding: "10px 24px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" } }, "Create Referral"))))), showReferralReviewModal && activeReferralForReview && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", padding: "24px", borderRadius: "16px", width: "550px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, color: "#0f172a", fontSize: "1.4rem", fontWeight: "800" } }, "\u{1F4CB} Review Referral"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setShowReferralReviewModal(false);
    setActiveReferralForReview(null);
  }, style: { background: "#f1f5f9", border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", color: "#475569" } }, "\u2715")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", color: "#334155" } }, /* @__PURE__ */ React.createElement("strong", null, "Patient:"), " ", activeReferralForReview.patientId?.name || "N/A", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", null, "MRN:"), " ", activeReferralForReview.patientId?.patientId || activeReferralForReview.patientId?.mrn || "-"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fffbeb", padding: "12px", borderRadius: "8px", border: "1px solid #fde68a", fontSize: "14px", color: "#92400e" } }, /* @__PURE__ */ React.createElement("strong", null, "Referred By:"), " ", activeReferralForReview.referringDoctorId?.name || "N/A", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", null, "Reason:"), " ", activeReferralForReview.reason, /* @__PURE__ */ React.createElement("br", null), activeReferralForReview.notes && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, "Notes:"), " ", activeReferralForReview.notes, /* @__PURE__ */ React.createElement("br", null)), /* @__PURE__ */ React.createElement("strong", null, "Date:"), " ", new Date(activeReferralForReview.referralDate).toLocaleDateString())), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid #e2e8f0", paddingTop: "16px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontWeight: "700", marginBottom: "12px", fontSize: "15px", color: "#1e293b" } }, "Surgery Required?"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        handleReviewReferral(activeReferralForReview._id, "NOT_REQUIRED", "Surgery not required after evaluation");
      },
      style: { flex: 1, padding: "12px", background: "#fee2e2", color: "#991b1b", border: "2px solid #fecaca", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }
    },
    "\u274C No \u2014 Not Required"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        handleReviewReferral(activeReferralForReview._id, "ACCEPTED", "Surgery confirmed after evaluation").then(() => {
          setSurgeryPlanData((prev) => ({
            ...prev,
            diagnosis: activeReferralForReview.reason || "",
            surgeonId: user?._id || "",
            referralId: activeReferralForReview._id,
            referringDoctorId: activeReferralForReview.referringDoctorId?._id || ""
          }));
          setShowSurgeryPlanModal(true);
        });
      },
      style: { flex: 1, padding: "12px", background: "#dcfce7", color: "#166534", border: "2px solid #bbf7d0", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }
    },
    "\u2705 Yes \u2014 Create Surgery Plan"
  ))))), toast2.show && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("style", null, `
                        @keyframes slideIn {
                            from { transform: translateY(20px); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                    `), /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "16px 20px",
    borderRadius: "12px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    borderLeft: "5px solid #10b981",
    zIndex: 99999,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    animation: "slideIn 0.3s ease forwards",
    fontFamily: "Inter, sans-serif",
    minWidth: "300px",
    maxWidth: "400px"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "700", color: "#065f46", fontSize: "15px" } }, toast2.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "13px", color: "#475569", lineHeight: "1.4" } }, toast2.message))));
};
export default DoctorPatientDetails;
