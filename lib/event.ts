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
export const brief = 'https://github.com/andi-lightup/lightup-tbc-hackathon';
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

export const pitchCriteria = [
  { id: 'p1', label: 'Result and demonstration', max: 15 },
  { id: 'p2', label: 'Usefulness for LIGHT UP and readers', max: 15 },
  { id: 'p3', label: 'Evidence and reproducibility', max: 10 },
  { id: 'p4', label: 'Clarity and timing', max: 10 },
] as const;
