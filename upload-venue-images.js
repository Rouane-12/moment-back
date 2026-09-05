require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { cloudinary, isConfigured } = require('./config/cloudinary');
const Venue = require('./models/Venue');

// Path to the public/MOMENTS folder
const MOMENTS_PATH = path.join(__dirname, '../front end/public/MOMENTS');

// Map folder names to venue names
const CATEGORY_MAP = {
  'CHILL': 'chill',
  'DIVERTISSEMENT': 'divertissement',
  'FOOD': 'food',
  'FUN': 'fun',
  'NIGHT': 'night',
  'SURPRISE': 'surprise'
};

async function uploadImageToCloudinary(imagePath, venueName, category) {
  try {
    if (!isConfigured) {
      console.log('⚠️  Cloudinary not configured, skipping upload');
      return null;
    }

    const result = await cloudinary.uploader.upload(imagePath, {
      folder: `moment-venues/${category}`,
      public_id: `${venueName}-${path.basename(imagePath, path.extname(imagePath))}`,
      transformation: [
        { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
      ]
    });

    console.log(`✅ Uploaded: ${path.basename(imagePath)} -> ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error(`❌ Error uploading ${imagePath}:`, error.message);
    return null;
  }
}

async function processVenueImages() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    const categories = fs.readdirSync(MOMENTS_PATH);
    
    for (const categoryFolder of categories) {
      const categoryPath = path.join(MOMENTS_PATH, categoryFolder);
      
      // Skip if not a directory
      if (!fs.statSync(categoryPath).isDirectory()) continue;
      
      console.log(`\n📁 Processing category: ${categoryFolder}`);
      
      const venueFolders = fs.readdirSync(categoryPath);
      
      for (const venueFolder of venueFolders) {
        const venuePath = path.join(categoryPath, venueFolder);
        
        // Skip if not a directory
        if (!fs.statSync(venuePath).isDirectory()) continue;
        
        // Skip empty folders
        const files = fs.readdirSync(venuePath);
        if (files.length === 0) {
          console.log(`⏭️  Skipping empty folder: ${venueFolder}`);
          continue;
        }
        
        console.log(`\n🏢 Processing venue: ${venueFolder}`);
        
        // Find matching venue in database
        const venue = await Venue.findOne({ 
          name: { $regex: new RegExp(venueFolder, 'i') }
        });
        
        if (!venue) {
          console.log(`⚠️  Venue not found in database: ${venueFolder}`);
          continue;
        }
        
        console.log(`✅ Found venue: ${venue.name} (ID: ${venue._id})`);
        
        // Get first image
        const imageFiles = files.filter(f => 
          /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
        ).sort();
        
        if (imageFiles.length === 0) {
          console.log(`⚠️  No images found for ${venueFolder}`);
          continue;
        }
        
        const firstImage = imageFiles[0];
        const imagePath = path.join(venuePath, firstImage);
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadImageToCloudinary(
          imagePath, 
          venueFolder.replace(/\s+/g, '-').toLowerCase(),
          categoryFolder.toLowerCase()
        );
        
        if (cloudinaryUrl) {
          // Update venue with new image
          if (venue.media && venue.media.length > 0) {
            // Replace first image
            venue.media[0].url = cloudinaryUrl;
          } else {
            // Add new media
            venue.media = [{
              type: 'image',
              url: cloudinaryUrl,
              sortOrder: 0
            }];
          }
          
          await venue.save();
          console.log(`💾 Updated venue ${venue.name} with Cloudinary image`);
        }
      }
    }
    
    console.log('\n✨ Image upload process completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

processVenueImages();
