export type Listener<T> = (val: T) => void;

export interface WebspeakEvent<T> {
    addListener(listener: Listener<T>): void;

    removeListener(listener: Listener<T>): boolean;
}

export namespace WebspeakEvent {
    export interface Invokable<T> extends WebspeakEvent<T> {
        invoke(value: T): void;
    }

    export function create<T>(): Invokable<T> {
        return new SimpleEvent<T>();
    }
}

class SimpleEvent<T> implements WebspeakEvent.Invokable<T> {
    private readonly listeners: Set<Listener<T>> = new Set<Listener<T>>();

    constructor() {}

    invoke(value: T): void {
        for (const entry of this.listeners) {
            entry(value);
        }
    }

    addListener(listener: Listener<T>): void {
        this.listeners.add(listener);
    }

    removeListener(listener: Listener<T>): boolean {
        return this.listeners.delete(listener);
    }
}