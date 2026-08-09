const DAY = 24 * 60 * 60 * 1000;

const rounded = value => Number(value.toFixed(2));
const dateOf = row => new Date(row.occurred_at ?? row.recorded_at);

export function isLikelyBot(userAgent = "") {
  return /bot|crawler|spider|slurp|preview|headless|lighthouse|monitor/i.test(userAgent);
}

export function summariseAffiliate(events, conversions, options = {}) {
  const now = options.now ?? new Date();
  const days = [7, 30, 90, 395].includes(Number(options.days)) ? Number(options.days) : 30;
  const since = new Date(now.getTime() - days * DAY);
  const matches = row => dateOf(row) >= since
    && (!options.placement || row.placement === options.placement)
    && (!options.merchant || row.merchant === options.merchant);
  const selectedEvents = events.filter(matches);
  const selectedConversions = conversions.filter(matches);
  const impressions = selectedEvents.filter(row => row.event_type === "impression").length;
  const clicks = selectedEvents.filter(row => row.event_type === "click").length;
  const commissionMinor = selectedConversions.reduce((sum, row) => sum + Number(row.commission_minor || 0), 0);
  const keys = new Set([
    ...selectedEvents.map(row => `${row.placement}\u0000${row.merchant}`),
    ...selectedConversions.map(row => `${row.placement}\u0000${row.merchant}`),
  ]);
  const breakdown = [...keys].map(key => {
    const [placement, merchant] = key.split("\u0000");
    const groupEvents = selectedEvents.filter(row => row.placement === placement && row.merchant === merchant);
    const groupConversions = selectedConversions.filter(row => row.placement === placement && row.merchant === merchant);
    const groupImpressions = groupEvents.filter(row => row.event_type === "impression").length;
    const groupClicks = groupEvents.filter(row => row.event_type === "click").length;
    const groupCommission = groupConversions.reduce((sum, row) => sum + Number(row.commission_minor || 0), 0);
    return {
      placement,
      merchant,
      impressions: groupImpressions,
      clicks: groupClicks,
      clickThroughRate: groupImpressions ? rounded(groupClicks * 100 / groupImpressions) : 0,
      conversions: groupConversions.length,
      conversionRate: groupClicks ? rounded(groupConversions.length * 100 / groupClicks) : 0,
      commissionMinor: groupCommission,
    };
  }).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  return {
    filter: { days, placement: options.placement || "", merchant: options.merchant || "" },
    impressions,
    clicks,
    clickThroughRate: impressions ? rounded(clicks * 100 / impressions) : 0,
    conversions: selectedConversions.length,
    conversionRate: clicks ? rounded(selectedConversions.length * 100 / clicks) : 0,
    commissionMinor,
    earningsPerClickMinor: clicks ? rounded(commissionMinor / clicks) : 0,
    breakdown,
    availablePlacements: [...new Set([...events, ...conversions].map(row => row.placement))].sort(),
    availableMerchants: [...new Set([...events, ...conversions].map(row => row.merchant))].sort(),
  };
}
