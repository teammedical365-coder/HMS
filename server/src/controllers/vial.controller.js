const mongoose = require('mongoose');
const VialMaster = require('../models/vial.model');
const UserMaster = require('../models/user.model');
const { getTenantModels } = require('../db/tenantModels');

const getVialModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Vial || VialMaster;
    return VialMaster;
};

/**
 * Robust patient lookup: Checks Master DB (where patients are registered)
 * with fallback to tenant DB if configured.
 */
const findPatient = async (patientId, req) => {
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) return null;
    let patient = await UserMaster.findById(patientId)
        .select('_id name hospitalId role patientId mrn phone gender dob age avatar')
        .lean();
    if (!patient && req?.tenantDb) {
        try {
            const TenantUser = getTenantModels(req.tenantDb).User;
            if (TenantUser) {
                patient = await TenantUser.findById(patientId)
                    .select('_id name hospitalId role patientId mrn phone gender dob age avatar')
                    .lean();
            }
        } catch (e) {
            // Ignore fallback error
        }
    }
    return patient;
};

/**
 * Robust population of patientId across Master and Tenant DBs
 */
const populateVialPatient = async (vials, req) => {
    if (!vials) return vials;
    const isArray = Array.isArray(vials);
    const list = isArray ? vials : [vials];

    await Promise.all(list.map(async (item) => {
        if (item && item.patientId) {
            const rawP = typeof item.patientId === 'object' && item.patientId._id ? item.patientId._id : item.patientId;
            let p = await UserMaster.findById(rawP)
                .select('_id name patientId mrn phone gender dob age avatar')
                .lean();
            if (!p && req?.tenantDb) {
                try {
                    const TenantUser = getTenantModels(req.tenantDb).User;
                    if (TenantUser) {
                        p = await TenantUser.findById(rawP)
                            .select('_id name patientId mrn phone gender dob age avatar')
                            .lean();
                    }
                } catch (e) {
                    // Ignore error
                }
            }
            if (p) {
                item.patientId = p;
            }
        }
    }));

    return isArray ? list : list[0];
};

/**
 * Generate a sequential, globally unique Vial ID scoped to the hospital
 * e.g., VL-000001, VL-000002
 */
const generateVialId = async (Vial, hospitalId) => {
    const latestVial = await Vial.findOne({
        hospitalId,
        vialId: { $regex: /^VL-\d+$/ }
    })
    .sort({ createdAt: -1 })
    .select('vialId')
    .lean();

    let nextNum = 1;
    if (latestVial && latestVial.vialId) {
        const match = latestVial.vialId.match(/^VL-(\d+)$/);
        if (match && match[1]) {
            nextNum = parseInt(match[1], 10) + 1;
        }
    }

    // Safety loop to ensure absolute uniqueness against concurrent creations
    let candidateId = `VL-${String(nextNum).padStart(6, '0')}`;
    let exists = await Vial.exists({ hospitalId, vialId: candidateId });
    while (exists) {
        nextNum += 1;
        candidateId = `VL-${String(nextNum).padStart(6, '0')}`;
        exists = await Vial.exists({ hospitalId, vialId: candidateId });
    }
    return candidateId;
};

/**
 * @route   POST /api/vials
 * @desc    Register / Store a new vial for a patient
 * @access  Hospital Admin only
 */
