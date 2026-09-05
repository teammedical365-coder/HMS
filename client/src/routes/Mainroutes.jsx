import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layout & Common Components (Loaded immediately)
import Navbar from '../components/Navbar';
import DashboardLayout from '../components/layouts/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import PatientProtectedRoute from '../components/PatientProtectedRoute';
import RouteLoadingFallback from '../components/common/RouteLoadingFallback';
import RouteErrorBoundary from '../components/common/RouteErrorBoundary';
import { useAuth } from '../store/hooks';
import { getSubdomain } from '../utils/subdomain';
import { prefetchRoutes } from '../utils/prefetch';

// ============================================================
// Route-Level Code Splitting (React.lazy)
// ============================================================

// Role Dashboard Hub
const RoleDashboard = lazy(() => import('../pages/RoleDashboard'));

// User Pages
const Services = lazy(() => import('../pages/user/Services'));
const Doctors = lazy(() => import('../pages/user/Doctors'));
const Appointment = lazy(() => import('../pages/user/Appointment'));
const AppointmentSuccess = lazy(() => import('../pages/user/AppointmentSuccess'));
const LabReports = lazy(() => import('../pages/user/LabReports'));
const Dashboard = lazy(() => import('../pages/user/Dashboard'));
const Pharmacy = lazy(() => import('../pages/user/Pharmacy'));
const Login = lazy(() => import('../pages/user/Login'));
const Signup = lazy(() => import('../pages/user/Signup'));

// Doctor Pages
const DoctorDashboard = lazy(() => import('../pages/doctors/DoctorDashboard'));
const Patient = lazy(() => import('../pages/doctors/Patient'));
const AdminLabTests = lazy(() => import('../pages/admin/AdminLabTests'));
const DoctorPatientDetails = lazy(() => import('../pages/doctors/DoctorPatientDetails'));
const AIAssistant = lazy(() => import('../pages/doctors/AIAssistant'));
const UnifiedPatientProfile = lazy(() => import('../pages/patient/UnifiedPatientProfile'));
const PatientPortalLogin = lazy(() => import('../pages/patient/PatientPortalLogin'));
const PatientSignup = lazy(() => import('../pages/patient/PatientSignup'));
const PatientForgotPassword = lazy(() => import('../pages/patient/PatientForgotPassword'));
const PatientResetPassword = lazy(() => import('../pages/patient/PatientResetPassword'));
const PatientDashboard = lazy(() => import('../pages/patient/PatientDashboard'));

// Hospital Admin (Tier 2) Pages
const Admin = lazy(() => import('../pages/admin/Admin'));
const AdminDoctors = lazy(() => import('../pages/admin/AdminDoctors'));
const AdminLabs = lazy(() => import('../pages/admin/AdminLabs'));
const AdminPharmacy = lazy(() => import('../pages/admin/AdminPharmacy'));
const AdminReception = lazy(() => import('../pages/admin/AdminReception'));
const AdminServices = lazy(() => import('../pages/admin/AdminServices'));
const AdminRoles = lazy(() => import('../pages/admin/AdminRoles'));
const AdminMainDashboard = lazy(() => import('../pages/admin/AdminMainDashboard'));
const AdminMedicines = lazy(() => import('../pages/admin/AdminMedicines'));
const AdminQuestionLibrary = lazy(() => import('../pages/admin/AdminQuestionLibrary'));
const AdminTestPackages = lazy(() => import('../pages/admin/AdminTestPackages'));

// Central Admin (Tier 1) Pages — /supremeadmin
const CentralAdminLogin = lazy(() => import('../pages/centraladmin/CentralAdminLogin'));
const CentralAdminSignup = lazy(() => import('../pages/centraladmin/CentralAdminSignup'));
const CentralAdminDashboard = lazy(() => import('../pages/centraladmin/CentralAdminDashboard'));
const SystemRevenueDashboard = lazy(() => import('../pages/centraladmin/SystemRevenueDashboard'));

// Hospital Admin (Tier 2) Pages — /hospitaladmin
const HospitalAdminLogin = lazy(() => import('../pages/hospitaladmin/HospitalAdminLogin'));
const HospitalAdminDashboard = lazy(() => import('../pages/hospitaladmin/HospitalAdminDashboard'));
const ClinicDashboard = lazy(() => import('../pages/hospitaladmin/ClinicDashboard'));
const HospitalLogin = lazy(() => import('../pages/hospitaladmin/HospitalLogin'));
const HospitalAdminQuestionLibrary = lazy(() => import('../pages/hospitaladmin/HospitalAdminQuestionLibrary'));
const VialManagement = lazy(() => import('../pages/hospitaladmin/VialManagement'));

