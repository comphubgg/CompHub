import { createContext, useContext } from 'react';

/* Was ein portiertes Werkzeug vom Admin-Rahmen des Hubs braucht: den Weg zur echten Seite ("Classic view") und die Gruppe fuer die kleine Zeile. */
export interface Werkzeugrahmen { klassisch?: () => void; gruppe?: string }
export const Rahmenkontext = createContext<Werkzeugrahmen>({});
export const useRahmen = () => useContext(Rahmenkontext);
