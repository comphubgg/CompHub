import type { ComponentType } from 'react';
import { Rahmenkontext } from './kontext';

/*
 * Ein Werkzeug der echten Seite, im Hub gebaut: derselbe Code wie auf main (alle Funktionen bleiben), im Glas-Stil, mit dem Kopf der Admin-Werkzeuge
 * und "Classic view". Die Gruppe steht in der kleinen Zeile ueber dem Titel.
 */
export function portiert(Seite: ComponentType, gruppe: string): ComponentType<{ klassisch: () => void }> {
  return function Werkzeug({ klassisch }) {
    return <Rahmenkontext.Provider value={{ klassisch, gruppe }}><Seite /></Rahmenkontext.Provider>;
  };
}