exports.createVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required' });
        }

        const {
            patientId,
            vialId: customVialId,
            vialType,
            description,
            receivedAt,
            currentLocation,
            notes,
            initialStatus
        } = req.body;

        // 1. Validate Patient
        if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Valid Patient ID is required' });
        }

        const patient = await findPatient(patientId, req);
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found in the database' });
        }

        // Multi-tenant check: patient must belong to the same hospital (or null/global)
        if (patient.hospitalId && patient.hospitalId.toString() !== hospitalId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied: Patient belongs to another hospital' });
        }

        const Vial = getVialModel(req);

        // 2. Determine Vial ID
        let finalVialId = customVialId && customVialId.trim() ? customVialId.trim() : null;
        if (finalVialId) {
            const existing = await Vial.findOne({ hospitalId, vialId: finalVialId }).lean();
            if (existing) {
                return res.status(409).json({ success: false, message: `Vial ID "${finalVialId}" is already in use in this hospital` });
            }
        } else {
            finalVialId = await generateVialId(Vial, hospitalId);
        }

        // 3. Determine Initial Status and Location
        const loc = currentLocation || {};
        const hasStorageLocation = Boolean(loc.storageUnit && loc.storageUnit.trim());
        
        let status = 'Received';
        if (initialStatus === 'Stored' || hasStorageLocation) {
            status = 'Stored';
        }

        const cleanLocation = {
            room: (loc.room || '').trim(),
            storageUnit: (loc.storageUnit || '').trim(),
            rack: (loc.rack || '').trim(),
            box: (loc.box || '').trim(),
            position: (loc.position || '').trim()
        };

        const receivedDate = receivedAt ? new Date(receivedAt) : new Date();

        // 4. Create Initial Audit Entry
        const initialAudit = {
            action: status === 'Stored' ? 'Stored' : 'Received',
            timestamp: receivedDate,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: null,
            newStatus: status,
            previousLocation: {},
            newLocation: status === 'Stored' ? cleanLocation : {},
            reason: 'Initial Registration / Sample Intake',
            notes: (notes || '').trim()
        };

        const newVial = new Vial({
            vialId: finalVialId,
            hospitalId,
            patientId: patient._id,
            vialType: vialType || 'Biological Sample',
            description: (description || '').trim(),
            receivedAt: receivedDate,
            currentStatus: status,
            currentLocation: status === 'Stored' ? cleanLocation : {},
            notes: (notes || '').trim(),
            createdBy: req.user._id,
            updatedBy: req.user._id,
            auditHistory: [initialAudit]
        });

        await newVial.save();

        let populatedVial = await Vial.findById(newVial._id).lean();
        populatedVial = await populateVialPatient(populatedVial, req);

        return res.status(201).json({
            success: true,
            message: `Vial ${finalVialId} registered successfully`,
            vial: populatedVial
        });
    } catch (error) {
        console.error('[createVial Error]:', error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Duplicate Vial ID detected. Please try again with a unique ID.' });
        }
        return res.status(500).json({ success: false, message: error.message || 'Internal server error while registering vial' });
    }
};

/**
 * @route   GET /api/vials
 * @desc    Get paginated, filtered, and searchable list of vials in the hospital
 * @access  Hospital Admin only
 */
exports.getVials = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required' });
        }

        const Vial = getVialModel(req);

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const skip = (page - 1) * limit;

        const hId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;
        const query = {
            $or: [
                { hospitalId: hId },
                { hospitalId: String(hospitalId) }
            ]
        };

        // 1. Status Filter
        if (req.query.status && req.query.status !== 'All') {
            query.currentStatus = req.query.status;
        }

        // 2. Vial Type Filter
        if (req.query.vialType && req.query.vialType !== 'All') {
            query.vialType = req.query.vialType;
        }

        // 3. Storage Unit Filter
        if (req.query.storageUnit && req.query.storageUnit.trim()) {
            query['currentLocation.storageUnit'] = { $regex: req.query.storageUnit.trim(), $options: 'i' };
        }

        // 4. Date Range Filter
        if (req.query.startDate || req.query.endDate) {
            query.receivedAt = {};
            if (req.query.startDate) {
                query.receivedAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                end.setHours(23, 59, 59, 999);
                query.receivedAt.$lte = end;
            }
        }

        // 5. Search Filter (Vial ID, Patient Name, MRN, Patient ID)
        if (req.query.search && req.query.search.trim()) {
            const searchTerm = req.query.search.trim();
            const safeSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regexSearch = { $regex: safeSearch, $options: 'i' };

            // Find matching patient IDs from UserMaster
            const Role = require('../models/role.model');
            const patientRoles = await Role.find({ name: { $regex: /^patient$/i } }).select('_id').lean();
            const patientRoleIds = ['patient', 'Patient', ...patientRoles.map(r => r._id), ...patientRoles.map(r => r._id.toString())];

            const matchingPatients = await UserMaster.find({
                $and: [
                    { $or: [{ hospitalId }, { hospitalId: null }, { hospitalId: { $exists: false } }] },
                    {
                        $or: [
                            { role: { $in: patientRoleIds } },
                            { patientId: { $exists: true, $ne: null, $ne: '' } },
                            { mrn: { $exists: true, $ne: null, $ne: '' } }
                        ]
                    },
                    {
                        $or: [
                            { name: regexSearch },
                            { patientId: regexSearch },
                            { mrn: regexSearch },
                            { phone: regexSearch }
                        ]
                    }
                ]
            }).select('_id').lean();

            const matchedPatientIds = matchingPatients.map(p => p._id);

            query.$or = [
                { vialId: regexSearch },
                { description: regexSearch },
                { 'currentLocation.storageUnit': regexSearch },
                { patientId: { $in: matchedPatientIds } }
            ];
        }

        let [vials, totalRecords] = await Promise.all([
            Vial.find(query)
                .sort({ receivedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('createdBy', 'name email')
                .lean(),
            Vial.countDocuments(query)
        ]);

        vials = await populateVialPatient(vials, req);
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        return res.json({
            success: true,
            vials,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                pageSize: limit
            }
        });
    } catch (error) {
        console.error('[getVials Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error fetching vials' });
    }
};

