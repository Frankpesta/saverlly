
CREATE TABLE "ReviewerAccessControl" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global', "enabled" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL);
INSERT INTO "ReviewerAccessControl" ("id", "enabled", "updatedAt") VALUES ('global', false, CURRENT_TIMESTAMP);
CREATE TABLE "ReviewerInvite" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT, "codeHash" TEXT NOT NULL, "codeHint" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "maxInstallations" INTEGER NOT NULL DEFAULT 1, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ReviewerInvite_codeHash_key" ON "ReviewerInvite"("codeHash");
CREATE TABLE "ReviewerSession" ("id" TEXT NOT NULL PRIMARY KEY, "inviteId" TEXT NOT NULL REFERENCES "ReviewerInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE, "tokenHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3));
CREATE UNIQUE INDEX "ReviewerSession_tokenHash_key" ON "ReviewerSession"("tokenHash");
CREATE INDEX "ReviewerSession_inviteId_idx" ON "ReviewerSession"("inviteId");
CREATE TABLE "ReviewerEvent" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "ReviewerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE, "eventId" TEXT NOT NULL, "payload" JSONB NOT NULL, "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ReviewerEvent_sessionId_eventId_key" ON "ReviewerEvent"("sessionId", "eventId");
CREATE TABLE "ReviewerAttribution" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "ReviewerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE, "merchantId" TEXT NOT NULL, "subId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ReviewerAttribution_subId_key" ON "ReviewerAttribution"("subId");
CREATE INDEX "ReviewerAttribution_sessionId_idx" ON "ReviewerAttribution"("sessionId");
