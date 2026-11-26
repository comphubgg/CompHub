/*
 * Laender fuer Eingaben von Hand (Betreiber, 16.11.2026: /admin/flaggen). Ein Feld nimmt den Namen auf Englisch oder Deutsch ("Germany", "Deutschland",
 * "Polen"), das Kuerzel nach ISO 3166-1 mit zwei oder drei Buchstaben ("DE", "DEU", "pl") oder die Flagge selbst - gross oder klein - und macht daraus das
 * zweistellige Kuerzel, das in spieler-profile.json steht. Was hier nicht steht, wird abgelehnt: lieber keine Flagge als eine erfundene.
 *
 * Die Tabelle: je Zeile Kuerzel 2 | Kuerzel 3 | Name englisch | Name deutsch | weitere Namen. Erzeugt aus ISO 3166-1 (Liste von i18n-iso-countries 7.11.0,
 * Namen dazu aus Intl.DisplayNames en/de), dazu XK fuer Kosovo, das Epic und die Szene fuehren. Fest eingetragen statt zur Laufzeit aus Intl, damit Server
 * und Browser dasselbe annehmen.
 */

const ROH = `AF|AFG|Afghanistan|Afghanistan
AL|ALB|Albania|Albanien
DZ|DZA|Algeria|Algerien
AS|ASM|American Samoa|Amerikanisch-Samoa
AD|AND|Andorra|Andorra
AO|AGO|Angola|Angola
AI|AIA|Anguilla|Anguilla
AQ|ATA|Antarctica|Antarktis
AG|ATG|Antigua & Barbuda|Antigua und Barbuda|Antigua and Barbuda
AR|ARG|Argentina|Argentinien
AM|ARM|Armenia|Armenien
AW|ABW|Aruba|Aruba
AU|AUS|Australia|Australien
AT|AUT|Austria|Österreich
AZ|AZE|Azerbaijan|Aserbaidschan
BS|BHS|Bahamas|Bahamas
BH|BHR|Bahrain|Bahrain
BD|BGD|Bangladesh|Bangladesch
BB|BRB|Barbados|Barbados
BY|BLR|Belarus|Belarus
BE|BEL|Belgium|Belgien
BZ|BLZ|Belize|Belize
BJ|BEN|Benin|Benin
BM|BMU|Bermuda|Bermuda
BT|BTN|Bhutan|Bhutan
BO|BOL|Bolivia|Bolivien
BA|BIH|Bosnia & Herzegovina|Bosnien und Herzegowina|Bosnia and Herzegovina
BW|BWA|Botswana|Botsuana
BV|BVT|Bouvet Island|Bouvetinsel
BR|BRA|Brazil|Brasilien
IO|IOT|British Indian Ocean Territory|Britisches Territorium im Indischen Ozean
BN|BRN|Brunei|Brunei Darussalam
BG|BGR|Bulgaria|Bulgarien
BF|BFA|Burkina Faso|Burkina Faso
BI|BDI|Burundi|Burundi
KH|KHM|Cambodia|Kambodscha
CM|CMR|Cameroon|Kamerun
CA|CAN|Canada|Kanada
CV|CPV|Cape Verde|Cabo Verde|Kap Verde
KY|CYM|Cayman Islands|Kaimaninseln
CF|CAF|Central African Republic|Zentralafrikanische Republik
TD|TCD|Chad|Tschad
CL|CHL|Chile|Chile
CN|CHN|China|China|People's Republic of China
CX|CXR|Christmas Island|Weihnachtsinsel
CC|CCK|Cocos (Keeling) Islands|Kokosinseln
CO|COL|Colombia|Kolumbien
KM|COM|Comoros|Komoren
CG|COG|Congo - Brazzaville|Kongo-Brazzaville|Republic of the Congo|Congo|Republik Kongo
CD|COD|Congo - Kinshasa|Kongo-Kinshasa|Democratic Republic of the Congo|Congo|Kongo
CK|COK|Cook Islands|Cookinseln
CR|CRI|Costa Rica|Costa Rica
CI|CIV|Côte d’Ivoire|Côte d’Ivoire|Cote d'Ivoire|Côte d'Ivoire|Ivory Coast|Elfenbeinküste
HR|HRV|Croatia|Kroatien
CU|CUB|Cuba|Kuba
CY|CYP|Cyprus|Zypern
CZ|CZE|Czechia|Tschechien|Czech Republic|Tschechische Republik
DK|DNK|Denmark|Dänemark
DJ|DJI|Djibouti|Dschibuti
DM|DMA|Dominica|Dominica
DO|DOM|Dominican Republic|Dominikanische Republik
EC|ECU|Ecuador|Ecuador
EG|EGY|Egypt|Ägypten
SV|SLV|El Salvador|El Salvador
GQ|GNQ|Equatorial Guinea|Äquatorialguinea
ER|ERI|Eritrea|Eritrea
EE|EST|Estonia|Estland
ET|ETH|Ethiopia|Äthiopien
FK|FLK|Falkland Islands|Falklandinseln|Falkland Islands (Malvinas)
FO|FRO|Faroe Islands|Färöer
FJ|FJI|Fiji|Fidschi
FI|FIN|Finland|Finnland
FR|FRA|France|Frankreich
GF|GUF|French Guiana|Französisch-Guayana
PF|PYF|French Polynesia|Französisch-Polynesien
TF|ATF|French Southern Territories|Französische Süd- und Antarktisgebiete
GA|GAB|Gabon|Gabun
GM|GMB|Gambia|Gambia|Republic of The Gambia|The Gambia
GE|GEO|Georgia|Georgien
DE|DEU|Germany|Deutschland
GH|GHA|Ghana|Ghana
GI|GIB|Gibraltar|Gibraltar
GR|GRC|Greece|Griechenland
GL|GRL|Greenland|Grönland
GD|GRD|Grenada|Grenada
GP|GLP|Guadeloupe|Guadeloupe
GU|GUM|Guam|Guam
GT|GTM|Guatemala|Guatemala
GN|GIN|Guinea|Guinea
GW|GNB|Guinea-Bissau|Guinea-Bissau
GY|GUY|Guyana|Guyana
HT|HTI|Haiti|Haiti
HM|HMD|Heard & McDonald Islands|Heard und McDonaldinseln|Heard Island and McDonald Islands
VA|VAT|Vatican City|Vatikanstadt|Holy See (Vatican City State)
HN|HND|Honduras|Honduras
HK|HKG|Hong Kong SAR China|Sonderverwaltungsregion Hongkong|Hong Kong|Hongkong
HU|HUN|Hungary|Ungarn
IS|ISL|Iceland|Island
IN|IND|India|Indien
ID|IDN|Indonesia|Indonesien
IR|IRN|Iran|Iran|Islamic Republic of Iran
IQ|IRQ|Iraq|Irak
IE|IRL|Ireland|Irland
IL|ISR|Israel|Israel
IT|ITA|Italy|Italien
JM|JAM|Jamaica|Jamaika
JP|JPN|Japan|Japan
JO|JOR|Jordan|Jordanien
KZ|KAZ|Kazakhstan|Kasachstan
KE|KEN|Kenya|Kenia
KI|KIR|Kiribati|Kiribati
KP|PRK|North Korea|Nordkorea
KR|KOR|South Korea|Südkorea|Korea, Republic of|Republic of Korea
KW|KWT|Kuwait|Kuwait
KG|KGZ|Kyrgyzstan|Kirgisistan
LA|LAO|Laos|Laos|Lao People's Democratic Republic
LV|LVA|Latvia|Lettland
LB|LBN|Lebanon|Libanon
LS|LSO|Lesotho|Lesotho
LR|LBR|Liberia|Liberia
LY|LBY|Libya|Libyen
LI|LIE|Liechtenstein|Liechtenstein
LT|LTU|Lithuania|Litauen
LU|LUX|Luxembourg|Luxemburg
MO|MAC|Macao SAR China|Sonderverwaltungsregion Macau|Macao
MG|MDG|Madagascar|Madagaskar
MW|MWI|Malawi|Malawi
MY|MYS|Malaysia|Malaysia
MV|MDV|Maldives|Malediven
ML|MLI|Mali|Mali
MT|MLT|Malta|Malta
MH|MHL|Marshall Islands|Marshallinseln
MQ|MTQ|Martinique|Martinique
MR|MRT|Mauritania|Mauretanien
MU|MUS|Mauritius|Mauritius
YT|MYT|Mayotte|Mayotte
MX|MEX|Mexico|Mexiko
FM|FSM|Micronesia|Mikronesien|Micronesia, Federated States of
MD|MDA|Moldova|Republik Moldau|Moldova, Republic of|Moldawien
MC|MCO|Monaco|Monaco
MN|MNG|Mongolia|Mongolei
MS|MSR|Montserrat|Montserrat
MA|MAR|Morocco|Marokko
MZ|MOZ|Mozambique|Mosambik
MM|MMR|Myanmar (Burma)|Myanmar
NA|NAM|Namibia|Namibia
NR|NRU|Nauru|Nauru
NP|NPL|Nepal|Nepal
NL|NLD|Netherlands|Niederlande|The Netherlands|Netherlands (Kingdom of the)
NC|NCL|New Caledonia|Neukaledonien
NZ|NZL|New Zealand|Neuseeland
NI|NIC|Nicaragua|Nicaragua
NE|NER|Niger|Niger
NG|NGA|Nigeria|Nigeria
NU|NIU|Niue|Niue
NF|NFK|Norfolk Island|Norfolkinsel
MP|MNP|Northern Mariana Islands|Nördliche Marianen
MK|MKD|North Macedonia|Nordmazedonien|The Republic of North Macedonia
NO|NOR|Norway|Norwegen
OM|OMN|Oman|Oman
PK|PAK|Pakistan|Pakistan
PW|PLW|Palau|Palau
PS|PSE|Palestinian Territories|Palästinensische Autonomiegebiete|State of Palestine|Palestine|Staat Palästina
PA|PAN|Panama|Panama
PG|PNG|Papua New Guinea|Papua-Neuguinea
PY|PRY|Paraguay|Paraguay
PE|PER|Peru|Peru
PH|PHL|Philippines|Philippinen
PN|PCN|Pitcairn Islands|Pitcairninseln|Pitcairn
PL|POL|Poland|Polen
PT|PRT|Portugal|Portugal
PR|PRI|Puerto Rico|Puerto Rico
QA|QAT|Qatar|Katar
RE|REU|Réunion|Réunion|Reunion
RO|ROU|Romania|Rumänien
RU|RUS|Russia|Russland|Russian Federation|Russische Föderation
RW|RWA|Rwanda|Ruanda
SH|SHN|St. Helena|St. Helena|Saint Helena
KN|KNA|St. Kitts & Nevis|St. Kitts und Nevis|Saint Kitts and Nevis
LC|LCA|St. Lucia|St. Lucia|Saint Lucia
PM|SPM|St. Pierre & Miquelon|St. Pierre und Miquelon|Saint Pierre and Miquelon|Saint-Pierre und Miquelon
VC|VCT|St. Vincent & Grenadines|St. Vincent und die Grenadinen|Saint Vincent and the Grenadines
WS|WSM|Samoa|Samoa
SM|SMR|San Marino|San Marino
ST|STP|São Tomé & Príncipe|São Tomé und Príncipe|Sao Tome and Principe
SA|SAU|Saudi Arabia|Saudi-Arabien
SN|SEN|Senegal|Senegal
SC|SYC|Seychelles|Seychellen
SL|SLE|Sierra Leone|Sierra Leone
SG|SGP|Singapore|Singapur
SK|SVK|Slovakia|Slowakei
SI|SVN|Slovenia|Slowenien
SB|SLB|Solomon Islands|Salomonen
SO|SOM|Somalia|Somalia
ZA|ZAF|South Africa|Südafrika
GS|SGS|South Georgia & South Sandwich Islands|Südgeorgien und die Südlichen Sandwichinseln|South Georgia and the South Sandwich Islands
ES|ESP|Spain|Spanien
LK|LKA|Sri Lanka|Sri Lanka
SD|SDN|Sudan|Sudan
SR|SUR|Suriname|Suriname
SJ|SJM|Svalbard & Jan Mayen|Spitzbergen und Jan Mayen|Svalbard and Jan Mayen|Svalbard und Jan Mayen
SZ|SWZ|Eswatini|Eswatini
SE|SWE|Sweden|Schweden
CH|CHE|Switzerland|Schweiz
SY|SYR|Syria|Syrien|Syrian Arab Republic|Syrien, Arabische Republik
TW|TWN|Taiwan|Taiwan|Taiwan, Province of China
TJ|TJK|Tajikistan|Tadschikistan
TZ|TZA|Tanzania|Tansania|United Republic of Tanzania|Tansania, Vereinigte Republik
TH|THA|Thailand|Thailand
TL|TLS|Timor-Leste|Timor-Leste|Osttimor
TG|TGO|Togo|Togo
TK|TKL|Tokelau|Tokelau
TO|TON|Tonga|Tonga
TT|TTO|Trinidad & Tobago|Trinidad und Tobago|Trinidad and Tobago
TN|TUN|Tunisia|Tunesien
TR|TUR|Türkiye|Türkei|Turkey
TM|TKM|Turkmenistan|Turkmenistan
TC|TCA|Turks & Caicos Islands|Turks- und Caicosinseln|Turks and Caicos Islands
TV|TUV|Tuvalu|Tuvalu
UG|UGA|Uganda|Uganda
UA|UKR|Ukraine|Ukraine
AE|ARE|United Arab Emirates|Vereinigte Arabische Emirate|UAE
GB|GBR|United Kingdom|Vereinigtes Königreich|UK|Great Britain|Großbritannien
US|USA|United States|Vereinigte Staaten|United States of America|USA|U.S.A.|US|U.S.|Vereinigte Staaten von Amerika
UM|UMI|U.S. Outlying Islands|Amerikanische Überseeinseln|United States Minor Outlying Islands
UY|URY|Uruguay|Uruguay
UZ|UZB|Uzbekistan|Usbekistan
VU|VUT|Vanuatu|Vanuatu
VE|VEN|Venezuela|Venezuela
VN|VNM|Vietnam|Vietnam
VG|VGB|British Virgin Islands|Britische Jungferninseln|Virgin Islands, British
VI|VIR|U.S. Virgin Islands|Amerikanische Jungferninseln|Virgin Islands, U.S.
WF|WLF|Wallis & Futuna|Wallis und Futuna|Wallis and Futuna
EH|ESH|Western Sahara|Westsahara
YE|YEM|Yemen|Jemen
ZM|ZMB|Zambia|Sambia
ZW|ZWE|Zimbabwe|Simbabwe
AX|ALA|Åland Islands|Ålandinseln|Aland Islands|Åland
BQ|BES|Caribbean Netherlands|Karibische Niederlande|Bonaire, Sint Eustatius and Saba|Bonaire
CW|CUW|Curaçao|Curaçao
GG|GGY|Guernsey|Guernsey
IM|IMN|Isle of Man|Isle of Man|Insel Man
JE|JEY|Jersey|Jersey
ME|MNE|Montenegro|Montenegro
BL|BLM|St. Barthélemy|St. Barthélemy|Saint Barthélemy|Saint-Barthélemy
MF|MAF|St. Martin|St. Martin|Saint Martin (French part)|Saint-Martin
RS|SRB|Serbia|Serbien
SX|SXM|Sint Maarten|Sint Maarten|Sint Maarten (Dutch part)
SS|SSD|South Sudan|Südsudan
XK|XXK|Kosovo|Kosovo`;

