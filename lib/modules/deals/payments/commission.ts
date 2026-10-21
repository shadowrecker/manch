import { env } from '@/lib/env';
import { COMMISSION_BPS, commissionPaise } from '@/lib/modules/deals/types';

// The 5% commission split (PRD §21 / §8.6). All amounts in paise. The platform
// fee is COMMISSION_BPS basis points; the creator receives the remainder.

export interface CommissionSplit {
  valuePaise: number;
  commissionPaise: number;
  creatorPaise: number;
  bps: number;
}

/** Split a deal value into platform commission + creator payout. */
export function computeSplit(valuePaise: number): CommissionSplit {
  const bps = Number.isFinite(env.commissionBps) && env.commissionBps > 0 ? env.commissionBps : COMMISSION_BPS;
  const commission = commissionPaise(valuePaise, bps);
  return {
    valuePaise,
    commissionPaise: commission,
    creatorPaise: valuePaise - commission,
    bps,
  };
}
