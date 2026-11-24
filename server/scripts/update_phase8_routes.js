const fs = require('fs');
const path = require('path');

// 1. Update Mainroutes.jsx
const mainRoutesPath = path.resolve(__dirname, '../../client/src/routes/Mainroutes.jsx');
let content = fs.readFileSync(mainRoutesPath, 'utf8');

const targetImport = "const LabResultDetailPage = lazy(() => import('../pages/lab/LabResultDetailPage'));";
const newImports = targetImport + '\n' +
  "const LabReportDashboard = lazy(() => import('../pages/lab/LabReportDashboard'));\n" +
  "const LabReportGenerator = lazy(() => import('../pages/lab/LabReportGenerator'));\n" +
  "const LabReportReviewPage = lazy(() => import('../pages/lab/LabReportReviewPage'));\n" +
  "const LabReleasedReportsPage = lazy(() => import('../pages/lab/LabReleasedReportsPage'));\n" +
  "const LabReportTemplatePage = lazy(() => import('../pages/lab/LabReportTemplatePage'));\n" +
  "const LabReportDeliveryPage = lazy(() => import('../pages/lab/LabReportDeliveryPage'));";

if (!content.includes('LabReportDashboard')) {
  content = content.replace(targetImport, newImports);
}

const targetRoute = '<Route path="lab/completed" element={<LabProtectedRoute><CompletedReports /></LabProtectedRoute>} />';
const newRoutes = targetRoute + '\n' +
  '                                <Route path="lab/reports" element={<LabProtectedRoute><LabReportDashboard /></LabProtectedRoute>} />\n' +
  '                                <Route path="lab/reports/generate" element={<LabProtectedRoute allowedRoles={[\'lab admin\', \'lab manager\', \'lab technician\', \'technician\', \'pathologist\', \'hospitaladmin\', \'centraladmin\', \'superadmin\']}><LabReportGenerator /></LabProtectedRoute>} />\n' +
  '                                <Route path="lab/reports/review" element={<LabProtectedRoute allowedRoles={[\'lab admin\', \'lab manager\', \'pathologist\', \'hospitaladmin\', \'centraladmin\', \'superadmin\']}><LabReportReviewPage /></LabProtectedRoute>} />\n' +
  '                                <Route path="lab/reports/released" element={<LabProtectedRoute><LabReleasedReportsPage /></LabProtectedRoute>} />\n' +
  '                                <Route path="lab/reports/templates" element={<LabProtectedRoute allowedRoles={[\'lab admin\', \'lab manager\', \'pathologist\', \'hospitaladmin\', \'centraladmin\', \'superadmin\']}><LabReportTemplatePage /></LabProtectedRoute>} />\n' +
  '                                <Route path="lab/reports/delivery" element={<LabProtectedRoute><LabReportDeliveryPage /></LabProtectedRoute>} />';

if (!content.includes('path="lab/reports"')) {
  content = content.replace(targetRoute, newRoutes);
}

fs.writeFileSync(mainRoutesPath, content, 'utf8');
console.log('Mainroutes.jsx updated successfully');

// 2. Update LabSidebar.jsx
const sidebarPath = path.resolve(__dirname, '../../client/src/components/lab/LabSidebar.jsx');
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

// Add icons to import if missing
if (!sidebarContent.includes('FiSend')) {
  sidebarContent = sidebarContent.replace(
    'FiCheckSquare, FiRefreshCw, FiTruck, FiEdit3, FiAlertOctagon',
    'FiCheckSquare, FiRefreshCw, FiTruck, FiEdit3, FiAlertOctagon, FiSend, FiSliders, FiPlus'
  );
}

// Add Diagnostic Reports section before Management & Records
const managementSectionTarget = "sections.push({ title: 'Management & Records', items: opItems });";
const reportSectionCode = `        // Phase 8: Diagnostic Reports Workstation
        const reportItems = [
            { label: 'Reports Console', path: '/lab/reports', icon: <FiFileText /> },
            { label: 'Released Reports', path: '/lab/reports/released', icon: <FiCheckCircle /> }
        ];
        if (isAdmin || isManager || isTech || isPathologist) {
            reportItems.splice(1, 0, { label: 'Generate Reports', path: '/lab/reports/generate', icon: <FiPlus /> });
        }
        if (isAdmin || isManager || isPathologist) {
            reportItems.splice(2, 0, { label: 'Review & Sign-off', path: '/lab/reports/review', icon: <FiCheckSquare /> });
            reportItems.push({ label: 'Report Templates', path: '/lab/reports/templates', icon: <FiSliders /> });
        }
        reportItems.push({ label: 'Report Delivery', path: '/lab/reports/delivery', icon: <FiSend /> });
        sections.push({ title: 'Diagnostic Reports', items: reportItems });

        ` + managementSectionTarget;

if (!sidebarContent.includes('title: \'Diagnostic Reports\'')) {
  sidebarContent = sidebarContent.replace(managementSectionTarget, reportSectionCode);
}

fs.writeFileSync(sidebarPath, sidebarContent, 'utf8');
console.log('LabSidebar.jsx updated successfully');