export interface Land { code: string; iso3: string; en: string; de: string }

/** Zusaetzliche Schreibweisen, die in der Szene ueblich sind (Teile des Vereinigten Koenigreichs, Kurzformen). */
const DAZU: Record<string, string> = {
  england: 'GB', scotland: 'GB', schottland: 'GB', wales: 'GB', britain: 'GB', grossbritannien: 'GB', nordirland: 'GB', northernireland: 'GB',
  holland: 'NL', america: 'US', amerika: 'US', usa: 'US', unitedstates: 'US', korea: 'KR', turkey: 'TR', tuerkei: 'TR', turkei: 'TR', czech: 'CZ',
  bosnia: 'BA', bosnien: 'BA', uae: 'AE', emirates: 'AE', emirate: 'AE', vae: 'AE', ksa: 'SA', saudi: 'SA', russland: 'RU', macedonia: 'MK',
  mazedonien: 'MK', ivorycoast: 'CI', vatican: 'VA', vatikan: 'VA', kosova: 'XK', hongkong: 'HK', palestine: 'PS', palaestina: 'PS',
  weissrussland: 'BY', dominicanrepublic: 'DO', dominikanischerepublik: 'DO', southafrica: 'ZA', suedafrika: 'ZA', newzealand: 'NZ', neuseeland: 'NZ',
};
/** Zweistellige Kuerzel ausserhalb der Norm, die trotzdem vorkommen. */
const KURZ_DAZU: Record<string, string> = { UK: 'GB', EL: 'GR' };

