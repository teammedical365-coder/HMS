const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Point to your env file

const Hospital = require('../src/models/hospital.model'); // Adjust path

const buildMobile = async () => {
    const hospitalId = process.argv[2];
    
    if (!hospitalId) {
        console.error('Usage: node build-mobile.js <hospital_id>');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to Database');

        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            console.error(`Hospital not found for ID: ${hospitalId}`);
            process.exit(1);
        }

        // Path to the capacitor configuration in the client directory
        const configPath = path.join(__dirname, '../../client/capacitor.config.json');
        
        let capacitorConfig = {
            appId: "com.medical365.app",
            appName: "Medical 365",
            webDir: "build",
            bundledWebRuntime: false
        };

        if (fs.existsSync(configPath)) {
            capacitorConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        if (hospital.whiteLabelEnabled) {
            console.log(`White-label enabled for ${hospital.name}. Applying custom branding...`);
            
            // Overwrite capacitor.config.json attributes
            capacitorConfig.appName = hospital.brandingSchema?.appName || capacitorConfig.appName;
            
            // Set up paths/colors for custom icons and splash screens if you are using capacitor-splash-screen
            capacitorConfig.plugins = {
                ...capacitorConfig.plugins,
                SplashScreen: {
                    launchShowDuration: 3000,
                    backgroundColor: hospital.brandingSchema?.themeColors?.primary || "#ffffff",
                }
            };
            
            fs.writeFileSync(configPath, JSON.stringify(capacitorConfig, null, 2));
            console.log("Ready for cap sync");
            
            // Note: If you have an icon replacement strategy (e.g., cordova-res or @capacitor/assets), 
            // you'd typically invoke that CLI command here as well.

        } else {
            console.log('White-label disabled. Reverting to default Medical 365 config...');
            
            capacitorConfig.appName = "Medical 365";
            capacitorConfig.appId = "com.medical365.app";
            
            if (capacitorConfig.plugins && capacitorConfig.plugins.SplashScreen) {
                capacitorConfig.plugins.SplashScreen.backgroundColor = "#ffffff";
            }
            
            fs.writeFileSync(configPath, JSON.stringify(capacitorConfig, null, 2));
            console.log("Ready for cap sync");
        }
        
    } catch (error) {
        console.error('Error during build preparation:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

buildMobile();
