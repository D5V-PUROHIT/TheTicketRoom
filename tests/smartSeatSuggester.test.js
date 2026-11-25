// Tests for the Smart Seat Suggester rules across 1, 2, 3, and 4 seat requests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let suggestSmartSeats;

function buildEmptyHall() {
  const seats = [];
  let id = 1;
  for (const row of 'ABCDEFGHIJ') {
    const tier = row === 'A' ? 'recliner' : 'BCDEF'.includes(row) ? 'club' : 'premium';
    const price = tier === 'recliner' ? 350 : tier === 'club' ? 250 : 180;
    for (let num = 1; num <= 10; num++) {
      seats.push({
        id: id++,
        row_label: row,
        seat_number: num,
        tier,
        price,
        status: 'available',
        held_by: null,
      });
    }
  }
  return seats;
}

function getSeat(hall, row, num) {
  return hall.find((s) => s.row_label === row && s.seat_number === num);
}

test('load ES module smartSeatSuggester', async () => {
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../frontend/src/utils/smartSeatSuggester.js')).href);
  suggestSmartSeats = mod.suggestSmartSeats;
  assert.equal(typeof suggestSmartSeats, 'function');
});

test('1 seat: picks Recliner first, Club when Recliner full, Premium when Club full', () => {
  const hall = buildEmptyHall();

  // Case A: Empty hall -> must pick inside Recliner (Row A)
  const resRec = suggestSmartSeats(hall, 1, 1);
  assert.equal(resRec.seatIds.length, 1);
  const pickedRec = hall.find((s) => s.id === resRec.seatIds[0]);
  assert.equal(pickedRec.tier, 'recliner');

  // Case B: Book all Recliner seats -> must pick inside Club (Rows B-F)
  hall.filter((s) => s.tier === 'recliner').forEach((s) => (s.status = 'booked'));
  const resClub = suggestSmartSeats(hall, 1, 1);
  const pickedClub = hall.find((s) => s.id === resClub.seatIds[0]);
  assert.equal(pickedClub.tier, 'club');

  // Case C: Book all Club seats -> must pick inside Premium (Rows G-J)
  hall.filter((s) => s.tier === 'club').forEach((s) => (s.status = 'booked'));
  const resPrem = suggestSmartSeats(hall, 1, 1);
  const pickedPrem = hall.find((s) => s.id === resPrem.seatIds[0]);
  assert.equal(pickedPrem.tier, 'premium');
});

test('2 seats: picks corners (1-2 or 9-10) first, else adjacent in 3-8, else closest non-adjacent', () => {
  const hall = buildEmptyHall();

  // Case A: Empty hall -> must pick Recliner corner pair (1,2) or (9,10)
  const rCorner = suggestSmartSeats(hall, 2, 1);
  const chosenA = rCorner.seatIds.map((id) => hall.find((s) => s.id === id)).sort((a, b) => a.seat_number - b.seat_number);
  assert.equal(chosenA[0].row_label, 'A');
  assert.ok(
    (chosenA[0].seat_number === 1 && chosenA[1].seat_number === 2) ||
    (chosenA[0].seat_number === 9 && chosenA[1].seat_number === 10),
    `Expected Recliner corner pair, got ${chosenA.map((s) => s.row_label + s.seat_number)}`
  );

  // Case B: Corners in Recliner booked -> picks adjacent pair in Recliner 3..8
  [1, 2, 9, 10].forEach((n) => (getSeat(hall, 'A', n).status = 'booked'));
  const rCenter = suggestSmartSeats(hall, 2, 1);
  const chosenCenter = rCenter.seatIds.map((id) => hall.find((s) => s.id === id)).sort((a, b) => a.seat_number - b.seat_number);
  assert.equal(chosenCenter[0].row_label, 'A');
  assert.ok(chosenCenter[0].seat_number >= 3 && chosenCenter[1].seat_number <= 8);
  assert.equal(chosenCenter[1].seat_number - chosenCenter[0].seat_number, 1);

  // Case B2: When Recliner has no adjacent pairs left, picks Club corner (1-2 or 9-10) BEFORE Club center (3-8)
  const clubCornerHall = buildEmptyHall();
  clubCornerHall.filter((s) => s.tier === 'recliner').forEach((s) => (s.status = 'booked'));
  const rClubCorner = suggestSmartSeats(clubCornerHall, 2, 1);
  const clubCornerSeats = rClubCorner.seatIds.map((id) => clubCornerHall.find((s) => s.id === id)).sort((a, b) => a.seat_number - b.seat_number);
  assert.equal(clubCornerSeats[0].tier, 'club');
  assert.ok(
    (clubCornerSeats[0].seat_number === 1 && clubCornerSeats[1].seat_number === 2) ||
    (clubCornerSeats[0].seat_number === 9 && clubCornerSeats[1].seat_number === 10),
    `Expected Club corner pair first, got ${clubCornerSeats.map((s) => s.row_label + s.seat_number)}`
  );

  // Case C: No two adjacent seats available anywhere -> picks closest single seats
  const sparseHall = buildEmptyHall();
  sparseHall.forEach((s) => (s.status = 'booked'));
  // Only leave A1 (far corner), D4 and D6 (2 apart in same row D), and J10 (far corner) free
  getSeat(sparseHall, 'A', 1).status = 'available';
  getSeat(sparseHall, 'D', 4).status = 'available';
  getSeat(sparseHall, 'D', 6).status = 'available';
  getSeat(sparseHall, 'J', 10).status = 'available';

  const rClose = suggestSmartSeats(sparseHall, 2, 1);
  const labels = rClose.seatIds.map((id) => {
    const s = sparseHall.find((x) => x.id === id);
    return s.row_label + s.seat_number;
  }).sort();
  assert.deepEqual(labels, ['D4', 'D6']);
});

