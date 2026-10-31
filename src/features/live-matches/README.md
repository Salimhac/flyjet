# Live Matches — Betika-Style Pre-Match ("Bet Early") & Live Football Sportsbook

An isolated, additive **Live & Pre-Match Football Sportsbook** module mounted at `/live-matches`. Users can **Bet Early (Pre-Match)** before kickoff to lock in early odds or bet **Live In-Play** during the 90 minutes, build Single or Multi-Bet (Accumulator) tickets, and execute **Instant Early Cashout**.

## Hard Constraints & Isolation
- **Zero Regression**: No existing Aviator game files, routes, or database tables are altered.
- **10.00 KES Minimum Stake**: Stored and validated in integer minor units (`1,000` KES cents minimum, whole `1.00 KES` = `100` cents steps, max `20,000.00 KES` = `2,000,000` cents, max payout `500,000.00 KES` = `50,000,000` cents).
- **Shared KES Wallet Bridge**: Uses the existing `wallets` / `users.balance` store atomically and logs every movement to `lm_audit_logs`.

## Distinct Routes
1. `/live-matches` — **Football Lobby**: Browse `Bet Early (Upcoming)` and `Live Now (In-Play)` football matches across FKF Premier League (Kenya), Premier League, UEFA Champions League, La Liga, Serie A, and Bundesliga. Includes quick market switcher (`1X2`, `Double Chance`, `O/U 2.5`, `GG/NG`) and sticky Betika Bet Slip.
2. `/live-matches/[matchId]` — **Football Match Center**: 2D Live Pitch Ball & Attack Tracker, Pre-Match Kickoff Countdown, H2H & Match Stats, Live Commentary Timeline, and all 9 Football Market categories (`1X2`, `Double Chance`, `O/U 1.5/2.5/3.5`, `BTTS GG/NG`, `Draw No Bet`, `1st Half 1X2`, `Correct Score`).
3. `/live-matches/history` — **My Bets & Cashout**: Filter by `Open / Cashout`, `Bet Early (Pre-Match)`, `Live In-Play`, `Won`, `Lost`, `Cashed Out`, with 1-click Early Cashout and 100% Pre-Match Cancel & Refund before kickoff.
4. `/live-matches/wallet` — **Sportsbook Wallet**: Unified KES balance, M-Pesa / Paystack Deposit & Withdrawal triggers, and append-only `lm_audit_logs` ledger.
5. `/live-matches/rules` — **Football Rules & Fairness**: Pre-Match vs Live settlement rules, Early Cashout mechanics, Responsible Gaming Self-Exclusion, and SHA-256 / HMAC-SHA256 Match Seed Verifier.
