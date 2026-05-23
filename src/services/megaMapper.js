import { toInt } from "../utils/numbers.js";

export function mapContestToNumbers(contest) {
  const dezenas = Array.isArray(contest?.dezenas) ? contest.dezenas : [];

  return dezenas
    .map((value) => toInt(value))
    .filter((value) => Number.isInteger(value));
}

export function extractAllDraws(contests) {
  return contests.map((contest) => ({
    concurso: contest.concurso,
    data: contest.data,
    acumulou: Boolean(contest.acumulou),
    dezenas: mapContestToNumbers(contest)
  }));
}
