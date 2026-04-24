import { connectDb } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { UserModel } from "../src/models/User.js";
import { hashValue } from "../src/utils/security.js";

async function seedAdmin() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  }

  await connectDb();
  const username = env.ADMIN_USERNAME.toLowerCase().trim();
  const passwordHash = await hashValue(env.ADMIN_PASSWORD);

  const existing = await UserModel.findOne({ username, role: "admin" });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.isActive = true;
    existing.failedLoginAttempts = 0;
    existing.lockUntil = null;
    await existing.save();
    console.log(`Updated admin user: ${username}`);
  } else {
    await UserModel.create({
      username,
      passwordHash,
      role: "admin",
      isActive: true
    });
    console.log(`Created admin user: ${username}`);
  }

  process.exit(0);
}

seedAdmin().catch((error) => {
  console.error("Failed to seed admin", error);
  process.exit(1);
});
