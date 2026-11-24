-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ADD CONSTRAINT email_when_active
CHECK (("email" IS NULL) = ("deletedAt" IS NOT NULL)),
ADD CONSTRAINT username_when_active
CHECK (("username" IS NULL) = ("deletedAt" IS NOT NULL))
;