// Cashier Routing
const CashierDashboard = lazy(() => import('../pages/cashier/CashierDashboard'));

// Legacy Admin Auth
const AdminLogin = lazy(() => import('../pages/administration/AdminLogin'));
const AdminSignup = lazy(() => import('../pages/administration/AdminSignup'));

// Consent Management
const ConsentManagement = lazy(() => import('../pages/admin/ConsentManagement'));

// Lab Pages
const LabDashboard = lazy(() => import('../pages/lab/LabDashboard'));
const AssignedTests = lazy(() => import('../pages/lab/AssignedTests'));
const CompletedReports = lazy(() => import('../pages/lab/CompletedReports'));

// Pharmacy Management Pages
const PharmacyInventory = lazy(() => import('../pages/pharmacy/PharmacyInventory'));
const PharmacyOrders = lazy(() => import('../pages/pharmacy/PharmacyOrders'));
const PurchaseInvoiceHistory = lazy(() => import('../pages/pharmacy/PurchaseInvoiceHistory'));
const PharmacyReturns = lazy(() => import('../pages/pharmacy/PharmacyReturns'));
const VendorReturns = lazy(() => import('../pages/pharmacy/VendorReturns'));
const PharmacyCollections = lazy(() => import('../pages/pharmacy/PharmacyCollections'));
const PharmacyDepartments = lazy(() => import('../pages/pharmacy/PharmacyDepartments'));

// Reception Pages
const ReceptionDashboard = lazy(() => import('../pages/reception/ReceptionDashboard'));
const ReceptionPatients = lazy(() => import('../pages/reception/ReceptionPatients'));

// OT Management Pages (Multi-Page System)
const OTDashboard = lazy(() => import('../pages/ot/OTDashboard'));
const OTPlannedSurgeries = lazy(() => import('../pages/ot/OTPlannedSurgeries'));
const OTSchedulePage = lazy(() => import('../pages/ot/OTSchedulePage'));
const OTRoomsPage = lazy(() => import('../pages/ot/OTRoomsPage'));
const OTPreOpPage = lazy(() => import('../pages/ot/OTPreOpPage'));
const OTInProgressPage = lazy(() => import('../pages/ot/OTInProgressPage'));
const OTPostOpPage = lazy(() => import('../pages/ot/OTPostOpPage'));
const OTCompletedPage = lazy(() => import('../pages/ot/OTCompletedPage'));
const OTSurgeonsPage = lazy(() => import('../pages/ot/OTSurgeonsPage'));
const OTReportsPage = lazy(() => import('../pages/ot/OTReportsPage'));

// Accountant / Finance Pages
const AccountantDashboard = lazy(() => import('../pages/accountant/AccountantDashboard'));

// Billing Pages
const PatientBillingProfile = lazy(() => import('../pages/billing/PatientBillingProfile'));

// Subdomains reserved for the platform itself — NOT hospital slugs
const RESERVED_SUBDOMAINS = ['admin', 'www', 'api'];

const SmartDashboardRedirector = () => {
    const subdomain = getSubdomain();
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    const roleStr = (u.role || '').toLowerCase();
    
    if (roleStr === 'centraladmin' || roleStr === 'superadmin') {
        return <Navigate to="/supremeadmin" replace />;
    }

    if (subdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) {
        if (u.subscriptionPlan === 'starter' && roleStr === 'hospitaladmin') {
            return <Navigate to="/hospitaladmin" replace />;
        }
        return <Navigate to="/my-dashboard" replace />;
    }
    return <Navigate to="/supremeadmin" replace />;
};

/**
 * SubdomainRoleGuard — enforces that the user's role matches the subdomain context.
 *
 * admin.domain.com   → only centraladmin / superadmin allowed
 * slug.domain.com    → hospital staff allowed, centraladmin/superadmin blocked
 * localhost (null)   → no enforcement (local dev without subdomain)
 */
const SubdomainRoleGuard = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const subdomain = getSubdomain();

    if (subdomain && isAuthenticated && user) {
        const role = (user.role || '').toLowerCase();
        const isCentralRole = role === 'centraladmin' || role === 'superadmin';
        const isAdminSubdomain = subdomain === 'admin';

        // Central admin must operate from admin.* subdomain or base domain
        if (isCentralRole && !isAdminSubdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) {
            return <Navigate to="/supremeadmin" replace />;
        }

        // Hospital staff / hospital admin must NOT operate from admin.* subdomain
        if (!isCentralRole && isAdminSubdomain) {
            return <Navigate to="/login" replace />;
        }
    }

    return children;
};