/**
 * @route   GET /api/vials/stats
 * @desc    Aggregate summary statistics for Hospital Admin workspace
 * @access  Hospital Admin only
 */
exports.getVialStats = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required' });
        }

        const Vial = getVialModel(req);
        const hId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;
        const hospitalMatch = {
            $or: [
                { hospitalId: hId },
                { hospitalId: String(hospitalId) }
            ]
        };

        const [total, stored, moved, returned, retrieved, discarded, received] = await Promise.all([
            Vial.countDocuments(hospitalMatch),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Stored' }),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Moved' }),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Returned' }),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Retrieved' }),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Discarded' }),
            Vial.countDocuments({ ...hospitalMatch, currentStatus: 'Received' })
        ]);

        return res.json({
            success: true,
            stats: {
                totalVials: total,
                currentlyStored: stored + moved + returned,
                storedCount: stored,
                movedCount: moved,
                returnedCount: returned,
                retrievedCount: retrieved,
                discardedCount: discarded,
                receivedCount: received
            }
        });
    } catch (error) {
        console.error('[getVialStats Error]:', error);
        return res.status(500).json({ success: false, message: 'Error retrieving vial statistics' });
    }
};

/**
 * @route   GET /api/vials/patient/:patientId
 * @desc    Get all vials and summary statistics for a specific patient in this hospital
 * @access  Hospital Admin only
 */
exports.getPatientVials = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required' });
        }

        const { patientId } = req.params;
        if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Valid Patient ID is required' });
        }

        const patient = await findPatient(patientId, req);
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found in this hospital' });
        }

        if (patient.hospitalId && patient.hospitalId.toString() !== hospitalId.toString()) {
            return res.status(403).json({ success: false, message: 'Patient belongs to another hospital' });
        }

        const Vial = getVialModel(req);
        let vials = await Vial.find({
            hospitalId,
            patientId: patient._id
        })
        .sort({ receivedAt: -1, createdAt: -1 })
        .populate('createdBy', 'name email')
        .lean();

        vials = await populateVialPatient(vials, req);

        // Calculate patient-specific summary counts
        let total = vials.length;
        let stored = 0;
        let retrieved = 0;
        let discarded = 0;

        vials.forEach(v => {
            if (['Stored', 'Moved', 'Returned'].includes(v.currentStatus)) stored++;
            else if (v.currentStatus === 'Retrieved') retrieved++;
            else if (v.currentStatus === 'Discarded') discarded++;
        });

        return res.json({
            success: true,
            patient,
            vials,
            stats: {
                totalVials: total,
                currentlyStored: stored,
                retrievedCount: retrieved,
                discardedCount: discarded
            }
        });
    } catch (error) {
        console.error('[getPatientVials Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error fetching patient vials' });
    }
};

/**
 * @route   GET /api/vials/:id
 * @desc    Get complete vial details with chronological audit & movement history
 * @access  Hospital Admin only
 */
exports.getVialById = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID parameter' });
        }

        const Vial = getVialModel(req);
        let vial = await Vial.findOne({ _id: id, hospitalId })
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .lean();

        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found in this hospital' });
        }

        vial = await populateVialPatient(vial, req);

        // Sort audit history chronologically (newest first for display)
        if (Array.isArray(vial.auditHistory)) {
            vial.auditHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        return res.json({ success: true, vial });
    } catch (error) {
        console.error('[getVialById Error]:', error);
        return res.status(500).json({ success: false, message: 'Error retrieving vial details' });
    }
};

/**
 * @route   PUT /api/vials/:id
 * @desc    Edit allowed metadata on a vial (description, vialType, notes)
 * @access  Hospital Admin only
 */
