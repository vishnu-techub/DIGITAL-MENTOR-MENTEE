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

// Setup Mongoose connection event listeners
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection lost. Reconnecting...');
});

/**
 * Check if MongoDB connection is active
 */
export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Get current connected database name
 */
export function getDatabaseName(): string {
  return mongoose.connection.name || (mongoose.connection.db as any)?.databaseName || 'unknown';
}

/**
 * MongoDB Atlas Connection Module
 *
 * Requirements:
 * 1. Uses process.env.MONGODB_URI
 * 2. Connects to persistent MongoDB Atlas cluster and database
 * 3. Never uses MongoDB memory server or in-memory DB in production or on Render
 * 4. Logs success with database name and environment WITHOUT exposing secrets (password, URI, JWT)
 * 5. Fails fast if connection cannot be established
 */
export async function connectDB(): Promise<typeof mongoose> {
  // If already connected, reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // If currently connecting, wait until connected
  if (mongoose.connection.readyState === 2) {
    await new Promise<void>((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve());
      mongoose.connection.once('error', (err) => reject(err));
    });
    return mongoose;
  }

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RENDER);

  const uri = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : '';

  if (isProduction && !uri) {
    throw new Error(
      'Fatal: MONGODB_URI environment variable is required in production / Render. In-memory databases are strictly forbidden.'
    );
  }

  if (uri) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        autoIndex: true,
      });

      const dbName = getDatabaseName();
      const envName = process.env.NODE_ENV || (process.env.RENDER ? 'production' : 'development');

      // Startup logging without exposing credentials, URI, or secrets
      console.log('MongoDB connected successfully');
      console.log(`Database name: ${dbName}`);
      console.log(`Environment: ${envName}`);

      return mongoose;
    } catch (err: any) {
      console.error('Fatal: Failed to connect to MongoDB Atlas:', err.message);
      if (isProduction) {
        throw err;
      }
      // In development, if URI was provided, throw error so developer can correct credentials/URI
      throw new Error(
        `Failed to connect to MongoDB Atlas with provided MONGODB_URI: ${err.message}. Please check your MongoDB Atlas credentials and network access.`
      );
    }
  }

  // Only allowed in strictly non-production environments with explicit opt-in
  if (!isProduction && process.env.ALLOW_MEMORY_DB === 'true') {
    try {
      console.warn('WARNING: ALLOW_MEMORY_DB is set. Starting temporary In-Memory MongoDB Server for testing only.');
      if (!mongoMemoryServerInstance) {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongoMemoryServerInstance = await MongoMemoryServer.create();
      }
      const memUri = mongoMemoryServerInstance.getUri();
      await mongoose.connect(memUri);
      console.log('MongoDB connected successfully');
      console.log(`Database name: ${getDatabaseName()} (TEMPORARY IN-MEMORY)`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      return mongoose;
    } catch (memErr: any) {
      console.error('Unable to start embedded MongoDB instance:', memErr.message);
      throw new Error('MongoDB connection could not be established.');
    }
  }

  throw new Error(
    'MONGODB_URI environment variable is not defined. Please set MONGODB_URI in your environment or backend/.env file to connect to your persistent MongoDB Atlas database.'
  );
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
    console.log('MongoDB connection cleanly closed.');
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
