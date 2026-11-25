// Smart Quick-Select seat suggestion engine following exact theatre seating rules.
// Tier priority: 1st Recliner (Row A), 2nd Club (Rows B-F), 3rd Premium (Rows G-J).
// - 1 seat: random available seat in highest non-full tier.
// - 2 seats: corners (1-2 or 9-10) first, else adjacent pair inside 3-8, else closest 2 single seats anywhere.
// - 3 or 4 seats: adjacent block inside 3-8 first, else adjacent block anywhere (e.g. Row A), else closest cluster anywhere.

const TIER_PRIORITY = ['recliner', 'club', 'premium'];
const TIER_RANK = { recliner: 0, club: 1, premium: 2 };

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function isSeatFree(seat, userId) {
  return seat.status === 'available' || (Boolean(userId) && seat.status === 'held' && seat.held_by === userId);
}

// Visual (x, y) coordinates accounting for the aisle gap in Rows B-J (2-6-2 layout).
function getSeatCoordinates(seat) {
  const rowIndex = seat.row_label.charCodeAt(0) - 65;
  let x;
  if (seat.row_label === 'A') {
    x = (seat.seat_number - 1) * 1.15;
  } else if (seat.seat_number <= 2) {
    x = seat.seat_number - 1;
  } else if (seat.seat_number <= 8) {
    x = seat.seat_number - 1 + 1.5;
  } else {
    x = seat.seat_number - 1 + 3.0;
  }
  return { x, y: rowIndex * 1.6 };
}