export const LAENDER: Land[] = ROH.split('\n').map((z) => { const [code, iso3, en, de] = z.split('|'); return { code, iso3, en, de }; });
const NACH_CODE = new Map(LAENDER.map((l) => [l.code, l]));
const NACH_ISO3 = new Map(LAENDER.map((l) => [l.iso3, l]));

/** Vergleichbar machen: klein, ohne Akzente, ohne Leer- und Satzzeichen; "ü" zaehlt als "u" und als "ue". */
function formen(s: string): string[] {
  const klein = s.trim().toLowerCase().replace(/ß/g, 'ss').replace(/&/g, 'and');
  const ohne = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return [...new Set([ohne(klein), ohne(klein.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'))])].filter(Boolean);
}

const NACH_NAME = (() => {
  const m = new Map<string, string>();
  for (const z of ROH.split('\n')) {
    const [code, , ...namen] = z.split('|');
    for (const n of namen) for (const f of formen(n)) if (!m.has(f)) m.set(f, code);
  }
  for (const [k, v] of Object.entries(DAZU)) if (!m.has(k)) m.set(k, v);
  return m;
})();

/** Ein Land zu seinem zweistelligen Kuerzel - oder null, wenn es keins ist. */
export function landNach(code: string | null | undefined): Land | null {
  return NACH_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/**
 * Aus einer Eingabe das Land: Name (englisch/deutsch), ISO-2, ISO-3 oder Flaggen-Emoji, gross oder klein. null, wenn nichts eindeutig passt.
 *   "Deutschland" -> DE · "pl" -> PL · "DEU" -> DE · "🇩🇪" -> DE · "Narnia" -> null
 */
export function landAusEingabe(eingabe: string | null | undefined): Land | null {
  const roh = String(eingabe ?? '').trim();
  if (!roh) return null;
  const flagge = [...roh].filter((z) => /\p{Regional_Indicator}/u.test(z));
  if (flagge.length === 2) return landNach(flagge.map((z) => String.fromCharCode(z.codePointAt(0)! - 0x1f1a5)).join(''));
  const gross = roh.toUpperCase();
  if (/^[A-Z]{2}$/.test(gross)) return landNach(KURZ_DAZU[gross] ?? gross);
  if (/^[A-Z]{3}$/.test(gross) && NACH_ISO3.has(gross)) return NACH_ISO3.get(gross)!;
  for (const f of formen(roh)) { const c = NACH_NAME.get(f); if (c) return landNach(c); }
  return null;
}

/** Die Flagge als Emoji ("DE" -> "🇩🇪"). */
export function flaggeEmoji(code: string | null | undefined): string {
  const c = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((z) => 0x1f1a5 + z.charCodeAt(0)));
}
