import { openDB } from 'idb';

const DB_NAME = 'roleplay-gen-db';
const STORE_NAME = 'sessions';

export interface SavedSession {
    id: string;
    timestamp: Date;
    input: string;
    language: string;
    sets: any[]; // GeneratedSet[]
    audioBlob: Blob | null;
    audioBlobSouth?: Blob | null;
    offsets?: number[];
    offsetsSouth?: number[];
    lastAccent?: 'north' | 'south';
}

export const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
};

export const saveSession = async (session: SavedSession) => {
    const db = await initDB();
    await db.put(STORE_NAME, session);
};

export const getSessions = async (): Promise<SavedSession[]> => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const deleteSession = async (id: string) => {
    const db = await initDB();
    await db.delete(STORE_NAME, id);
};
