-- AlterTable
ALTER TABLE "User" ADD COLUMN "replayOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- testers: Tijs can walk the wizard on every login
UPDATE "User" SET "replayOnboarding" = true WHERE email = 'tijs@websales360.com';
