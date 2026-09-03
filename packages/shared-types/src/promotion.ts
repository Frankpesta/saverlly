/**
 * An admin-authored promotion as served to a device by GET /public/promotions/active. Only the
 * fields the extension needs to render and click through. Targeting and scheduling stay
 * server-side, already resolved by the time the extension sees this.
 */
export interface ActivePromotion {
  id: string;
  /** 320x100 creative, rendered in the extension popup. */
  imageSmallUrl: string;
  /** 728x90 leaderboard creative, for the future on-page banner surface. */
  imageLargeUrl: string;
  clickUrl: string;
}
