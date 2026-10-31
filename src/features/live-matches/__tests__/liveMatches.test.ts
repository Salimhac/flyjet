import assert from 'node:assert/strict';
import {
  LM_MIN_STAKE_CENTS,
  computeCombinedOdds,
  computeMultiBoostPercent,
  computeTicketPotentialPayoutCents,
  formatCentsToKes,
  parseAndValidateKesInput,
  validateStakeCents,
  verifyRoundFairness,
} from '../money';
import { LiveMatchesEngine, SharedServerContext } from '../../../server/liveMatchesEngine';

async function runTests() {
  console.log('=== Running Betika Football Live & Pre-Match ("Bet Early") Tests ===');

  // 1. Client/Shared Money Validation (10.00 KES = 1000 cents minimum rule)
  const reject999 = validateStakeCents(999);
  assert.equal(reject999.valid, false, '999 cents (9.99 KES) must be rejected');
  assert.equal(reject999.code, 'LM_STAKE_BELOW_MIN_10_KES');

  const rejectStr999 = parseAndValidateKesInput('9.99');
  assert.equal(rejectStr999.valid, false, '"9.99" KES string must be rejected');
  assert.equal(rejectStr999.code, 'LM_STAKE_BELOW_MIN_10_KES');

  const rejectFloat = validateStakeCents(1050.5);
  assert.equal(rejectFloat.valid, false, 'Float cents must be rejected');
  assert.equal(rejectFloat.code, 'LM_STAKE_NON_INTEGER_CENTS');

  const rejectNonWholeKes = validateStakeCents(1050); // 10.50 KES (not multiple of 100 cents)
  assert.equal(rejectNonWholeKes.valid, false, '10.50 KES must be rejected (1 KES step rule)');
  assert.equal(rejectNonWholeKes.code, 'LM_STAKE_INVALID_INCREMENT');

  const accept1000 = validateStakeCents(1000);
  assert.equal(accept1000.valid, true, '1000 cents (10.00 KES) must succeed');
  assert.equal(accept1000.stakeCents, LM_MIN_STAKE_CENTS);
  assert.equal(formatCentsToKes(1000), '10.00 KES');

  // 2. Accumulator / Multi-Bet Odds & Betika Boost Math
  const combined = computeCombinedOdds([2.0, 1.5, 2.5]);
  assert.equal(combined, 7.5, 'Combined odds of 2.0 * 1.5 * 2.5 should equal 7.50');
  assert.equal(computeMultiBoostPercent(3), 3, '3-leg multi-bet gets +3% Betika boost');
  const boostedPayout = computeTicketPotentialPayoutCents(1000, 7.5, 3);
  assert.ok(boostedPayout > 7500, 'Boosted payout should include +3% win bonus on net profit');

  // 3. Server Engine Pre-Match ("Bet Early") & Live In-Play Integration Tests
  const ctx: SharedServerContext = {
    users: new Map([
      [
        'u_test_1',
        {
          id: 'u_test_1',
          fullName: 'Brian Ochieng',
          phone: '+254712345678',
          email: 'brian@betika.co.ke',
        },
      ],
    ]),
    wallets: new Map([
      [
        'u_test_1',
        {
          userId: 'u_test_1',
          balanceKes: 500.0, // 50,000 cents
          updatedAt: new Date().toISOString(),
        },
      ],
    ]),
    transactions: [],
  };

  const engine = new LiveMatchesEngine(ctx);
  await engine.syncRealWorldMatches(false);
  const snapshot = engine.getStateSnapshot();
  assert.ok(snapshot.matches.length >= 10, 'Engine should sync real-world UPCOMING and LIVE football matches');
  assert.ok(
    snapshot.matches.some((m) => m.id.startsWith('espn_')),
    'Matches should be real-world fixtures synced from live global sports feed'
  );

  const upcomingMatches = snapshot.matches.filter((m) => m.status === 'UPCOMING');
  const liveOrUpcoming = snapshot.matches.filter((m) => m.status !== 'FT');
  assert.ok(upcomingMatches.length >= 4, 'Should have Pre-Match ("Bet Early") upcoming real-world matches');
  const liveMatches =
    snapshot.matches.filter((m) => m.status === 'LIVE_1H' || m.status === 'HT' || m.status === 'LIVE_2H').length > 0
      ? snapshot.matches.filter((m) => m.status === 'LIVE_1H' || m.status === 'HT' || m.status === 'LIVE_2H')
      : liveOrUpcoming.slice(2);

  // 4. Reject 9.99 KES (999 cents) server-side
  const rejectedServerBet = engine.placeBet({
    userId: 'u_test_1',
    matchId: upcomingMatches[0].id,
    marketKey: '1X2',
    outcomeKey: '1',
    stakeCents: 999,
    idempotencyKey: 'idem_reject_999',
  });
  assert.equal(rejectedServerBet.status, 400);
  assert.equal(rejectedServerBet.body.code, 'LM_STAKE_BELOW_MIN_10_KES');
  assert.equal(ctx.wallets.get('u_test_1')?.balanceKes, 500.0, 'Wallet untouched on rejected bet');

  // 5. Place a valid 10.00 KES (1000 cents) PRE-MATCH ("BET EARLY") Single Bet
  const earlyBetRes = engine.placeBet({
    userId: 'u_test_1',
    selections: [
      {
        matchId: upcomingMatches[0].id,
        marketKey: '1X2',
        outcomeKey: '1',
      },
    ],
    stakeCents: 1000, // 10.00 KES
    idempotencyKey: 'idem_early_1000',
  });
  assert.equal(earlyBetRes.status, 200, '10.00 KES Pre-Match ("Bet Early") bet must succeed');
  assert.equal(earlyBetRes.body.ok, true);
  assert.equal(earlyBetRes.body.ticket.hasEarlyBetLegs, true);
  assert.equal(earlyBetRes.body.balanceCents, 49000, 'Wallet balance reduced by 1000 cents to 490.00 KES');

  // 6. Idempotency check: repeating same idempotencyKey must not double-debit wallet
  const duplicateRes = engine.placeBet({
    userId: 'u_test_1',
    selections: [
      {
        matchId: upcomingMatches[0].id,
        marketKey: '1X2',
        outcomeKey: '1',
      },
    ],
    stakeCents: 1000,
    idempotencyKey: 'idem_early_1000',
  });
  assert.equal(duplicateRes.status, 200);
  assert.equal(ctx.wallets.get('u_test_1')?.balanceKes, 490.0, 'Wallet must not be double debited');

  // 7. Cancel Pre-Match ("Bet Early") ticket before kickoff for 100% refund
  const cancelRes = engine.cancelPreMatchTicket({
    userId: 'u_test_1',
    ticketId: earlyBetRes.body.ticket.id,
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.balanceCents, 50000, '100% stake refunded on pre-match cancellation');

  // 8. Place a Multi-Bet combining a Pre-Match ("Bet Early") fixture + a Live In-Play fixture, then Early Cashout!
  const multiBetRes = engine.placeBet({
    userId: 'u_test_1',
    selections: [
      {
        matchId: upcomingMatches[1].id,
        marketKey: 'DOUBLE_CHANCE',
        outcomeKey: '1X',
      },
      {
        matchId: liveMatches[0].id,
        marketKey: 'OVER_UNDER_25',
        outcomeKey: 'OVER_2.5',
      },
    ],
    stakeCents: 5000, // 50.00 KES
    idempotencyKey: 'idem_multi_5000',
  });
  assert.equal(multiBetRes.status, 200);
  assert.equal(multiBetRes.body.ticket.type, 'MULTI');
  assert.equal(multiBetRes.body.ticket.hasEarlyBetLegs, true);
  assert.equal(multiBetRes.body.ticket.hasLiveLegs, true);
  assert.equal(multiBetRes.body.balanceCents, 45000);

  // Execute Early Cashout on the active Multi-Bet
  const cashoutRes = engine.cashOutTicket({
    userId: 'u_test_1',
    ticketId: multiBetRes.body.ticket.id,
    idempotencyKey: 'idem_cashout_multi_1',
  });
  assert.equal(cashoutRes.status, 200);
  assert.equal(cashoutRes.body.ticket.status, 'CASHED_OUT');
  assert.ok(cashoutRes.body.cashoutCents > 0, 'Early cashout must credit positive integer cents');
  assert.equal(
    ctx.wallets.get('u_test_1')?.balanceKes,
    (45000 + cashoutRes.body.cashoutCents) / 100
  );

  // 9. Verify Provably Fair deterministic match score verifier
  const fairness = await verifyRoundFairness({
    serverSeed: '8f4b2e91c6a07d3e5192a4c8e7b1039d4f6a8c2e1b3d5f7a9c0e2b4d6f8a1c3e',
    clientSeed: 'BETIKA-KE-FOOTBALL-1042',
    nonce: 100,
  });
  assert.equal(fairness.valid, true);
  assert.ok(fairness.simulatedHomeGoals >= 0 && fairness.simulatedHomeGoals <= 4);
  assert.ok(fairness.simulatedAwayGoals >= 0 && fairness.simulatedAwayGoals <= 4);

  console.log('✅ All 9 Betika Football Pre-Match ("Bet Early") & Live In-Play tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
