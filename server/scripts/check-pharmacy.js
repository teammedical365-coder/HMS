const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Inventory = require('../src/models/inventory.model');
const PharmacyOrder = require('../src/models/pharmacyOrder.model');

mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI).then(async () => {
    console.log('Connected to MongoDB');
    const orders = await PharmacyOrder.find().limit(5);
    console.log('Orders:', JSON.stringify(orders, null, 2));
    
    const inventories = await Inventory.find().limit(5);
    console.log('Inventories:', JSON.stringify(inventories, null, 2));

    mongoose.disconnect();
}).catch(console.error);
