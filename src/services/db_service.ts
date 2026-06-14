import db from '../db/sqlite.ts';
import { v4 as uuidv4 } from 'uuid'; // need to install uuid

export function addTarget(name: string): string {
    const id = uuidv4();
    const stmt = db.prepare('INSERT INTO targets (id, name) VALUES (?, ?)');
    stmt.run(id, name);
    return id;
}

export function getAllTargets() {
    const stmt = db.prepare('SELECT * FROM targets ORDER BY created_at DESC');
    return stmt.all();
}

// ... other db operations
