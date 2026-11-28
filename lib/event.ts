export const tracks = [
  {
    id: 'exchange',
    name: 'Crypto exchanges',
    focuses: ['Usability and costs', 'Security', 'Data agent'],
  },
  {
    id: 'wallet',
    name: 'Software wallets',
    focuses: [
      'Security',
      'Usability, features and pilot',
      'Scope, provider list and data agent',
    ],
  },
  {
    id: 'tax',
    name: 'Crypto tax tools',
    focuses: ['Costs and calculator', 'Sample dataset test', 'Data agent'],
  },
] as const;
export const focuses = {
  ...Object.fromEntries(
    tracks.map((t) => [t.id + '-own', t.name + ' · Own topic']),
  ),
  ...Object.fromEntries(
    tracks.flatMap((t) =>
      t.focuses.map((name, i) => [
        `${t.id}-${'ABC'[i]}`,
        `${t.name} · ${'ABC'[i]} · ${name}`,
      ]),
    ),
  ),
};
export function commitCutoff(deadline: Date | string) {
  return new Date(new Date(deadline).getTime() + 5 * 60_000);
}
export const ownTopicLimit = 200;
export function focusLabel(focus: string, ownTopic: string | null) {
  const label = focuses[focus];
  return ownTopic && focus.endsWith('-own') ? `${label} · ${ownTopic}` : label;
}
export function eventDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(date));
}
