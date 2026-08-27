const mongoose = require('mongoose');

let cachedDb = null;

const dbConnect = async () => {
  if (cachedDb) {
    return cachedDb;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const opts = {
    bufferCommands: false,
  };

  cachedDb = await mongoose.connect(process.env.MONGODB_URI, opts);
  console.log('MongoDB connected successfully');
  return cachedDb;
};

module.exports = dbConnect;