exports.updateVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found in this hospital' });
        }

        if (vial.currentStatus === 'Discarded') {
            return res.status(400).json({ success: false, message: 'Discarded vials are closed and cannot be modified' });
        }

        const { vialType, description, notes, currentLocation, room, storageUnit, rack, box, position } = req.body;
        if (vialType) vial.vialType = vialType;
        if (description !== undefined) vial.description = description.trim();
        if (notes !== undefined) vial.notes = notes.trim();

        // Location updates if provided
        const loc = currentLocation || {};
        if (room !== undefined || loc.room !== undefined) vial.currentLocation.room = String(room !== undefined ? room : loc.room).trim();
        if (storageUnit !== undefined || loc.storageUnit !== undefined) vial.currentLocation.storageUnit = String(storageUnit !== undefined ? storageUnit : loc.storageUnit).trim();
        if (rack !== undefined || loc.rack !== undefined) vial.currentLocation.rack = String(rack !== undefined ? rack : loc.rack).trim();
        if (box !== undefined || loc.box !== undefined) vial.currentLocation.box = String(box !== undefined ? box : loc.box).trim();
        if (position !== undefined || loc.position !== undefined) vial.currentLocation.position = String(position !== undefined ? position : loc.position).trim();
        vial.markModified('currentLocation');

        vial.updatedBy = req.user._id;

        // Append audit log for metadata edit
        vial.auditHistory.push({
            action: 'Updated',
            timestamp: new Date(),
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: vial.currentStatus,
            newStatus: vial.currentStatus,
            previousLocation: vial.currentLocation,
            newLocation: vial.currentLocation,
            reason: 'Vial details updated',
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({ success: true, message: 'Vial updated successfully', vial: updated });
    } catch (error) {
        console.error('[updateVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error updating vial' });
    }
};

/**
 * @route   POST /api/vials/:id/store
 * @desc    Assign storage location to a Received vial (Received -> Stored)
 * @access  Hospital Admin only
 */
exports.storeVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const { storageUnit, rack, box, position, room, notes } = req.body;
        if (!storageUnit || !storageUnit.trim()) {
            return res.status(400).json({ success: false, message: 'Storage Unit is required to store a vial' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found' });
        }

        if (vial.currentStatus === 'Discarded') {
            return res.status(400).json({ success: false, message: 'Discarded vials cannot be stored' });
        }

        const prevStatus = vial.currentStatus;
        const prevLocation = { ...vial.currentLocation.toObject() };

        const newLocation = {
            room: (room || '').trim(),
            storageUnit: storageUnit.trim(),
            rack: (rack || '').trim(),
            box: (box || '').trim(),
            position: (position || '').trim()
        };

        vial.currentStatus = 'Stored';
        vial.currentLocation = newLocation;
        vial.updatedBy = req.user._id;

        vial.auditHistory.push({
            action: 'Stored',
            timestamp: new Date(),
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: prevStatus,
            newStatus: 'Stored',
            previousLocation: prevLocation,
            newLocation,
            reason: 'Storage assigned',
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({
            success: true,
            message: `Vial ${vial.vialId} stored successfully`,
            vial: updated
        });
    } catch (error) {
        console.error('[storeVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error storing vial' });
    }
};

/**
 * @route   POST /api/vials/:id/move
 * @desc    Move a stored vial to a new location
 * @access  Hospital Admin only
 */
exports.moveVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const { storageUnit, rack, box, position, room, reason, notes } = req.body;
        if (!storageUnit || !storageUnit.trim()) {
            return res.status(400).json({ success: false, message: 'Destination Storage Unit is required' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found' });
        }

        if (vial.currentStatus === 'Discarded') {
            return res.status(400).json({ success: false, message: 'Cannot move a discarded vial' });
        }
        if (vial.currentStatus === 'Retrieved') {
            return res.status(400).json({ success: false, message: 'Vial is currently retrieved. Please return it to storage instead.' });
        }

        const prevStatus = vial.currentStatus;
        const prevLocation = { ...vial.currentLocation.toObject() };

        const newLocation = {
            room: (room || '').trim(),
            storageUnit: storageUnit.trim(),
            rack: (rack || '').trim(),
            box: (box || '').trim(),
            position: (position || '').trim()
        };

        vial.currentStatus = 'Moved';
        vial.currentLocation = newLocation;
        vial.updatedBy = req.user._id;

        vial.auditHistory.push({
            action: 'Moved',
            timestamp: new Date(),
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: prevStatus,
            newStatus: 'Moved',
            previousLocation: prevLocation,
            newLocation,
            reason: (reason || 'Location rearrangement').trim(),
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({
            success: true,
            message: `Vial ${vial.vialId} moved to new location`,
            vial: updated
        });
    } catch (error) {
        console.error('[moveVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error moving vial' });
    }
};

/**
 * @route   POST /api/vials/:id/retrieve
 * @desc    Retrieve a stored vial (Stored/Moved -> Retrieved)
 * @access  Hospital Admin only
 */
exports.retrieveVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const { reason, retrievalDate, notes } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Retrieval reason is required' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found' });
        }

        if (vial.currentStatus === 'Discarded') {
            return res.status(400).json({ success: false, message: 'Cannot retrieve a discarded vial' });
        }
        if (vial.currentStatus === 'Retrieved') {
            return res.status(400).json({ success: false, message: 'Vial is already retrieved' });
        }

        const prevStatus = vial.currentStatus;
        const prevLocation = { ...vial.currentLocation.toObject() };
        const retDate = retrievalDate ? new Date(retrievalDate) : new Date();

        vial.currentStatus = 'Retrieved';
        // Clear active location so UI accurately reflects it is out of storage
        vial.currentLocation = { room: '', storageUnit: '', rack: '', box: '', position: '' };
        vial.updatedBy = req.user._id;

        vial.auditHistory.push({
            action: 'Retrieved',
            timestamp: retDate,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: prevStatus,
            newStatus: 'Retrieved',
            previousLocation: prevLocation,
            newLocation: {},
            reason: reason.trim(),
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({
            success: true,
            message: `Vial ${vial.vialId} retrieved from storage`,
            vial: updated
        });
    } catch (error) {
        console.error('[retrieveVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error retrieving vial' });
    }
};

