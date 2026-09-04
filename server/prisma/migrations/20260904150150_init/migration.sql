-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER NOT NULL,
    "coverUrl" TEXT,
    "grade" TEXT,
    "classNo" INTEGER,
    "requesterName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "flaggedWords" TEXT NOT NULL DEFAULT '[]',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "submitIp" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    CONSTRAINT "SongRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "playDate" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BroadcastSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BroadcastSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "maxCount" INTEGER,
    "maxMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'REVIEWER',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GradeConfig" (
    "grade" TEXT NOT NULL PRIMARY KEY,
    "classCount" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "BannedWord" (
    "word" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourceCredential" (
    "source" TEXT NOT NULL PRIMARY KEY,
    "encryptedData" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "lastCheckAt" DATETIME,
    "lastCheckOk" BOOLEAN,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SongRequest_queryCode_key" ON "SongRequest"("queryCode");

-- CreateIndex
CREATE INDEX "SongRequest_status_createdAt_idx" ON "SongRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SongRequest_grade_classNo_requesterName_createdAt_idx" ON "SongRequest"("grade", "classNo", "requesterName", "createdAt");

-- CreateIndex
CREATE INDEX "SongRequest_submitIp_createdAt_idx" ON "SongRequest"("submitIp", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_requestId_key" ON "Schedule"("requestId");

-- CreateIndex
CREATE INDEX "Schedule_playDate_idx" ON "Schedule"("playDate");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_playDate_slotId_orderNo_key" ON "Schedule"("playDate", "slotId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSlot_name_key" ON "BroadcastSlot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