function seatDistance(a, b) {
  const ca = getSeatCoordinates(a);
  const cb = getSeatCoordinates(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function groupRowsInTier(freeSeats, tier) {
  const byRow = new Map();
  for (const seat of freeSeats) {
    if (seat.tier !== tier) continue;
    if (!byRow.has(seat.row_label)) byRow.set(seat.row_label, new Map());
    byRow.get(seat.row_label).set(seat.seat_number, seat);
  }
  const sortedRows = [...byRow.keys()].sort();
  return sortedRows.map((rowLabel) => ({ rowLabel, seatMap: byRow.get(rowLabel) }));
}

// Finds all contiguous N-seat blocks within [minNum..maxNum] across rows of a tier.
function findContiguousBlocksInTier(freeSeats, tier, count, minNum, maxNum) {
  const blocks = [];
  for (const { seatMap } of groupRowsInTier(freeSeats, tier)) {
    for (let start = minNum; start <= maxNum - count + 1; start++) {
      const group = [];
      let allFree = true;
      for (let offset = 0; offset < count; offset++) {
        const seat = seatMap.get(start + offset);
        if (!seat) {
          allFree = false;
          break;
        }
        group.push(seat);
      }
      if (allFree) blocks.push(group);
    }
  }
  return blocks;
}

// Fallback when no ideal adjacent match exists: selects the tightest cluster of N close seats.
function findClosestCluster(freeSeats, count) {
  if (freeSeats.length < count) return null;

  let bestGroup = null;
  let bestScore = Infinity;

  for (const anchor of freeSeats) {
    const ordered = freeSeats
      .filter((s) => s.id !== anchor.id)
      .sort((a, b) => {
        const diff = seatDistance(anchor, a) - seatDistance(anchor, b);
        if (Math.abs(diff) > 0.01) return diff;
        return (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9);
      });

    const candidate = [anchor, ...ordered.slice(0, count - 1)];

    // Score total pairwise physical distance (plus tiny tie-breaker for higher tiers).
    let pairDist = 0;
    for (let i = 0; i < candidate.length; i++) {
      for (let j = i + 1; j < candidate.length; j++) {
        pairDist += seatDistance(candidate[i], candidate[j]);
      }
    }
    const tierTieBreaker = candidate.reduce((sum, s) => sum + (TIER_RANK[s.tier] ?? 9) * 0.01, 0);
    const totalScore = pairDist + tierTieBreaker;

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestGroup = candidate;
    }
  }

  return bestGroup ? bestGroup.sort((a, b) => a.id - b.id) : null;
}

/**
 * Picks up to `count` (1..4) smart seats according to tier & placement priority rules.
 * Returns { seatIds: number[], strategy: string } or null if fewer than `count` free seats exist.
 */
export function suggestSmartSeats(allSeats, count, userId) {
  const freeSeats = allSeats.filter((s) => isSeatFree(s, userId));
  if (freeSeats.length < count) return null;

  // Case 1: Single seat -> random seat in Recliner first, then Club, then Premium.
  if (count === 1) {
    for (const tier of TIER_PRIORITY) {
      const candidates = freeSeats.filter((s) => s.tier === tier);
      if (candidates.length > 0) {
        const freshPool = candidates.filter((s) => !(userId && s.status === 'held' && s.held_by === userId));
        const chosen = pickRandom(freshPool.length > 0 ? freshPool : candidates);
        return { seatIds: [chosen.id], strategy: `Random seat in ${tier.toUpperCase()}` };
      }
    }
    return null;
  }

  // Case 2: 2 seats -> Corners (1,2 or 9,10) first -> Center adjacent (3-8) -> Row A cross-aisle -> closest 2 singles.
  if (count === 2) {
    for (const tier of TIER_PRIORITY) {
      // 2a. Left or right corner pair (1,2) or (9,10)
      const cornerCandidates = [];
      for (const { seatMap } of groupRowsInTier(freeSeats, tier)) {
        if (seatMap.has(1) && seatMap.has(2)) cornerCandidates.push([seatMap.get(1), seatMap.get(2)]);
        if (seatMap.has(9) && seatMap.has(10)) cornerCandidates.push([seatMap.get(9), seatMap.get(10)]);
      }
      if (cornerCandidates.length > 0) {
        const chosen = pickRandom(cornerCandidates);
        return { seatIds: chosen.map((s) => s.id), strategy: `Corner seats in ${tier.toUpperCase()}` };
      }

      // 2b. Adjacent pair inside 3 to 8
      const centerCandidates = findContiguousBlocksInTier(freeSeats, tier, 2, 3, 8);
      if (centerCandidates.length > 0) {
        const chosen = pickRandom(centerCandidates);
        return { seatIds: chosen.map((s) => s.id), strategy: `Adjacent center seats in ${tier.toUpperCase()}` };
      }

      // 2c. In Recliner (Row A has no aisle gap), (2,3) and (8,9) are also physically next to each other
      if (tier === 'recliner') {
        const recAdj = findContiguousBlocksInTier(freeSeats, 'recliner', 2, 1, 10);
        if (recAdj.length > 0) {
          const chosen = pickRandom(recAdj);
          return { seatIds: chosen.map((s) => s.id), strategy: 'Adjacent seats in RECLINER' };
        }
      }
    }

    // 2d. No two adjacent seats available anywhere -> closest 2 single seats
    const closePair = findClosestCluster(freeSeats, 2);
    return closePair ? { seatIds: closePair.map((s) => s.id), strategy: 'Closest available seats' } : null;
  }

  // Case 3: 3 or 4 seats -> Adjacent in 3-8 first (Recliner -> Club -> Premium) -> adjacent anywhere -> closest cluster.
  for (const tier of TIER_PRIORITY) {
    const centerBlocks = findContiguousBlocksInTier(freeSeats, tier, count, 3, 8);
    if (centerBlocks.length > 0) {
      const chosen = pickRandom(centerBlocks);
      return { seatIds: chosen.map((s) => s.id), strategy: `Adjacent seats (3-8) in ${tier.toUpperCase()}` };
    }
  }

  // Fallback A: Row A continuous row (no aisle gap, e.g. 1-3, 1-4, 7-10)
  const reclinerFullRow = findContiguousBlocksInTier(freeSeats, 'recliner', count, 1, 10);
  if (reclinerFullRow.length > 0) {
    const chosen = pickRandom(reclinerFullRow);
    return { seatIds: chosen.map((s) => s.id), strategy: 'Adjacent seats in RECLINER' };
  }

  // Fallback B: Any closest seats anywhere in the theatre
  const closeGroup = findClosestCluster(freeSeats, count);
  return closeGroup ? { seatIds: closeGroup.map((s) => s.id), strategy: 'Best close seats available' } : null;
}
