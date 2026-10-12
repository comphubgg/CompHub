/*
 * Die aktuellen Trios fuer die Tierlist: bestaetigte und solche, die sich ausprobieren.
 *
 * Der Betreiber (12.10.2026): in die Trio-Tierlist gehoeren "alle offiziellen, beziehungsweise Trying Trios, die
 * aktuell sind", "alle alten anderen Trios" raus - es standen immer noch viel zu viele Leute darin. Die Liste stammt
 * vom Stand des 12.10.2026 (Quelle: oeffentlich einsehbare Aufstellungen der Szene); wer wann mit wem spielt, aendert
 * sich - was der Admin in der Tierlist hinzufuegt oder loescht, gilt zusaetzlich bzw. hat Vorrang
 * (/api/tierlist-trios, /api/tierlist-entfernt).
 *
 * "bestaetigt": die Spieler haben angekuendigt oder bestaetigt, zusammen zu spielen.
 * "testet":     sie probieren das Trio aus, es ist noch nicht endgueltig und kann sich aendern.
 */

export type TrioStatus = 'bestaetigt' | 'testet';

export interface AktuellesTrio {
  region: string;
  status: TrioStatus;
  /** Die drei Epic-Konto-Ids. */
  ids: [string, string, string];
  /** Die drei Namen, wie die Szene sie fuehrt - Rueckfall, wenn das Profil keinen Anzeigenamen kennt. */
  namen: [string, string, string];
}

