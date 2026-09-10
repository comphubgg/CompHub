import { redirect } from 'next/navigation';

/*
 * Die alte Adresse.
 *
 * Sie steht noch in aelteren Discord-Nachrichten und in Lesezeichen. Sie
 * fuehrt jetzt dorthin, wo sie hinfuehren sollte - zum VIP-Reiter und nicht
 * auf das E-Mail-Formular.
 */
export default function VIPLoginPage() {
  redirect('/anmelden/vip');
}
