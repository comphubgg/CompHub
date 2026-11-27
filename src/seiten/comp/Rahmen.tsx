import { Outlet } from 'react-router-dom';
import Schale from '../../ds/Schale';

/** Rahmen aller Competitive-Seiten: die Schale des Design-Systems (Kopf, eine Leiste mit allen Seiten, Inhalt). */
export default function Rahmen() {
  return <Schale bereich="competitive"><Outlet /></Schale>;
}