/**
 * @route   POST /api/vials/:id/return
 * @desc    Return a retrieved vial back to storage (Retrieved -> Stored)
 * @access  Hospital Admin only
 */
exports.returnVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const { storageUnit, rack, box, position, room, returnDate, notes } = req.body;
        if (!storageUnit || !storageUnit.trim()) {
            return res.status(400).json({ success: false, message: 'Storage Unit is required to return vial to storage' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found' });
        }

        if (vial.currentStatus !== 'Retrieved') {
            return res.status(400).json({ success: false, message: `Only retrieved vials can be returned to storage (current status is "${vial.currentStatus}")` });
        }

        const prevStatus = vial.currentStatus;
        const retDate = returnDate ? new Date(returnDate) : new Date();

        const newLocation = {
            room: (room || '').trim(),
            storageUnit: storageUnit.trim(),
            rack: (rack || '').trim(),
            box: (box || '').trim(),
            position: (position || '').trim()
        };

        vial.currentStatus = 'Stored';
        vial.currentLocation = newLocation;
        vial.updatedBy = req.user._id;

        vial.auditHistory.push({
            action: 'Returned',
            timestamp: retDate,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: prevStatus,
            newStatus: 'Stored',
            previousLocation: {},
            newLocation,
            reason: 'Returned to storage position',
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({
            success: true,
            message: `Vial ${vial.vialId} successfully returned to storage`,
            vial: updated
        });
    } catch (error) {
        console.error('[returnVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error returning vial to storage' });
    }
};

/**
 * @route   POST /api/vials/:id/discard
 * @desc    Mark a vial as Discarded with deliberate confirmation and audit trail
 * @access  Hospital Admin only
 */
exports.discardVial = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Vial ID' });
        }

        const { discardReason, discardDate, notes } = req.body;
        if (!discardReason || discardReason.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'A valid discard reason (at least 3 characters) is required' });
        }

        const Vial = getVialModel(req);
        const vial = await Vial.findOne({ _id: id, hospitalId });
        if (!vial) {
            return res.status(404).json({ success: false, message: 'Vial not found' });
        }

        if (vial.currentStatus === 'Discarded') {
            return res.status(400).json({ success: false, message: 'Vial is already marked as discarded' });
        }

        const prevStatus = vial.currentStatus;
        const prevLocation = { ...vial.currentLocation.toObject() };
        const dDate = discardDate ? new Date(discardDate) : new Date();

        vial.currentStatus = 'Discarded';
        // Clear active location
        vial.currentLocation = { room: '', storageUnit: '', rack: '', box: '', position: '' };
        vial.updatedBy = req.user._id;

        vial.auditHistory.push({
            action: 'Discarded',
            timestamp: dDate,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Hospital Admin',
            previousStatus: prevStatus,
            newStatus: 'Discarded',
            previousLocation: prevLocation,
            newLocation: {},
            reason: discardReason.trim(),
            notes: (notes || '').trim()
        });

        await vial.save();

        let updated = await Vial.findById(vial._id).lean();
        updated = await populateVialPatient(updated, req);

        return res.json({
            success: true,
            message: `Vial ${vial.vialId} marked as discarded`,
            vial: updated
        });
    } catch (error) {
        console.error('[discardVial Error]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error marking vial as discarded' });
    }
};
