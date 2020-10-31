import { DB } from "https://deno.land/x/sqlite/mod.ts";


/**
 * All your model classes should extend this class.
 * @export
 * @class SmallSQLiteTable
 */
export class SmallSQLiteTable {
    id = -1;
}


/**
 * Interface for the DEFAULT Column values
 * @export
 * @interface SmallSQLiteDefaults
 */
export interface SmallSQLiteDefaults {
    bool: boolean, str: string, int: number
}


/**
 * ORM Wrapper to interact with deno.land/x/sqlite using your {@link SmallSQLiteTable}
 * @export
 * @class SmallSQLiteORM
 */
export class SmallSQLiteORM {
    public db: DB;
    private defaults: SmallSQLiteDefaults;

    /**
     * Create an instance of SmallSQLiteORM
     * @param dbName the name of the database file on disk used by sqlite
     * @param entities array of all models extending {@link SmallSQLiteDefaults}
     * @param defaults optional configuration to override DEFAULT vaules of columns by type
     */
    constructor(dbName: string, entities: (new () => SmallSQLiteTable)[], defaults?: SmallSQLiteDefaults) {
        this.db = new DB(dbName);
        defaults ? this.defaults = defaults : this.defaults = {
            bool: false,
            int: -1,
            str: ""
        };
        for (const entity of entities) {
            const obj = new entity();
            this.createTable(obj); // create the table if it is not yet there
            const names = Object.getOwnPropertyNames(obj);
            // retrieve a list of all columns known in the sqlite db
            const data: string[] = [];
            for (
                const [loc, col] of this.db.query("PRAGMA table_info(" + obj.constructor.name.toLowerCase() + ");")
            ) {
                data.push(col);
            }
            // check if there are new properties in the model compared to the table in sqlite
            const n = names.filter((item) => !data.includes(item));
            if (n.length > 0) this.alterTable(obj, n);
        }
    }

    private columnInfo<T extends SmallSQLiteTable>(table: T, column: string) {
        const v = Object.getOwnPropertyDescriptor(table, column);
        if (column === "id") {
            return "integer PRIMARY KEY AUTOINCREMENT NOT NULL";
        } else if (typeof v?.value === "boolean") {
            return "boolean NOT NULL DEFAULT " + this.defaults.bool;
        } else if (typeof v?.value === "string") {
            return 'varchar DEFAULT "' + this.defaults.str + '"';
        } else if (typeof v?.value === "number") {
            return "integer NOT NULL DEFAULT " + this.defaults.int;
        }
        return undefined;
    }

    private alterTable<T extends SmallSQLiteTable>(table: T, columns: string[]) {
        for (const column of columns) {
            const statement = 'ALTER TABLE "' + table.constructor.name.toLowerCase() +
                '\" ADD COLUMN ' + column + " " +
                this.columnInfo<SmallSQLiteTable>(table, column);
            this.db.query(statement);
        }
    }

    private createTable<T extends SmallSQLiteTable>(table: T) {
        const names = Object.getOwnPropertyNames(table);
        let statement = 'CREATE TABLE IF NOT EXISTS "' + table.constructor.name.toLowerCase() + '" (';
        for (const p of names) {
            if (!statement.endsWith("(")) statement += ", ";
            statement += '"' + p + '" ' + this.columnInfo<SmallSQLiteTable>(table, p);
        }
        statement += ")";
        this.db.query(statement);
    }

    private insertRecord<T extends SmallSQLiteTable>(table: T) {
        const names = Object.getOwnPropertyNames(table);
        names.splice(0, 1);
        const statement = 'INSERT INTO "' +
            table.constructor.name.toLowerCase() +
            '" (' + names.join(", ") + ") VALUES (" +
            (new Array(names.length).fill("?")).join(", ") + ")";
        const data = [];
        for (const p of names) {
            const v = Object.getOwnPropertyDescriptor(table, p);
            data.push(v?.value);
        }
        this.db.query(statement, data);
        table.id = this.db.lastInsertRowId;
    }

