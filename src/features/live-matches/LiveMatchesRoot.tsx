import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, Wallet } from '../../types';
import { useLiveMatchesSocket } from './useLiveMatchesSocket';
import { LiveMatchesSubNav, LiveMatchesRoutePage } from './components/LiveMatchesSubNav';
import { LiveMatchesLobbyPage } from './pages/LiveMatchesLobbyPage';
import { LiveMatchArenaPage } from './pages/LiveMatchArenaPage';
import { LiveMatchesHistoryPage } from './pages/LiveMatchesHistoryPage';
import { LiveMatchesWalletPage } from './pages/LiveMatchesWalletPage';
import { LiveMatchesFairnessPage } from './pages/LiveMatchesFairnessPage';
import {
  computeTicketPayoutBreakdown,
  parsePreviewStakeCents,
} from './money';


interface LiveMatchesRootProps {
  user: UserProfile | null;
  wallet: Wallet | null;
  onWalletUpdate: (newBalanceKes: number) => void;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
}

function parseLiveMatchesRoute(pathname: string): {
  page: LiveMatchesRoutePage;
  matchId: string;
} {
  const clean = pathname.replace(/\/+$/, '') || '/live-matches';
  const parts = clean.split('/').filter(Boolean); // ['live-matches', ...]
  const sub = parts[1] || '';

  if (!sub) {
    return { page: 'lobby', matchId: 'm_fkf_gor_afc' };
  }
  if (sub === 'history') {
    return { page: 'history', matchId: 'm_fkf_gor_afc' };
  }
  if (sub === 'wallet') {
    return { page: 'wallet', matchId: 'm_fkf_gor_afc' };
  }
  if (sub === 'rules' || sub === 'fairness') {
    return { page: 'rules', matchId: 'm_fkf_gor_afc' };
  }
  return { page: 'arena', matchId: sub };
}

export const LiveMatchesRoot: React.FC<LiveMatchesRootProps> = ({
  user,
  wallet,
  onWalletUpdate,
  onOpenAuth,
  onOpenDeposit,
  onOpenWithdraw,
}) => {
  const [routeUrl, setRouteUrl] = useState<string>(() => {
    const p = window.location.pathname;
    return p.startsWith('/live-matches') ? p + window.location.search : '/live-matches';
  });

  const navigate = useCallback((path: string) => {
    try {
      window.history.pushState({}, '', path);
    } catch {
      // ignore iframe history security restrictions if any
    }
    setRouteUrl(path);
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith('/live-matches')) {
      try {
        window.history.pushState({}, '', '/live-matches');
      } catch {
        // ignore
      }
      setRouteUrl('/live-matches');
    }

    const onPopState = () => {
      if (window.location.pathname.startsWith('/live-matches')) {
        setRouteUrl(window.location.pathname + window.location.search);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [pathnamePart, searchPart = ''] = routeUrl.split('?');
  const parsedRoute = parseLiveMatchesRoute(pathnamePart);

  const {
    matches,
    activeMatch,
    recentPublicBets,
    userTickets,
    refreshUserTickets,
    onlinePlayers,
    connectionState,
    latencyMs,
    lastSyncedAt,
    isSyncingFeed,
    syncLiveFeed,
    betSlip,
    stakeInput,
    setStakeInput,
    toggleSlipSelection,
    removeSlipSelection,
    clearBetSlip,
  } = useLiveMatchesSocket(
    parsedRoute.matchId,
    user?.id,
    wallet?.balanceKes,
    onWalletUpdate
  );

  const handleSelectMatch = (matchId: string) => {
    navigate(`/live-matches/${matchId}`);
  };

  const queryParams = new URLSearchParams(searchPart);
  const openTicketsCount = userTickets.filter((t) => t.status === 'OPEN').length;

  const activeStakeCents = parsePreviewStakeCents(stakeInput);
  const slipBreakdown = computeTicketPayoutBreakdown(
    activeStakeCents,
    betSlip.map((s) => s.odds)
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-Navigation Bar */}
      <LiveMatchesSubNav
        activePage={parsedRoute.page}
        activeRoundOrRoomId={activeMatch?.id || parsedRoute.matchId}
        onNavigate={navigate}
        connectionState={connectionState}
        latencyMs={latencyMs}
        walletBalanceKes={wallet?.balanceKes ?? 0}
        onOpenDeposit={onOpenDeposit}
        betSlipCount={betSlip.length}
        totalOdds={slipBreakdown.totalOdds}
        totalPayoutCents={slipBreakdown.totalPayoutCents}
        openTicketsCount={openTicketsCount}
      />

      {/* Active Route View */}
      {parsedRoute.page === 'lobby' && (
        <LiveMatchesLobbyPage
          matches={matches}
          recentPublicBets={recentPublicBets}
          userTickets={userTickets}
          onRefreshTickets={refreshUserTickets}
          onlinePlayers={onlinePlayers}
          lastSyncedAt={lastSyncedAt}
          isSyncingFeed={isSyncingFeed}
          onSyncLiveFeed={syncLiveFeed}
          betSlip={betSlip}
          stakeInput={stakeInput}
          onStakeChange={setStakeInput}
          onToggleSelection={toggleSlipSelection}
          onRemoveSelection={removeSlipSelection}
          onClearSlip={clearBetSlip}
          user={user}
          wallet={wallet}
          onWalletUpdate={onWalletUpdate}
          onOpenAuth={onOpenAuth}
          onOpenDeposit={onOpenDeposit}
          onSelectMatch={handleSelectMatch}
          onNavigate={navigate}
        />
      )}

      {parsedRoute.page === 'arena' && (
        <LiveMatchArenaPage
          match={activeMatch}
          allMatches={matches}
          userTickets={userTickets}
          onRefreshTickets={refreshUserTickets}
          betSlip={betSlip}
          stakeInput={stakeInput}
          onStakeChange={setStakeInput}
          onToggleSelection={toggleSlipSelection}
          onRemoveSelection={removeSlipSelection}
          onClearSlip={clearBetSlip}
          user={user}
          wallet={wallet}
          onWalletUpdate={onWalletUpdate}
          onOpenAuth={onOpenAuth}
          onOpenDeposit={onOpenDeposit}
          onSwitchMatch={handleSelectMatch}
          onNavigate={navigate}
        />
      )}

      {parsedRoute.page === 'history' && (
        <LiveMatchesHistoryPage
          user={user}
          tickets={userTickets}
          onRefreshTickets={refreshUserTickets}
          onWalletUpdate={onWalletUpdate}
          onNavigate={navigate}
          onOpenAuth={onOpenAuth}
        />
      )}

      {parsedRoute.page === 'wallet' && (
        <LiveMatchesWalletPage
          user={user}
          wallet={wallet}
          onOpenDeposit={onOpenDeposit}
          onOpenWithdraw={onOpenWithdraw}
          onOpenAuth={onOpenAuth}
        />
      )}

      {parsedRoute.page === 'rules' && (
        <LiveMatchesFairnessPage user={user} initialQuery={queryParams} />
      )}
    </div>
  );
};

