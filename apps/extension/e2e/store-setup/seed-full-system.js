// Seeds the throwaway database full-system.js runs against: one admin and one store on
// "localhost", the host the test store page is served from. Prints the store's id.
// Run with DATABASE_URL pointing at that database (never a real one); see README.md.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.user.create({
      data: {
        email: "s4-admin@saverlly.test",
        passwordHash: await bcrypt.hash("S4-Admin-Pass-123!", 12),
        role: "ADMIN",
        mustChangePassword: false,
      },
    });
    const merchant = await prisma.merchant.create({
      data: {
        name: "Demo Outfitters",
        domain: "localhost",
        attributionMethod: "COOKIE",
        affiliateTrackingUrl: "https://track.example.com",
      },
    });
    console.log(merchant.id);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
