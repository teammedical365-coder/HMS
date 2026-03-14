/**
 * generate_slugs.js — One-time script to generate URL slugs for existing hospitals
 * Run: node src/scripts/generate_slugs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');

function slugify(name) {
    return name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected\n');

    const hospitals = await Hospital.find({});
    console.log(`Processing ${hospitals.length} hospitals...\n`);

    for (const h of hospitals) {
        if (h.slug) {
            console.log(`✓ ${h.name} → already has slug: ${h.slug}`);
            continue;
        }
        let slug = slugify(h.name);
        let counter = 1;
        while (await Hospital.findOne({ slug, _id: { $ne: h._id } })) {
            slug = slugify(h.name) + '-' + counter++;
        }
        await Hospital.updateOne({ _id: h._id }, { $set: { slug } });
        console.log(`✅ ${h.name} → ${slug}`);
    }

    console.log('\n🎉 Done! Login URLs:');
    const updated = await Hospital.find({}, 'name slug city');
    updated.forEach(h => console.log(`   /${h.slug}/login   (${h.name})`));

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