export const TRIOS_AKTUELL: AktuellesTrio[] = [
  { region: 'EU', status: 'bestaetigt', ids: ['e7987ee7c7fa43dd814252eedc06af2f', '39a4c6ccd9bf46a2bc6f9a3106de22f4', '072e8b9f8188405ab0eb52544e1dc906'], namen: ['T3ENY', 'SHXRK', 'SWIZZY'] },
  { region: 'EU', status: 'bestaetigt', ids: ['881f4d75aa3046c5b648a73aea641e69', '45ce4565b6db452c9419119b12e7eac3', '02c93e4588f241baa6cb5040632326b4'], namen: ['MALIBUCA', 'PETERBOT', 'VICO'] },
  { region: 'EU', status: 'bestaetigt', ids: ['9cd77d61613244699e3dfb7815f59cf9', 'b39cded93b0f4aa59ffdadf0db18e853', '137b42eb15ad4c0eaed668678ef884a6'], namen: ['PABLOWINGU', 'PIXIE', 'TJINO'] },
  { region: 'EU', status: 'bestaetigt', ids: ['2f98535a2b2a43d0922c1aa56034cbb6', '7061094036324a849b1ba468bb581df3', '9868429b133a42b8a43f737887da4673'], namen: ['SKY', 'SCROLL', 'POLLO'] },
  { region: 'NAC', status: 'testet', ids: ['419c636586af49f2886a97a3cfef22d3', '3736de3c0eb043649fac15ec1025ff08', '45ce4565b6db452c9419119b12e7eac3'], namen: ['RAPID', 'CLIX', 'PETERBOT'] },
  { region: 'NAC', status: 'bestaetigt', ids: ['28f2d4207f9142838351f610815012e1', '37da09eb8b574968ad36da5adc02232b', '14caafa7dc964c28b80096bcd5b38e30'], namen: ['RITUAL', 'COLD', 'AJERSS'] },
  { region: 'NAC', status: 'bestaetigt', ids: ['2d91ad40c7384c8a9c12c4c295450d78', '87a8e3b6537941d58bbee06b9ac19b6a', '5244792407074052a08cbe04c830726d'], namen: ['ACORN', 'JOSHREYLI', 'CURVE'] },
  { region: 'EU', status: 'bestaetigt', ids: ['68c17d1eea3c42ad98d72b48675242ea', 'dca13c0626af4af7aadf39c3ba44914b', 'ed7958600321496fa7ca0ed2ee544051'], namen: ['DARM', 'DEMUŚ', 'CHARYY'] },
  { region: 'EU', status: 'testet', ids: ['0865dd0ccabd4156aa6e7757f9b5b753', 'b98790d7278b4169947b3c932c3a6af0', 'c361004bd01441098a2d9778ff24d195'], namen: ['NEBS', 'NXTHAN', 'KIRO'] },
  { region: 'EU', status: 'testet', ids: ['99318c7303c541cdb52133a9e6380979', 'e8e6c5346fe646ba8fa5dc37002eb22d', 'fbf93610fe9448c7a5eb537be89533d5'], namen: ['IZZI', 'NOCIF', 'SEYYTO'] },
  { region: 'EU', status: 'testet', ids: ['9032a26b8a7845dd991841581182a1dd', 'ef29a568e9c145a785da2903fe81114b', 'ba35337d939749af80ee7f0b4f680d82'], namen: ['MRSAVAGE', 'GHONZO', 'KAAN'] },
  { region: 'EU', status: 'bestaetigt', ids: ['2fc6c760b9504e6187cde71d86d314c8', '990f29fa76f9482f807820dd4807f464', '2b3da27c62d14887bd6daa865df33487'], namen: ['CR1NGE', 'TWI', 'IDROP'] },
  { region: 'EU', status: 'testet', ids: ['746fde5c9ceb4850bf60557d1260399e', '8a9f8de89ec04ae09755781697a30577', '8fa6505583834b1faa184a891acf0680'], namen: ['HRIS', 'TAYSON', 'CHICO'] },
  { region: 'EU', status: 'testet', ids: ['862a829593db4771a9965076bf1621b7', 'd141060dd88545c4a3b2408f668508b3', '0ecd594f9f7346c1867e303f3e1d825a'], namen: ['JANNISZ', 'MOMSY', 'SKYJUMP'] },
  { region: 'EU', status: 'testet', ids: ['077d69a8f1ea43e4bf8f1273dc0b5aa5', '78fccdc1ea7e4ea08103902c01908858', 'a805254515544975936323c7533e24ef'], namen: ['AKIIRA', 'KURAMA', 'WEREX'] },
  { region: 'EU', status: 'testet', ids: ['43cac997486f4778a87df43a8c1e1436', '9d06e2ffd2e04416bfb28e36ad03d0d8', '01ae7eb0a36143dc9cb23a091cf6aaf6'], namen: ['HOWLY', 'DANDEPUZO', 'WHEAT'] },
  { region: 'EU', status: 'bestaetigt', ids: ['9b1083688c3e4364b0c448d7bc9b4c06', 'ebbc1edaa769417eb5821b56d722c3f5', '96558524507e4c5cade85cf8ea512b2c'], namen: ['VELO', 'ZYNOX', 'TROOLY'] },
  { region: 'EU', status: 'testet', ids: ['11c2360ac16243db85dd822a8cb6ad3c', 'a593edd8f48a4b4f9b89ef544ca9db4f', 'ca36e50b4d0e46cbbac3812cbcf884ad'], namen: ['CRINGE', 'MONEYMAKER', 'FNAJEN'] },
  { region: 'EU', status: 'testet', ids: ['f957f49cfac24a2ba5df5280f3984e14', 'a46c3a48d0554aaf8fa2a068e0e711a0', '6c5bad057c4249c2bc16643462a77daf'], namen: ['FREDOXIE', 'HELLFIRE', 'SRAPT'] },
  { region: 'EU', status: 'testet', ids: ['d6fb64a281164912bb1c470b24470eaf', '7dce4c8550524de4baec83e239ba9cde', 'f7445e7e65fe429ab2a1eff6c739d656'], namen: ['DARKOS', 'BIMBO', 'RAD3ON'] },
  { region: 'EU', status: 'testet', ids: ['4eef01c0cbc74341bf879fab965daa98', '0929c6de11cd49b0bb749183e5a66371', 'c6cfb645e83d48f880db4bb7e47133a2'], namen: ['PIXX', 'DINUŚ', 'FRANEK'] },
  { region: 'NAC', status: 'testet', ids: ['1f95d39e197142d5930a56c2a9a4b1cb', '1c58bb3d6a284cc9a235a82992ec7c16', 'a28109ddbeb748ad93b94e205e5a2048'], namen: ['QUEASY', 'SCARE', 'VERGO'] },
  { region: 'NAC', status: 'bestaetigt', ids: ['5ebbf7fcef8340b383ad03fa0205c3c9', 'cbfa6071b14a43108e99c22313431944', '1e1bdb30f7df4c3896edf7926ceec2bb'], namen: ['COOPER', 'SPHINX', 'VICTERV'] },
  { region: 'NAC', status: 'testet', ids: ['c17bac91e57e4ab58cc5c4e9d846afc5', 'd6e651d508004eaeaf16dc434b0b41e7', 'fe86111711b449a6a41ab6b8f6a618ce'], namen: ['BRAYDZ', 'XAVI', 'AMINISHED'] },
  { region: 'NAC', status: 'testet', ids: ['3ce9c64d8286489480d1aceeb206589a', '9d753f5abe9b43fa9915ff04a54ca3f0', 'bce270604551411ab0a7ffcac5f058e0'], namen: ['HIGGS', 'EOMZO', 'BOLTZ'] },
  { region: 'NAC', status: 'testet', ids: ['6f29ff7f006140dabccc9c18d5c8db42', '8c54d5ee92554d818c96a7f7d01a9b9b', 'ae8ac6f7115f4d8ea2da979848ae9f7a'], namen: ['GOLDEN', 'THREATS', 'OZONE'] },
  { region: 'NAC', status: 'testet', ids: ['15575f3b849e4e2ead20b6a33b7a4096', '2e5dda3d8b594d0e9e18bea105ef3e1a', '34009ee20b024cfb843d984e5b9b30aa'], namen: ['LIAM', 'JAYSE', 'SHADOW1X'] },
  { region: 'NAC', status: 'testet', ids: ['0558720200b9408b9e2a9242f02d7812', '6a7e6e0e72ee477b9e08f4919e17414a', 'f6dbee655d5d4501b597ca3d3fb4a0ce'], namen: ['SLEPZI', 'WAGERS', 'CHANNCE'] },
  { region: 'NAC', status: 'testet', ids: ['0db2c1c50154427ba1ce396b91d266a8', '5a3728830d834bd78307cfe968ce374f', 'c51a36b250f545dfbf3131abef2a7151'], namen: ['VISXALS', 'KHANADA', 'KINGALING'] },
  { region: 'NAW', status: 'bestaetigt', ids: ['501b47666d0b42609ba72a04c2cdc300', '379f630636d64e6b8b3d7469608ff739', '40201b92c748411393b53b50a6c0b58b'], namen: ['EPIKWHALE', 'ARK', 'RETRO'] },
  { region: 'ME', status: 'bestaetigt', ids: ['a2d547c84c0449358949ebb51b3c671b', '71ae89ef042547b4be1bed58713cef03', '278c95a8671d432da2110578a5120e7b'], namen: ['SALVATORE', 'MSHARY', '5AALD'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['a02255ac2ab446b6be1153f4e6e01038', 'd794d93c0e854c428b4596dda8f11987', '371450a0380c44689ac4b5a2bfcd7724'], namen: ['ALEX', 'WRECKLESS', 'ZDOG'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['15221258a5614a8289d660cb116aa4d2', '22cf797239f542caaf597660403c97a6', '1811cd1fa9c44422bf6e1aed6ec1302e'], namen: ['RESIGNZ', 'TINKA', 'VAZEN'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['ae9bd7153291439fb770ce7e58b561ee', 'e0a682c210b347a69c698841a37c42b3', 'e7769a453b3f4c0ca39086f0a520629a'], namen: ['ASPECT', 'MACE', 'JERALD'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['85a847056ee54dd594c149799431e1f9', 'dfb10da12b274c77b9386f1e1fca2055', 'b5a13b864027494ea4399fd3e9257332'], namen: ['MOUNTAIN', 'ROBJITT', 'GOOFY'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['fc14f89181654fb59a52228f72d666b7', '84da9b1d71ad456ba916d6590c096161', 'cffb3fec1c3f45aeb69506ee48d4f74a'], namen: ['XAVIER', 'SOLVEY', 'SAZERS'] },
  { region: 'OCE', status: 'bestaetigt', ids: ['8e60e750c4fd4eaca11ebb49686a590a', '6dc41a58306747f794ff58e87ecb357a', '136a6e45b05e4646b214c012b020560d'], namen: ['DANATH', 'TAME', 'MASSIMO'] },
];
