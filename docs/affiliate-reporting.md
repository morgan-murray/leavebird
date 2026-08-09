# Affiliate reporting policy

Leavebird measures whether its weekend and holiday recommendations are useful without building user profiles.

## What is counted

- An impression is eligible when at least half of a recommendation link remains visible for 750 milliseconds. The browser sends one random event key for that rendered link, and database uniqueness makes retries idempotent.
- A click is one signed-in request through Leavebird's outbound redirect. Reporting errors never prevent the destination from opening.
- Obvious automated user agents are excluded from impressions and clicks where practical.
- A conversion comes from an authenticated affiliate-network postback. Network references are one-way hashed and used only to deduplicate retries.

## Data and consent

No advertising cookies, local-storage identifiers, user IDs, email addresses, IP addresses, full URLs, booking details, customer details or payment information are stored for this reporting. The existing sign-in cookie remains strictly necessary for account access. Because this reporting does not read or write information on the user's device, it does not require a separate advertising-cookie opt-in. Any future third-party pixel or device identifier must remain disabled until explicit consent is collected.

## Retention and deletion

Anonymous recommendation events and conversion totals are retained for 395 days and then automatically deleted. Because events are deliberately not linked to an account, account deletion leaves no identifiable recommendation record to locate or remove. Hashed network references cannot be reversed into booking or customer information.

## Conversion postbacks

The postback endpoint accepts only HTTPS requests carrying the configured bearer secret. It records a known offer, placement, GBP commission in minor units, occurrence time and optional click reference. The secret must be rotated if disclosed and must never appear in client-side code.
