/*
 * Die feste Qualifikationsregion jedes Globals-Teams - ohne Abhaengigkeit
 * von Server oder Ablage, damit auch die Seiten sie direkt nutzen koennen.
 * Faellt Epic oder die Ablage aus, stehen die Teams trotzdem unter ihrer
 * Region und nicht gesammelt unter "No region".
 */

/*
 * Fuer welche Region ein Team antritt: die Region, ueber die es sich fuer die
 * Global Championship 2026 qualifiziert hat - nicht die Heimat eines seiner
 * Spieler. Der Betreiber (24.9.2026): "Es gibt keine Teams, die zwei Regionen
 * haben ... Europa 21, NAC 14, NA West 3, Brasilien 3, Asien 3, Middle East
 * 3, Ozeanien 3." Die Aufteilung stammt von ihm; Schluessel ist das
 * LAN-Turnierkonto eines der beiden Spieler.
 */
export const REGION_DER_QUALI: Record<string, string> = {
  'd725caa68b0c45439dc0a2c25187a1a3': 'EU', // Chap + Flickzy
  'd382cad710ec419fa11a363e9ec0f74b': 'EU', // Tjino + Pаblowingu
  'd02867d73bc34c919f0098c3347a0384': 'EU', // Nxthan + nebs
  'cf9320856cd843ce94957ab4fe6a607e': 'EU', // Zynox + Velo
  '78262c913d484782b4d430e85be84c44': 'EU', // Syaaz + Scaryy
  '60d89e20037741bf8e6aaa7faad32228': 'EU', // FIREN + Pixx
  '5e96f0447b0a47839eb92fd4586c0029': 'EU', // demus + Darm
  '4fc90886d60348fdb7f940764d683acb': 'EU', // Focus + Th0masHD
  '4b16cc674c5a4285acc5446ec339ffde': 'EU', // swizzy + Pixie
  '46e5c9988dd2444289590c59fbf0962e': 'EU', // fant + Volko
  '423a8fbcb4854e6995cf19927f93fe6c': 'EU', // ghonzo + IDrop
  '37e4105726ea4201b895673b37ef74e0': 'EU', // Charyy + Kami
  '31bc02a39a9a42ab87afc86ad8de0d8e': 'EU', // nociff + izzi
  '2efda2d01fdb4d079a41c9e0d45c2136': 'EU', // HUTY + F1shyX
  '216552957f1041fe87df96d47e34426f': 'EU', // Malibuca + Vico
  '1fa41964d9474027b72f926307b10805': 'EU', // King Cr1nge + Twi
  '1c3b86b9733b4daea5a87085848152b8': 'EU', // Shxrk + T3eny
  '178cef88d59043c98162a583a2f4a342': 'EU', // JULLE + Tidi
  '16d64c44a09748a2ac0269f9ed13e912': 'EU', // JannisZ + rax
  '09a35800f1944218a602c2f028da25b4': 'EU', // Scroll + Sky
  '04d0f37ea8c64886abb08099325aba33': 'EU', // seyyto + Momsy
  'c944c63a79d749eeb380394fdc2503df': 'NAC', // BOLTZ + ACORN
  '8f4fc946cee74e1ebb43705a60eb461c': 'NAC', // COOPER + REET
  '3dcd4df5d13a40b9b1cdc9f882abecc8': 'NAC', // RISE + MUZ
  '34596862b66b4cc8a49ccb177c8f92ad': 'NAC', // ENCRYPTED + HCUBE
  '3399dcc98ea14d1c9282920c34b9eef8': 'NAC', // VERGO + SHADOW1X
  '2c2e520cf48f4b4f9efe9c6ca94a3290': 'NAC', // CURVE + HIGGS
  '20d19161a46c4c9bb06fcc6d4d980021': 'NAC', // GOLDEN + OZONE
  '19c6bd9fbb3c447f8bc60e4dfe10e796': 'NAC', // Veno + ajers
  '0508900d1d3d40adacdefcd0dc8ed7cb': 'NAC', // RAPID + CLIX
  '04c3981fa0244c1290ed1243777ee514': 'NAC', // SLEPZI + WAGERS
  '036c7c2a0add44d78e9c8929d20f4387': 'NAC', // COLD + RITUAL
  '032ba94372e04597b7dc14a04bb9e590': 'NAC', // peterbot + POLLO
  '025ff630e1b245ac8abf5e3d8805407d': 'NAC', // KRAEZ + KINGALING
  '55115d4537234bed9b8e628b9054674b': 'NAC', // EOMZO + Joshreyli
  '7780851421bf4b3c8b98c652b2b85c61': 'NAW', // PHOENIX + RETRO
  '5bf18d44a6a74405b4d2aafd0de046c1': 'NAW', // KHANADA + ARK
  '28326fb4a52142ae97b8cd9c848fb92f': 'NAW', // EPIKWHALE + PXMP
  '8d108589830f4f5c880d1ef8698888eb': 'BR', // DIGUERA + MACK
  '34df6f4e2b2a4be5ac9316d2127e59ad': 'BR', // GRX + RANDU
  '3371680b04954fb0b70e5dd3566fd139': 'BR', // ROMERO + LEWA
  '252bb10fd0304c3bb1d8941e02d5d91b': 'ASIA', // pinq + RURA
  '1ab6405231044a21ab1f971e42b19650': 'ASIA', // YUMA + KOYOTA
  '0eb47f1384904d6290ce90b03e20f63e': 'ASIA', // MINIPIYO + FUUKUN
  '628590ca073e42339b7c3a20b89194d1': 'ME', // 27Q8 + 5AALD
  '5099fd09bf4c4302988a911a8be4c839': 'ME', // MSHARY + SALVATORE
  '27a80b7c2ad04bbdafbe0e99b89dde68': 'ME', // Cringe + 1LUSHA
  '58e1f6e329094725b5054ecc31691a84': 'OCE', // RESIGNZ + TINKA
  '451a746231e84464b77061d30267ed32': 'OCE', // PHAZMA + CRUSADES
  '0966d8d0058b47f08d759d55ba5ca26e': 'OCE', // SOLVEY + SAZERS
};
