-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'company';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "emailConnectedAt" TIMESTAMP(3),
ADD COLUMN     "smtpFrom" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smtpHost" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smtpPassword" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smtpPort" INTEGER NOT NULL DEFAULT 465,
ADD COLUMN     "smtpUser" TEXT NOT NULL DEFAULT '';
