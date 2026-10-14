import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDb() {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    const { name, port } = mongoose.connection;
    console.log(`Database ready: ${name} on port ${port}`);
}
