// Minimale Typen fuer @xmpp/client (die Bibliothek bringt keine mit) - genutzt in lib/epicFreundeStatus.ts.
declare module '@xmpp/client' {
  export function client(opt: { service: string; domain: string; resource?: string; username?: string; password?: string }): {
    on(ereignis: string, f: (...a: any[]) => void): void;
    send(el: unknown): Promise<void>;
    start(): Promise<unknown>;
    stop(): Promise<void>;
  };
  export function xml(name: string, attrs?: Record<string, string>, ...kinder: unknown[]): unknown;
}
