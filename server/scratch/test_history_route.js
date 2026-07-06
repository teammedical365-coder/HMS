require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const ClinicPatient = require('../src/models/clinicPatient.model');
const Appointment = require('../src/models/appointment.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function run() {
    await mongoose.connect(DB_URI);
    
    // Find a clinic doctor user
    const Role = require('../src/models/role.model');
    const clinicDocRole = await Role.findOne({ name: 'Clinic Doctor' });
    const doctorUser = await User.findOne({ role: clinicDocRole._id });
    if (!doctorUser) {
        console.log('No clinic doctor user found!');
        await mongoose.disconnect();
        return;
    }
    
    console.log('Using doctor user:', doctorUser.name, doctorUser.email, 'Role:', clinicDocRole.name);
    
    const req = {
        params: { id: '6a3f832c98baa12e4ce315be' },
        user: {
            id: doctorUser._id.toString(),
            role: doctorUser.role.toString(),
            hospitalId: doctorUser.hospitalId ? doctorUser.hospitalId.toString() : null,
            _roleData: clinicDocRole
        }
    };
    
    const res = {
        status(code) {
            console.log('STATUS:', code);
            return this;
        },
        json(data) {
            console.log('JSON RESPONSE:', JSON.stringify(data, null, 2));
            return this;
        }
    };
    
    // Simulate route logic
    try {
        const userId = req.params.id;
        const roleData = req.user._roleData;

        const allowedRoles = ['doctor', 'clinic doctor', 'nurse', 'superadmin', 'admin', 'reception', 'receptionist', 'lab', 'pharmacy', 'centraladmin', 'hospitaladmin'];
        const userRole = (req.user.role ? String(req.user.role) : '').toLowerCase();
        const dynRole = (roleData?.name || '').toLowerCase();
        
        const hasPermission = (req.user.permissions || []).includes('patient_view') || 
                              (req.user.permissions || []).includes('visit_diagnose') ||
                              (req.user._roleData?.permissions || []).includes('patient_view') ||
                              (req.user._roleData?.permissions || []).includes('visit_diagnose');

        const hasAccess = allowedRoles.includes(userRole) || allowedRoles.includes(dynRole) || hasPermission;

        if (!hasAccess && userRole !== 'superadmin') {
            console.log('Access Denied. hasAccess:', hasAccess, 'userRole:', userRole, 'dynRole:', dynRole);
            await mongoose.disconnect();
            return;
        }

        const isRestrictedRole = ['pharmacy', 'lab'].includes((roleData?.name || '').toLowerCase());

        const ClinicalVisit = require('../src/models/clinicalVisit.model');
        const LabReport = require('../src/models/labReport.model');
        const PharmacyOrder = require('../src/models/pharmacyOrder.model');

        const isObjectId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;

        if (!isObjectId && (!/^[A-Za-z0-9_-]{3,30}$/.test(userId))) {
            console.log('Invalid patient ID check failed');
            await mongoose.disconnect();
            return;
        }

        const userQuery = isObjectId ? { _id: userId } : { patientId: userId };
        if (req.user.hospitalId) userQuery.hospitalId = req.user.hospitalId;
        
        let user = await User.findOne(userQuery).lean();
        let isClinicPatient = false;

        if (!user) {
            const ClinicPatient = require('../src/models/clinicPatient.model');
            const clinicQuery = isObjectId ? { _id: userId } : { patientUid: userId };
            if (req.user.hospitalId) clinicQuery.clinicId = req.user.hospitalId;
            
            const cp = await ClinicPatient.findOne(clinicQuery).lean();
            if (cp) {
                user = cp;
                isClinicPatient = true;
            }
        }

        if (!user) {
            console.log('Patient not found');
            await mongoose.disconnect();
            return;
        }

        const realUserId = user._id;
        const patientIdStr = user.patientId || user.patientUid || userId;

        const hid = req.user.hospitalId;
        const hFilter = hid ? { hospitalId: hid } : {};

        let visits = [];
        let labs = [];
        let pharmacies = [];
        let appointments = [];
        let plans = [];

        const idList = [realUserId];
        if (patientIdStr && String(patientIdStr) !== String(realUserId)) {
            idList.push(patientIdStr);
        }

        const objectIdList = idList.filter(id => mongoose.Types.ObjectId.isValid(id));

        if (isClinicPatient) {
            const TreatmentPlan = require('../src/models/treatmentPlan.model');
            appointments = await Appointment.find({ 
                $or: [
                    { clinicPatientId: { $in: objectIdList } }, 
                    { userId: { $in: objectIdList } }, 
                    { patientId: { $in: idList } }
                ], 
                ...hFilter 
            }).lean();
            plans = await TreatmentPlan.find({ clinicPatientId: { $in: objectIdList }, ...hFilter }).lean();
        } else {
            const visitQuery = { $or: [{ patientId: { $in: idList } }], ...hFilter };
            const labQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            const pharmaQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            const apptQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };

            [visits, labs, pharmacies, appointments] = await Promise.all([
                ClinicalVisit.find(visitQuery).lean(),
                LabReport.find(labQuery).lean(),
                PharmacyOrder.find(pharmaQuery).lean(),
                Appointment.find(apptQuery).lean()
            ]);
        }

        let timeline = [];

        visits.forEach(v => {
            let summary = {
                primaryComplaint: v.intake?.chiefComplaint || 'No complaint recorded',
                doctorSeen: v.doctorConsultation?.doctorId || 'Pending',
                outcome: v.doctorConsultation?.diagnosis?.join(', ') || 'Processing'
            };
            let item = { type: 'clinicalVisit', date: v.visitDate || v.createdAt, data: v, summary };
            if (isRestrictedRole && item.data.doctorConsultation) {
                delete item.data.doctorConsultation.clinicalNotes;
            }
            timeline.push(item);
        });

        labs.forEach(l => timeline.push({ type: 'labReport', date: l.createdAt, data: l }));
        pharmacies.forEach(p => timeline.push({ type: 'pharmacyOrder', date: p.createdAt, data: p }));
        appointments.forEach(a => timeline.push({ type: 'appointment', date: a.appointmentDate, data: a }));

        plans.forEach(tp => {
            timeline.push({
                type: 'treatmentPlan',
                date: tp.createdAt,
                data: {
                    title: tp.title,
                    description: tp.description,
                    totalAmount: tp.totalAmount,
                    totalPaid: tp.totalPaid,
                    pendingBalance: tp.pendingBalance,
                    status: tp.status,
                    visits: tp.visits || []
                }
            });
        });

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
        console.log('Success! Timeline entries:', timeline.length);
        
    } catch (err) {
        console.error('ERROR STACKTRACE:', err.stack);
    }
    
    await mongoose.disconnect();
}
run();
