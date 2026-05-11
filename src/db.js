const dns = require("dns");
const mongoose = require("mongoose");

const config = require("./config");

// Force Node.js to use public DNS servers when resolving MongoDB Atlas SRV
// records. Some local/ISP DNS resolvers refuse SRV lookups, which makes
// "mongodb+srv://" URIs fail with querySrv ECONNREFUSED.
dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

let connectionPromise = null;

async function connectDb() {
  if (connectionPromise) return connectionPromise;

  if (!config.mongodbUri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to backend/.env before starting the server."
    );
  }

  mongoose.set("strictQuery", true);

  connectionPromise = mongoose
    .connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    })
    .then((conn) => {
      const host = conn.connection.host;
      const db = conn.connection.name;
      console.log(`[mongo] Connected to ${host}/${db}`);
      return conn;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error("[mongo] Connection failed:", error.message);
      throw error;
    });

  return connectionPromise;
}

module.exports = { connectDb };
