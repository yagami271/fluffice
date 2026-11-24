// English by default, French when the browser asks for it. Force one with ?lang=en or ?lang=fr.

const en = {
  mood: { ask: 'needs your OK', question: 'has a question', done: 'is done', work: 'is working', rest: 'is on a break', sleep: 'is asleep' },
  one: { ask: 'needs your OK', question: 'has a question', answer: 'needs an answer', done: 'is done' },
  many: { ask: 'need your OK', question: 'have a question', answer: 'need an answer', done: 'are done' },
  calm: 'All good, nothing needs you',
  quiet: 'The office is quiet',
  working: (n) => `${n} working`,
  resting: (n) => `${n} resting`,
  more: (n) => `and ${n} more`,
  now: 'just now',
  minutes: (n) => `${n} min ago`,
  hours: (n) => `${n} h ago`,
  days: (n) => `${n} d ago`,
  doneSince: (when) => `done ${when}`,
  label: (project, title) => `${project}: ${title}`,
  noProject: 'No project',
  newSession: 'New session',
  inChest: 'In the toy chest',
  chest: () => 'asleep',
  inLine: 'In line',
  line: () => 'in line',
  slate: () => 'working',
  where: { app: 'desktop app', terminal: 'terminal' },
  sound: { off: 'Sound off', on: 'Sound on', blocked: 'Click to hear', elsewhere: 'Sound in another tab' },
  ui: {
    demo: 'Demo', mine: 'My sessions', finish: 'A session finishes', needs: 'A session needs you', reset: 'Back to work, everyone', crowd: 'Fifty sessions',
    hour: 'Time of day', volume: 'Volume', hearDone: 'Hear “done”', hearAsk: 'Hear “needs you”', roster: 'Sessions',
  },
  demo: [
    ['shop', 'Cart redesign'], ['shop', 'Pay in three parts'], ['shop', 'Follow-up emails'], ['mobile-app', 'Push notifications'], ['infra', 'Encrypted backups'],
    ['website', 'Pricing page'], ['blog', 'RSS feed'], ['mobile-app', 'iOS icons'], ['crm', 'CSV import'],
  ],
  crowd: {
    projects: ['shop', 'mobile-app', 'infra', 'website', 'blog', 'crm', 'docs', 'design-kit', 'api', 'data', 'support', 'payroll', 'maps', 'audio'],
    titles: ['Cart redesign', 'Security audit', 'Database migration', 'Load tests', 'Follow-up emails', 'Pricing page', 'CSV import', 'CI fixes'],
  },
};

const fr = {
  mood: { ask: 'attend ton accord', question: 'te pose une question', done: 'a terminé', work: 'travaille', rest: 'est en pause', sleep: 'dort' },
  one: { ask: 'attend ton accord', question: 'te pose une question', answer: 'attend ta réponse', done: 'a terminé' },
  many: { ask: 'attendent ton accord', question: 'te posent une question', answer: 'attendent ta réponse', done: 'ont terminé' },
  calm: 'Tout roule, rien ne t’attend',
  quiet: 'Le bureau est au repos',
  working: (n) => `${n} au travail`,
  resting: (n) => `${n} au repos`,
  more: (n) => (n > 1 ? `et ${n} autres` : 'et 1 autre'),
  now: 'à l’instant',
  minutes: (n) => `il y a ${n} min`,
  hours: (n) => `il y a ${n} h`,
  days: (n) => `il y a ${n} j`,
  doneSince: (when) => `fini ${when}`,
  label: (project, title) => `${project} : ${title}`,
  noProject: 'Sans projet',
  newSession: 'Nouvelle session',
  inChest: 'Dans le coffre',
  chest: (n) => (n > 1 ? 'dorment ici' : 'dort ici'),
  inLine: 'Dans la file',
  line: (n) => (n > 1 ? 'font la queue' : 'fait la queue'),
  slate: () => 'au travail',
  where: { app: 'app desktop', terminal: 'terminal' },
  sound: { off: 'Son coupé', on: 'Son activé', blocked: 'Clique pour entendre', elsewhere: 'Son dans un autre onglet' },
  ui: {
    demo: 'Démo', mine: 'Mes sessions', finish: 'Une session termine', needs: 'Une session attend un accord', reset: 'Tout relancer', crowd: 'Cinquante sessions',
    hour: 'Heure', volume: 'Volume', hearDone: 'Écouter « a terminé »', hearAsk: 'Écouter « attend ton accord »', roster: 'Sessions',
  },
  demo: [
    ['boutique', 'Refonte du panier'], ['boutique', 'Paiement en trois fois'], ['boutique', 'Emails de relance'], ['app-mobile', 'Notifications push'], ['infra', 'Sauvegardes chiffrées'],
    ['site-vitrine', 'Page tarifs'], ['blog', 'Flux RSS'], ['app-mobile', 'Icônes iOS'], ['crm', 'Import CSV'],
  ],
  crowd: {
    projects: ['boutique', 'app-mobile', 'infra', 'site-vitrine', 'blog', 'crm', 'docs', 'design-kit', 'api', 'data', 'support', 'paie', 'cartes', 'audio'],
    titles: ['Refonte du panier', 'Audit de sécurité', 'Migration base', 'Tests de charge', 'Emails de relance', 'Page tarifs', 'Import CSV', 'Corrections CI'],
  },
};

export const LANGUAGES = { en, fr };

const asked = globalThis.location ? new URLSearchParams(location.search).get('lang') || navigator.language : 'en';
export const lang = /^fr\b/i.test(asked ?? '') ? 'fr' : 'en';
export const T = LANGUAGES[lang];

// Names come from Claude Code as they are. Only the missing ones are worded here.
export const projectName = (s) => s.project || T.noProject;
export const titleName = (s) => s.title || T.newSession;
