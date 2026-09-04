// Bekannte Esport-Orgtags.
//
// Abgeleitet aus den Turnierdaten: Woerter, die bei mindestens zwei
// verschiedenen Konten am Namensanfang stehen. Die Schreibweise spielt keine
// Rolle - "BIG" und "big" sind dieselbe Organisation.
//
// Der Umweg ueber die Daten ist noetig, weil sich Orgtags nicht an ihrer Form
// erkennen lassen: "GodL" und "FocusHD" sehen gleich aus, aber nur das eine
// ist eine Organisation. Die Liste laesst sich mit
//   npm run orgtags
// aus dem Namensverzeichnis neu erzeugen.

export const ORGTAGS: ReadonlySet<string> = new Set([
  '1p', '1tr', '1up', '1x', '21', '2r', '7ven', '95v', 'a1st', 'ace',
  'aevion', 'ag', 'agal', 'ahl', 'al', 'alahli', 'almhmd', 'alp', 'alpha',
  'alpha7', 'alula', 'amoris', 'arm', 'armr', 'arw', 'asc', 'ascend',
  'asl', 'asp', 'ast', 'atc', 'atlantic', 'atrct', 'aur', 'aura', 'aurora',
  'ave', 'avery', 'avtr', 'awwty', 'axis', 'axr', 'batman', 'best', 'big',
  'blst', 'bluep', 'blz', 'bnth', 'bof', 'brave', 'brn', 'brnw', 'bs',
  'ca', 'calm', 'celis', 'cg', 'chrome', 'cloud', 'clue', 'cnq', 'coast',
  'cold', 'covex', 'cr', 'crt', 'cst', 'cue', 'cvx', 'cyn', 'dazed', 'db',
  'delta', 'detect', 'dfm', 'dig', 'dlta', 'don', 'dvs', 'dx', 'dyd',
  'dzd', 'e36', 'edge', 'eggman', 'ego', 'egy', 'el', 'elite', 'enefy',
  'esp', 'evil', 'evo', 'exa', 'exv', 'f2', 'f4', 'f4t', 'f4tality', 'fa',
  'falcon', 'fatal', 'fav', 'fct', 'fear', 'fishy', 'fl', 'flare', 'flc',
  'flcn', 'flwlss', 'fnatic', 'fnc', 'fno', 'fokus', 'force', 'fpg', 'ftw',
  'furia', 'fut', 'fx', 'gana', 'gen', 'genius', 'gents', 'girthy', 'gk',
  'gl', 'glacier', 'glore', 'glr', 'godl', 'greed', 'gw', 'gx3', 'havk',
  'havok', 'helix', 'herb', 'hh', 'housen', 'hris', 'hrz', 'hs', 'hst',
  'hvk', 'hwk', 'hx', 'hylnd', 'ibn', 'ig', 'ignum', 'invia', 'ipf', 'jft',
  'jogo', 'joker', 'k13', 'k1ng', 'k2g', 'kc', 'kernel', 'kin', 'king',
  'kit', 'kos', 'ks', 'kylian', 'kyoto', 'la', 'lamine', 'lavie', 'law',
  'ld1', 'le', 'leaf', 'leal', 'lets', 'lev', 'lex', 'lil', 'lila', 'lit',
  'lizer', 'loud', 'loyal', 'lucas', 'lum', 'lux', 'lynox', 'lynx',
  'lynxy', 'lyost', 'm8', 'mero', 'mg', 'mga', 'mlr', 'mns', 'mr', 'mtrx',
  'mv', 'mystry', 'neos', 'nerve', 'nexus', 'nip', 'nkzm', 'nmss', 'noah',
  'not', 'now', 'ns', 'nstar', 'nt', 'nto', 'ntx', 'nv', 'nxg', 'o5',
  'obi', 'oe', 'one', 'onic', 'onyx', 'orc', 'orz', 'osama', 'ot',
  'overtake', 'ozery', 'pandore', 'paron', 'pdr', 'pfc', 'piece', 'pingu',
  'pmb', 'poyo', 'prime', 'prs', 'psr', 'psyc', 'pth', 'ptt', 'pwr', 'qtd',
  'qte', 'quax', 'r2p', 'r4c', 'r8', 'ray', 'rc', 'reds', 'rel', 'rg22',
  'rgn', 'roc', 'rt', 'rvl', 'rxb', 'ry2', 'ryze', 's2', 's8ul', 'saph',
  'se', 'seishiro', 'seor', 'sfg', 'sh', 'skyjump', 'slc', 'smk', 'snm',
  'snt', 'solace', 'solary', 'solo', 'sorin', 'sout', 'spe', 'spr', 'srg',
  'stm', 'sv', 't1', 't2g', 't3', 't6', 'the', 'tiktok', 'trkf', 'trp',
  'trx', 'tsu', 'ttv', 'twis', 'twitch', 'twitter', 'twtr', 'tyt', 'vc',
  'venly', 'vet', 'vgn', 'vit', 'vlc', 'vng', 'vnt', 'void', 'volare',
  'vp', 'vsn', 'vtx', 'vulcan', 'war', 'wip', 'wooka', 'ws', 'wtj', 'wtr',
  'x6', 'xp42', 'xset', 'yagla', 'yri', 'yvl', 'zard', 'zay', 'zeta',
  'znn', 'zo', 'zst', 'zt', 'zynbl', 'zzz',
]);
