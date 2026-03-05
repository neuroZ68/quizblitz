/**
 * Scoring engine — mirrors Kahoot's speed-based scoring
 * @param {boolean} correct - Whether answer was correct
 * @param {number} elapsedMs - Time taken to answer in ms
 * @param {number} timeLimitMs - Total time allowed in ms
 * @param {number} streak - Consecutive correct answers
 * @returns {{ points: number, base: number, timeBonus: number, streakBonus: number }}
 */
export function calculateScore(correct, elapsedMs, timeLimitMs, streak = 0) {
    if (!correct) {
        return { points: 0, base: 0, timeBonus: 0, streakBonus: 0 };
    }

    const base = 1000;
    const timeRatio = Math.max(0, 1 - (elapsedMs / timeLimitMs));
    const timeBonus = Math.round(1000 * timeRatio);
    const streakBonus = streak * 100;
    const points = base + timeBonus + streakBonus;

    return { points, base, timeBonus, streakBonus };
}
