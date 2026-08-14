// Discriminated union of every email job payload — one BullMQ queue (send-email)
// handles all of them, dispatched by type. Kept here (not in the notifications
// module) so the email module's render/send layer can import it without a
// circular dependency back onto notifications.
export type EmailJob =
  | {
      type: 'KIOSK_OWNER_WELCOME';
      to: string;
      kioskName: string;
      temporaryPassword: string;
    }
  | {
      type: 'LOCATION_MANAGER_WELCOME';
      to: string;
      kioskName: string;
      temporaryPassword: string;
    }
  | {
      type: 'PAYOUT_PROCESSED';
      to: string;
      kioskName: string;
      amount: number;
      periodStart: string;
      periodEnd: string;
      payoutDate: string;
    }
  | {
      type: 'STRIPE_ONBOARDING_CHANGED';
      to: string;
      kioskName: string;
      enabled: boolean;
    }
  | {
      type: 'COMMISSION_DIGEST';
      to: string;
      kioskName: string;
      periodLabel: string;
      confirmedTotal: number;
      confirmedCount: number;
      reversedTotal: number;
      reversedCount: number;
    };
