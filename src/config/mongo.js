import mongoose from 'mongoose';

export async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error('Missing MongoDB connection string. Set MONGODB_URI in your environment.');
  }

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connection established');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB', error.message);
    throw error;
  }
}
