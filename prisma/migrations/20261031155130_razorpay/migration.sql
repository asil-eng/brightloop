-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "razorpayConnectedAt" TIMESTAMP(3),
ADD COLUMN     "razorpayKeyId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "razorpayKeySecret" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");

