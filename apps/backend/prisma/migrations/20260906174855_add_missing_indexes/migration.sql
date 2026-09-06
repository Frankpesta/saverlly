-- CreateIndex
CREATE INDEX "Announcement_locationIds_idx" ON "Announcement" USING GIN ("locationIds");

-- CreateIndex
CREATE INDEX "CommissionEvent_couponId_idx" ON "CommissionEvent"("couponId");

-- CreateIndex
CREATE INDEX "Coupon_merchantId_active_idx" ON "Coupon"("merchantId", "active");

-- CreateIndex
CREATE INDEX "CouponTestEvent_couponId_idx" ON "CouponTestEvent"("couponId");

-- CreateIndex
CREATE INDEX "Promotion_targetTags_idx" ON "Promotion" USING GIN ("targetTags");

-- CreateIndex
CREATE INDEX "Promotion_locationIds_idx" ON "Promotion" USING GIN ("locationIds");
