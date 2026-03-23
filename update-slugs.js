const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './server/.env' });

const Hospital = require('./server/src/models/hospital.model');

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('Connected to DB. Updating hospitals...');
    const hospitals = await Hospital.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    console.log(`Found ${hospitals.length} hospitals without a slug.`);

    for (const h of hospitals) {
        let baseSlug = (h.name || 'hospital')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
            
        let slug = baseSlug;
        let counter = 1;
        while (await Hospital.findOne({ slug })) {
            slug = `${baseSlug}-${counter++}`;
        }
        
        h.slug = slug;
        await h.save();
        console.log(`Updated hospital ${h.name} with slug: ${slug}`);
    }
    console.log('Done organizing slugs.');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
