import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Ensure SRV DNS resolution works reliably for MongoDB Atlas on Windows/local networks
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // fallback to system default
}

let mongoMemoryServerInstance: any = null;

// Setup Mongoose connection event listeners once
mongoose.connection.on('connected', () => {
  console.log('✓ MongoDB connection established successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error('✗ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('! MongoDB disconnected.');
});

/**
 * MongoDB Connection Utility with Atlas Support, Error Handling & Graceful Shutdown
 */
export async function connectDB(): Promise<typeof mongoose> {
  // If already connected, reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // If currently connecting, wait until connected
  if (mongoose.connection.readyState === 2) {
    await new Promise<void>((resolve) => {
      mongoose.connection.once('connected', () => resolve());
    });
    return mongoose;
  }

  const uri = process.env.MONGODB_URI && process.env.MONGODB_URI.trim() !== ''
    ? process.env.MONGODB_URI.trim()
    : null;

  if (uri) {
    console.log(`Connecting to MongoDB at: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
      });
      return mongoose;
    } catch (err: any) {
      console.error('Failed to connect to provided MONGODB_URI:', err.message);
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('Falling back to In-Memory MongoDB Server for development resilience...');
    }
  }

  // Fallback to MongoMemoryServer for development / testing if no Atlas URI is reachable
  try {
    if (!mongoMemoryServerInstance) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const fs = await import('fs');
      const path = await import('path');
      const localDbDir = path.resolve(process.cwd(), '.mongo-data');
      if (!fs.existsSync(localDbDir)) {
        fs.mkdirSync(localDbDir, { recursive: true });
      }

      mongoMemoryServerInstance = await MongoMemoryServer.create({
        instance: {
          dbPath: localDbDir,
        },
      });
    }
    const memUri = mongoMemoryServerInstance.getUri();
    console.log(`✓ Started Embedded MongoDB Instance for development: ${memUri}`);
    await mongoose.connect(memUri);
    return mongoose;
  } catch (memErr: any) {
    console.error('Unable to start embedded MongoDB instance:', memErr.message);
    throw new Error(
      'MongoDB connection could not be established. Please provide a valid MONGODB_URI in backend/.env'
    );
  }
}

/**
 * Disconnect and cleanup resources
 */
export async function disconnectDB(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoMemoryServerInstance) {
      await mongoMemoryServerInstance.stop();
      mongoMemoryServerInstance = null;
    }
    console.log('✓ MongoDB connection cleanly closed.');
  } catch (err: any) {
    console.error('Error during MongoDB disconnect:', err.message);
  }
}

export const closeDB = disconnectDB;

// Graceful process shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Gracefully shutting down MongoDB connection...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Gracefully shutting down MongoDB connection...');
  await disconnectDB();
  process.exit(0);
});

export default mongoose;