    private updateRecord<T extends SmallSQLiteTable>(table: T) {
        const names = Object.getOwnPropertyNames(table);
        names.splice(0, 1);
        let statement = 'UPDATE "' + table.constructor.name.toLowerCase() + '" SET ';
        const data = [];
        for (const p of names) {
            const v = Object.getOwnPropertyDescriptor(table, p);
            if (!statement.endsWith("SET ")) statement += ", ";
            statement += p + " = ?";
            data.push(v?.value);
        }
        statement += " WHERE id = ?";
        data.push(table.id);
        this.db.query(statement, data);
    }

    private find<T extends SmallSQLiteTable>(
        table: (new () => T), whereClause?: string, valueClause?: (boolean | string | number)[],
        limit?: number, offset?: number, countOnly?: boolean): { count: number; objects: T[] } {
        let select = "*";
        if (countOnly) select = "COUNT(*) AS total";
        const obj = new table();
        const rows = this.db.query(
            "SELECT " + select + ' FROM "' + obj.constructor.name + '"' +
            (whereClause ? (" WHERE " + whereClause) : "") +
            (limit ? " LIMIT " + limit : "") +
            (offset ? " OFFSET " + offset : ""),
            valueClause
        );
        if (!countOnly) {
            const names = rows.columns()
                .map((item) => item.name);
            const list: T[] = [];
            for (const row of rows) {
                const nobj = new table();
                for (let i = 0; i < names.length; i++) {
                    Object.defineProperty(nobj, names[i], { value: row[i] });
                }
                list.push(<T>nobj);
            }
            return { count: list.length, objects: list };
        } else {
            return { count: <number>rows.next().value[0], objects: [] };
        }
    }

    /**
     * DELETE the obj from the SQLite database
     * @param obj model based on {@link SmallSQLiteTable} 
     */
    public delete<T extends SmallSQLiteTable>(obj: T) {
        this.db.query('DELETE FROM "' + obj.constructor.name + '" WHERE id = ?', [obj.id]);
    }

    /**
     * INSERT or UPDATE the obj based on the id (INSERT when -1 else UPDATE)
     * @param obj model based on {@link SmallSQLiteTable} 
     */
    public save<T extends SmallSQLiteTable>(obj: T) {
        if (obj.id === -1) this.insertRecord(obj);
        else this.updateRecord(obj);
    }

    /**
     * SELECT * FROM table and return model WHERE id equals given id
     * @param table 
     * @param id id to match with {@link SmallSQLiteTable} 
     */
    public findOne<T extends SmallSQLiteTable>(table: (new () => T), id: number) {
        return this.find(table, "id = ?", [id]).objects[0];
    }

    /**
     * SELECT * FROM table and return all models matching the given parameters
     * @param table 
     * @param whereClause undefined to skip else it will be added to a WHERE clause
     * @param valueClause values to fill the ? in the whereClause
     * @param limit used in LIMIT
     * @param offset used in OFFSET
     */
    public findMany<T extends SmallSQLiteTable>(table: (new () => T), whereClause?: string, valueClause?: (boolean | string | number)[],
        limit?: number, offset?: number) {
        return this.find(table, whereClause, valueClause, limit, offset).objects;
    }

    /**
     * COUNT(*) on all records in the table given
     * @param table 
     */
    public count<T extends SmallSQLiteTable>(table: (new () => T)) {
        return this.find(table, undefined, [], 0, 0, true).count;
    }

    /**
     * COUNT(*) on all records in the table given matching the whereClause
     * @param table 
     * @param whereClause undefined to skip else it will be added to a WHERE clause
     * @param valueClause values to fill the ? in the whereClause
     */
    public countBy<T extends SmallSQLiteTable>(table: (new () => T), whereClause?: string, valueClause?: (boolean | string | number)[]) {
        return this.find(table, whereClause, valueClause, 0, 0, true).count;
    }
}