test('3 or 4 seats: picks adjacent in 3-8 first, else adjacent anywhere (Row A), else closest cluster', () => {
  const hall = buildEmptyHall();

  // Case A: Book A3..A8 so Recliner center cannot fit 3 seats, leave Club open -> picks Club 3..8 adjacent block
  [3, 4, 5, 6, 7, 8].forEach((n) => (getSeat(hall, 'A', n).status = 'booked'));
  const r3Club = suggestSmartSeats(hall, 3, 1);
  const picked3Club = r3Club.seatIds.map((id) => hall.find((s) => s.id === id)).sort((a, b) => a.seat_number - b.seat_number);
  assert.equal(picked3Club[0].tier, 'club');
  assert.ok(picked3Club.every((s) => s.row_label === picked3Club[0].row_label));
  assert.ok(picked3Club[0].seat_number >= 3 && picked3Club[2].seat_number <= 8);
  assert.equal(picked3Club[2].seat_number - picked3Club[0].seat_number, 2);

  // Case B: Leave only A1, A2, A3, A4 contiguous anywhere in 3-8 disabled across all tiers -> falls back to A1-A4
  const fullCenterHall = buildEmptyHall();
  fullCenterHall.forEach((s) => (s.status = 'booked'));
  [1, 2, 3, 4].forEach((n) => (getSeat(fullCenterHall, 'A', n).status = 'available'));
  // Note: A1..A4 contains seat 3 & 4, and for 4 seats there's no block inside 3..8, so fallback picks continuous A1..A4!
  const r4Fallback = suggestSmartSeats(fullCenterHall, 4, 1);
  const labels = r4Fallback.seatIds.map((id) => {
    const s = fullCenterHall.find((x) => x.id === id);
    return s.row_label + s.seat_number;
  }).sort();
  assert.deepEqual(labels, ['A1', 'A2', 'A3', 'A4']);

  // Case C: 3 seats when ZERO adjacent blocks exist anywhere -> picks closest 3 seats cluster
  const scattered3Hall = buildEmptyHall();
  scattered3Hall.forEach((s) => (s.status = 'booked'));
  getSeat(scattered3Hall, 'A', 1).status = 'available';
  getSeat(scattered3Hall, 'D', 4).status = 'available';
  getSeat(scattered3Hall, 'D', 6).status = 'available';
  getSeat(scattered3Hall, 'E', 5).status = 'available';
  getSeat(scattered3Hall, 'J', 10).status = 'available';
  const r3Close = suggestSmartSeats(scattered3Hall, 3, 1);
  const close3Labels = r3Close.seatIds.map((id) => {
    const s = scattered3Hall.find((x) => x.id === id);
    return s.row_label + s.seat_number;
  }).sort();
  assert.deepEqual(close3Labels, ['D4', 'D6', 'E5']);
});
