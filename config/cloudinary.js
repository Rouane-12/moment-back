const cloudinary = require('cloudinary').v2;

const isConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️  Cloudinary configured');
} else {
  console.log('⚠️  Cloudinary not configured — image uploads will use base64 fallback');
}

// Base64 fallback storage when Cloudinary is not available
const base64Upload = async (file) => {
  return { secure_url: file, public_id: 'local-' + Date.now() };
};

module.exports = { cloudinary, isConfigured, base64Upload };
