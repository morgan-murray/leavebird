export const affiliatePlacements = ["weekend-board", "holiday-board", "timesheet-reward"] as const;
export type AffiliatePlacement = typeof affiliatePlacements[number];

type AffiliateOffer = {
  id: string;
  merchant: string;
  destination: string;
};

export const affiliateOffers: Record<string, AffiliateOffer> = {
  "groupon-big-belly": {
    id: "groupon-big-belly",
    merchant: "Groupon",
    destination: "https://www.groupon.co.uk/deals/big-belly-comedy-club-1",
  },
  "wowcher-moco": {
    id: "wowcher-moco",
    merchant: "Wowcher",
    destination: "https://www.wowcher.co.uk/deal/london/40974160/moco-museum-entry-ticket",
  },
  "wowcher-thames": {
    id: "wowcher-thames",
    merchant: "Wowcher",
    destination: "https://www.wowcher.co.uk/deal/london/activities-entertainment/river-cruises/45329263/thames-river-sightseeing-cruise-tickets",
  },
  "wowcher-activities": {
    id: "wowcher-activities",
    merchant: "Wowcher",
    destination: "https://www.wowcher.co.uk/deals/things-to-do-activities",
  },
  "groupon-activities": {
    id: "groupon-activities",
    merchant: "Groupon",
    destination: "https://www.groupon.co.uk/vouchers/things-to-do",
  },
  "lastminute-holidays": {
    id: "lastminute-holidays",
    merchant: "lastminute.com",
    destination: "https://www.lastminute.com/holidays/",
  },
  "holidaypirates-home": {
    id: "holidaypirates-home",
    merchant: "HolidayPirates",
    destination: "https://www.holidaypirates.com/",
  },
};

export function getAffiliateOffer(id: string) {
  return affiliateOffers[id] ?? null;
}

export function isAffiliatePlacement(value: string): value is AffiliatePlacement {
  return affiliatePlacements.includes(value as AffiliatePlacement);
}