const MainRoutes = () => {
    const { isAuthenticated, user } = useAuth();

    // Smart Idle Prefetching of high-probability next pages based on user role
    useEffect(() => {
        if (!isAuthenticated || !user) return;
        const role = (user.role || '').toLowerCase();

        if (role === 'centraladmin' || role === 'superadmin') {
            prefetchRoutes([
                { key: 'admin_users', importFn: () => import('../pages/admin/Admin') },
                { key: 'admin_roles', importFn: () => import('../pages/admin/AdminRoles') },
                { key: 'admin_ql', importFn: () => import('../pages/admin/AdminQuestionLibrary') },
                { key: 'admin_consent', importFn: () => import('../pages/admin/ConsentManagement') },
            ]);
        } else if (role === 'hospitaladmin') {
            prefetchRoutes([
                { key: 'hosp_users', importFn: () => import('../pages/admin/Admin') },
                { key: 'hosp_ot', importFn: () => import('../pages/ot/OTDashboard') },
                { key: 'hosp_ql', importFn: () => import('../pages/hospitaladmin/HospitalAdminQuestionLibrary') },
                { key: 'hosp_vials', importFn: () => import('../pages/hospitaladmin/VialManagement') },
            ]);
        } else if (role === 'doctor' || role === 'clinic doctor') {
            prefetchRoutes([
                { key: 'doc_patients', importFn: () => import('../pages/doctors/Patient') },
                { key: 'doc_details', importFn: () => import('../pages/doctors/DoctorPatientDetails') },
            ]);
        } else if (role === 'reception' || role === 'receptionist') {
            prefetchRoutes([
                { key: 'rec_dash', importFn: () => import('../pages/reception/ReceptionDashboard') },
                { key: 'rec_billing', importFn: () => import('../pages/billing/PatientBillingProfile') },
            ]);
        }
    }, [isAuthenticated, user]);
    
    return (
        <>
            <RouteErrorBoundary>
                <Suspense fallback={<RouteLoadingFallback />}>
                    {isAuthenticated ? (
                        <DashboardLayout>
                          <SubdomainRoleGuard>
                            <Routes>
                                <Route path="/" element={<SmartDashboardRedirector />} />
                                <Route path="/services" element={<Navigate to="/" replace />} />
                                <Route path="/doctors" element={<Navigate to="/" replace />} />
                                <Route path="/services/:serviceId/doctors" element={<Navigate to="/" replace />} />

                                {/* Flat Architecture - Handled by Subdomains */}
                                <Route path="patient/:id/department/:department" element={<ProtectedRoute requiredPermissions={[]}><UnifiedPatientProfile /></ProtectedRoute>} />
                                <Route path="patient/:id" element={<ProtectedRoute requiredPermissions={[]}><UnifiedPatientProfile /></ProtectedRoute>} />
                                <Route path="my-dashboard" element={<ProtectedRoute requiredPermissions={[]}>
                                    {(() => {
                                        const u = JSON.parse(localStorage.getItem('user') || '{}');
                                        if (u.subscriptionPlan === 'starter' && u.role === 'hospitaladmin') {
                                            return <Navigate to="/hospitaladmin" replace />;
                                        }
                                        return <RoleDashboard />;
                                    })()}
                                </ProtectedRoute>} />
                                <Route path="appointment" element={<Appointment />} />
                                <Route path="appointment/success" element={<AppointmentSuccess />} />
                                <Route path="lab-reports" element={<LabReports />} />
                                <Route path="dashboard" element={<Dashboard />} />
                                <Route path="pharmacy" element={<Pharmacy />} />

                                {/* Transitions between roles/admin */}
                                <Route path="doctor/dashboard" element={<ProtectedRoute requiredPermissions={['visit_diagnose']} allowedRoles={['doctor', 'clinic doctor']}><DoctorDashboard /></ProtectedRoute>} />
                                <Route path="doctor/cases" element={<ProtectedRoute allowedRoles={['doctor', 'clinic doctor']}><DoctorDashboard /></ProtectedRoute>} />
                                <Route path="doctor/patients" element={<Patient />} />
                                <Route path="doctor/patient/:id" element={<ProtectedRoute requiredPermissions={['visit_diagnose']}><DoctorPatientDetails /></ProtectedRoute>} />
                                <Route path="doctor/ai-assistant" element={<ProtectedRoute requiredPermissions={['visit_diagnose']} allowedRoles={['doctor', 'clinic doctor']}><AIAssistant /></ProtectedRoute>} />

                                <Route path="admin" element={<ProtectedRoute requiredPermissions={['admin_view_stats', 'admin_manage_roles']}><AdminMainDashboard /></ProtectedRoute>} />
                                <Route path="admin/users" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><Admin /></ProtectedRoute>} />
                                <Route path="admin/doctors" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminDoctors /></ProtectedRoute>} />
                                <Route path="admin/labs" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabs /></ProtectedRoute>} />
                                <Route path="admin/lab-tests" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabTests /></ProtectedRoute>} />
                                <Route path="admin/pharmacy" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPharmacy /></ProtectedRoute>} />
                                <Route path="admin/reception" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminReception /></ProtectedRoute>} />
                                <Route path="admin/services" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminServices /></ProtectedRoute>} />
                                <Route path="admin/roles" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminRoles /></ProtectedRoute>} />
                                <Route path="admin/medicines" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminMedicines /></ProtectedRoute>} />
                                <Route path="admin/question-library" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminQuestionLibrary /></ProtectedRoute>} />
                                <Route path="admin/test-packages" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminTestPackages /></ProtectedRoute>} />
                                <Route path="admin/consent" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><ConsentManagement /></ProtectedRoute>} />
                                
                                {/* Dashboard routes — clinic vs full hospital */}
                                <Route path="hospitaladmin" element={
                                    <ProtectedRoute allowedRoles={['hospitaladmin', 'doctor', 'clinic doctor', 'reception', 'receptionist']}>
                                          {(() => {
                                              const u = JSON.parse(localStorage.getItem('user') || '{}');
                                              const useClinicHub = u.clinicType === 'clinic' || u.subscriptionPlan === 'starter';
                                              return useClinicHub ? <ClinicDashboard /> : <HospitalAdminDashboard />;
                                          })()}
                                    </ProtectedRoute>
                                } />
                                <Route path="hospitaladmin/question-library" element={<ProtectedRoute allowedRoles={['hospitaladmin']}><HospitalAdminQuestionLibrary /></ProtectedRoute>} />
                                <Route path="hospitaladmin/vials" element={<ProtectedRoute allowedRoles={['hospitaladmin']}><VialManagement /></ProtectedRoute>} />

                                <Route path="lab/dashboard" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><LabDashboard /></ProtectedRoute>} />
                                <Route path="lab/tests" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><AssignedTests /></ProtectedRoute>} />
                                <Route path="lab/completed" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><CompletedReports /></ProtectedRoute>} />

                                {/* Pharmacy Management Pages */}
                                <Route path="pharmacy/inventory" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyInventory /></ProtectedRoute>} />
                                <Route path="pharmacy/orders" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyOrders /></ProtectedRoute>} />
                                <Route path="pharmacy/purchase-invoices" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PurchaseInvoiceHistory /></ProtectedRoute>} />
                                <Route path="pharmacy/returns" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyReturns /></ProtectedRoute>} />
                                <Route path="pharmacy/vendor-returns" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><VendorReturns /></ProtectedRoute>} />
                                <Route path="pharmacy/collections" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyCollections /></ProtectedRoute>} />
                                <Route path="pharmacy/departments" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyDepartments /></ProtectedRoute>} />

                                {/* OT Management Multi-Page System */}
                                <Route path="ot-dashboard" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTDashboard /></ProtectedRoute>} />
                                <Route path="ot/dashboard" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTDashboard /></ProtectedRoute>} />
                                <Route path="ot/planned" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTPlannedSurgeries /></ProtectedRoute>} />
                                <Route path="ot/schedule" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTSchedulePage /></ProtectedRoute>} />
                                <Route path="ot/rooms" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTRoomsPage /></ProtectedRoute>} />
                                <Route path="ot/pre-op" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTPreOpPage /></ProtectedRoute>} />
                                <Route path="ot/in-progress" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTInProgressPage /></ProtectedRoute>} />
                                <Route path="ot/in-ot" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTInProgressPage /></ProtectedRoute>} />
                                <Route path="ot/post-op" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTPostOpPage /></ProtectedRoute>} />
                                <Route path="ot/completed" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTCompletedPage /></ProtectedRoute>} />
                                <Route path="ot/surgeons" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTSurgeonsPage /></ProtectedRoute>} />
                                <Route path="ot/reports" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'otmanager', 'otstaff', 'doctor', 'centraladmin', 'superadmin']}><OTReportsPage /></ProtectedRoute>} />

                                {/* Reception Pages */}
                                <Route path="reception/dashboard" element={<ProtectedRoute requiredPermissions={['appointment_manage']}><ReceptionDashboard /></ProtectedRoute>} />
                                <Route path="reception/patients" element={<ProtectedRoute requiredPermissions={['appointment_manage']}><ReceptionPatients /></ProtectedRoute>} />

                                {/* Accountant / Finance Pages */}
                                <Route path="accountant/dashboard" element={<ProtectedRoute requiredPermissions={['finance_view']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><AccountantDashboard /></ProtectedRoute>} />

                                {/* Patient Billing Profile — receptionist + accountant + admin */}
                                <Route path="billing/patient" element={<ProtectedRoute requiredPermissions={['billing_view', 'billing_manage', 'appointment_manage']} allowedRoles={['accountant', 'cashier', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin']}><PatientBillingProfile /></ProtectedRoute>} />
                                {/* Cashier / Billing */}
                                <Route path="cashier/billing" element={<ProtectedRoute requiredPermissions={['billing_view', 'billing_manage', 'appointment_manage']} allowedRoles={['billing', 'cashier', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin']}><CashierDashboard /></ProtectedRoute>} />

                                {/* Supreme Admin remains outside of hospital slugs */}
                                <Route path="/supremeadmin" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><CentralAdminDashboard /></ProtectedRoute>} />
                                <Route path="/supremeadmin/revenue" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><SystemRevenueDashboard /></ProtectedRoute>} />

                                <Route path="*" element={<Navigate to="/my-dashboard" />} />
                            </Routes>
                          </SubdomainRoleGuard>
                        </DashboardLayout>
                    ) : (
                        <Routes>
                            {/* Root & Login routing: On base domain / localhost / admin without hospital subdomain → Supreme Admin login */}
                            <Route path="/" element={(() => {
                                const sub = getSubdomain();
                                if (!sub || sub === 'admin' || RESERVED_SUBDOMAINS.includes(sub)) {
                                    return <Navigate to="/supremeadmin" replace />;
                                }
                                return <Navigate to="/login" replace />;
                            })()} />

                            {/* Staff Login URL: Redirects to Supreme Admin on base domain, or renders staff login on hospital subdomains */}
                            <Route path="/login" element={(() => {
                                const sub = getSubdomain();
                                if (!sub || sub === 'admin' || RESERVED_SUBDOMAINS.includes(sub)) {
                                    return <Navigate to="/supremeadmin" replace />;
                                }
                                return <Login />;
                            })()} />
                            
                            {/* Supreme Admin Isolated Login Route */}
                            <Route path="/supremeadmin" element={<CentralAdminLogin />} />
                            
                            {/* Legacy/Signups routing */}
                            <Route path="/signup" element={<Signup />} />
                            <Route path="/supremeadmin/signup" element={<CentralAdminSignup />} />
                            <Route path="/admin/signup" element={<AdminSignup />} />
                            
                            {/* Patient Portal UI */}
                            <Route path="/patient" element={<PatientPortalLogin />} />
                            <Route path="/patient/signup" element={<PatientSignup />} />
                            <Route path="/patient/forgot-password" element={<PatientForgotPassword />} />
                            <Route path="/patient/reset-password" element={<PatientResetPassword />} />
                            <Route path="/patient/dashboard" element={<PatientProtectedRoute><PatientDashboard /></PatientProtectedRoute>} />
                            <Route path="/patient/book-appointment" element={<PatientProtectedRoute><ReceptionDashboard isPatientPortal={true} /></PatientProtectedRoute>} />
                            
                            {/* Wildcard: non-hospital subdomains go to Supreme Admin, hospital subdomains to staff Login */}
                            <Route path="*" element={(() => {
                                const sub = getSubdomain();
                                if (!sub || sub === 'admin' || RESERVED_SUBDOMAINS.includes(sub)) {
                                    return <Navigate to="/supremeadmin" replace />;
                                }
                                return <Navigate to="/login" replace />;
                            })()} />
                        </Routes>
                    )}
                </Suspense>
            </RouteErrorBoundary>
        </>
    );
};

export default MainRoutes;
