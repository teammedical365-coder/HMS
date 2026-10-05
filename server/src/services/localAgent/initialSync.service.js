const LocalInstallation = require('../../models/localInstallation.model');
const Hospital = require('../../models/hospital.model');
const Department = require('../../models/department.model');
const Doctor = require('../../models/doctor.model');
const Service = require('../../models/service.model');
const Bed = require('../../models/bed.model');
const Medicine = require('../../models/medicine.model');
const User = require('../../models/user.model');

const ENTITY_SYNC_ORDER = [
    'Hospital',
    'Department',
    'Doctor',
    'Service',
    'Bed',
    'Medicine',
    'Patient'
];

function sanitizeRecord(raw) {
    if (!raw) return null;
    const obj = (typeof raw.toObject === 'function') ? raw.toObject() : JSON.parse(JSON.stringify(raw));
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    delete obj.refreshToken;
    delete obj.__v;
    return obj;
}

class InitialSyncService {
    /**
     * Start initial sync on Cloud. Computes counts and prepares manifest.
     */
    async startInitialSync(hospitalId, installationId) {
        const inst = await LocalInstallation.findOne({ hospitalId, installationId });
        if (!inst) {
            throw new Error(`Installation '${installationId}' not found for hospital '${hospitalId}'`);
        }

        // Calculate counts for all 7 entities
        const [
            hospitalCount,
            deptCount,
            doctorCount,
            serviceCount,
            bedCount,
            medicineCount,
            patientCount
        ] = await Promise.all([
            Hospital.countDocuments({ _id: hospitalId }),
            Department.countDocuments({ hospitalId }),
            Doctor.countDocuments({ hospitalId }),
            Service.countDocuments({ $or: [{ hospitalId }, { hospitalId: null }] }),
            Bed.countDocuments({ hospitalId }),
            Medicine.countDocuments({}),
            User.countDocuments({ hospitalId, role: { $in: ['patient', 'Patient', null] } })
        ]);

        const progress = {
            Hospital: { total: hospitalCount, synced: 0 },
            Department: { total: deptCount, synced: 0 },
            Doctor: { total: doctorCount, synced: 0 },
            Service: { total: serviceCount, synced: 0 },
            Bed: { total: bedCount, synced: 0 },
            Medicine: { total: medicineCount, synced: 0 },
            Patient: { total: patientCount, synced: 0 }
        };

        const totalOverall = hospitalCount + deptCount + doctorCount + serviceCount + bedCount + medicineCount + patientCount;
        progress.overall = {
            total: totalOverall,
            synced: 0,
            percent: totalOverall === 0 ? 100 : 0
        };

        inst.syncStatus = inst.syncStatus || {};
        inst.syncStatus.initialSync = {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            completedAt: null,
            progress
        };
        inst.syncStatus.lastSyncError = null;

        await inst.save();

        return {
            success: true,
            status: 'IN_PROGRESS',
            entityOrder: ENTITY_SYNC_ORDER,
            progress
        };
    }

    /**
     * Fetch a paginated chunk of records for a specific entity.
     * Memory-safe batching (default 200 records per chunk).
     */
    async getInitialSyncBatch({ hospitalId, installationId, entityType, skip = 0, limit = 200 }) {
        const safeSkip = Math.max(0, parseInt(skip, 10) || 0);
        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 200), 500);

        let records = [];
        let total = 0;

        switch (entityType) {
            case 'Hospital': {
                const hosp = await Hospital.findById(hospitalId).lean();
                records = hosp ? [hosp] : [];
                total = records.length;
                break;
            }
            case 'Department': {
                total = await Department.countDocuments({ hospitalId });
                records = await Department.find({ hospitalId })
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            case 'Doctor': {
                total = await Doctor.countDocuments({ hospitalId });
                records = await Doctor.find({ hospitalId })
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            case 'Service': {
                total = await Service.countDocuments({ $or: [{ hospitalId }, { hospitalId: null }] });
                records = await Service.find({ $or: [{ hospitalId }, { hospitalId: null }] })
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            case 'Bed': {
                total = await Bed.countDocuments({ hospitalId });
                records = await Bed.find({ hospitalId })
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            case 'Medicine': {
                total = await Medicine.countDocuments({});
                records = await Medicine.find({})
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            case 'Patient': {
                const patientFilter = { hospitalId, role: { $in: ['patient', 'Patient', null] } };
                total = await User.countDocuments(patientFilter);
                records = await User.find(patientFilter)
                    .select('-password -resetPasswordToken -refreshToken')
                    .skip(safeSkip)
                    .limit(safeLimit)
                    .lean();
                break;
            }
            default:
                throw new Error(`Unsupported entity '${entityType}' for initial sync`);
        }

        const sanitized = records.map(sanitizeRecord);
        const recordsCount = sanitized.length;
        const hasMore = (safeSkip + recordsCount) < total;

        return {
            entityType,
            skip: safeSkip,
            limit: safeLimit,
            total,
            recordsCount,
            hasMore,
            records: sanitized
        };
    }

    /**
     * Local Agent reports progress on an entity batch.
     */
    async reportInitialSyncProgress({ hospitalId, installationId, entityType, syncedCount, isCompleted = false, error = null }) {
        const inst = await LocalInstallation.findOne({ hospitalId, installationId });
        if (!inst || !inst.syncStatus || !inst.syncStatus.initialSync) {
            throw new Error('Initial sync not active on installation');
        }

        const initialSync = inst.syncStatus.initialSync;
        if (!initialSync.progress) initialSync.progress = {};

        if (error) {
            initialSync.status = 'FAILED';
            inst.syncStatus.lastSyncError = error;
            await inst.save();
            return { success: false, status: 'FAILED', error };
        }

        // Update entity progress
        if (!initialSync.progress[entityType]) {
            initialSync.progress[entityType] = { total: 0, synced: 0 };
        }
        initialSync.progress[entityType].synced = Number(syncedCount) || 0;

        // Recalculate overall
        let totalAll = 0;
        let syncedAll = 0;
        for (const ent of ENTITY_SYNC_ORDER) {
            const entProg = initialSync.progress[ent] || { total: 0, synced: 0 };
            totalAll += entProg.total || 0;
            syncedAll += entProg.synced || 0;
        }

        const percent = totalAll === 0 ? 100 : Math.min(100, Math.round((syncedAll / totalAll) * 100));
        initialSync.progress.overall = {
            total: totalAll,
            synced: syncedAll,
            percent
        };

        if (isCompleted || (syncedAll >= totalAll && totalAll > 0)) {
            initialSync.status = 'COMPLETED';
            initialSync.completedAt = new Date();
            inst.syncStatus.lastSyncAt = new Date();
            inst.syncStatus.totalRecordsSynced = (inst.syncStatus.totalRecordsSynced || 0) + syncedAll;
        }

        if (typeof inst.markModified === 'function') {
            inst.markModified('syncStatus');
        }
        if (typeof inst.save === 'function') {
            await inst.save();
        }

        return {
            success: true,
            status: initialSync.status,
            progress: initialSync.progress
        };
    }
}

module.exports = new InitialSyncService();
