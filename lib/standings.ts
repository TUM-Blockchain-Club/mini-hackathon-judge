import { officialVersion } from '../judge/official';
import type { TeamRow } from './types';
export type TieDecision = {
  signature: string;
  team_order: string[];
  reason: string;
};
export function standings(teams: TeamRow[], decisions: TieDecision[]) {
  const rows = teams.map((t) => {
    const historical =
      t.run_id &&
      t.rubric?.version !== officialVersion &&
      t.ballots === 0 &&
      t.legacy_pitch != null;
    const pitchSum = historical ? t.legacy_pitch! * 3 : t.pitch_sum;
    const scoredPitch = t.ballots === 3 || historical ? pitchSum / 3 : null;
    // 900 units per point represents both rescaled ninths and three-juror averages exactly.
    const total =
      t.points != null && scoredPitch != null && !t.jury_review?.disqualified
        ? Math.max(
            0,
            Math.round(t.points * 900) - (t.late ? 4500 : 0) + pitchSum * 300,
          )
        : null;
    return {
      ...t,
      pitch_sum: pitchSum,
      pitch: scoredPitch,
      total,
      overall: total === null ? null : total / 900,
      place: null as number | null,
      tie: null as string | null,
      decision: '',
    };
  });
  rows.sort(
    (a, b) => (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name),
  );
  for (let start = 0; start < rows.length && rows[start].total !== null;) {
    let end = start + 1;
    while (end < rows.length && rows[end].total === rows[start].total) end++;
    const group = rows.slice(start, end);
    if (start < 3) group.sort((a, b) => b.pitch_sum - a.pitch_sum);
    for (let i = 0; i < group.length;) {
      let j = i + 1;
      while (
        j < group.length &&
        (start >= 3 || group[j].pitch_sum === group[i].pitch_sum)
      )
        j++;
      const subset = group.slice(i, j);
      if (start + i < 3 && subset.length > 1) {
        const ids = subset.map((t) => t.id).sort();
        const key = [subset[0].total, subset[0].pitch_sum, ...ids].join('/');
        const chosen = decisions.find(
          (d) =>
            d.signature === key &&
            d.team_order.length === ids.length &&
            new Set(d.team_order).size === ids.length &&
            ids.every((id) => d.team_order.includes(id)),
        );
        if (chosen)
          subset.sort(
            (a, b) =>
              chosen.team_order.indexOf(a.id) - chosen.team_order.indexOf(b.id),
          );
        subset.forEach((t, index) => {
          t.place = chosen ? start + i + index + 1 : null;
          t.tie = key;
          t.decision = chosen?.reason ?? '';
        });
        group.splice(i, j - i, ...subset);
      } else
        subset.forEach((t) => {
          t.place = start + i + 1;
        });
      i = j;
    }
    rows.splice(start, end - start, ...group);
    start = end;
  }
  return rows;
}
