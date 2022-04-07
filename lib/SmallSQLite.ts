import { DB } from "https://deno.land/x/sqlite@v2.5.0/mod.ts";

/**
 * All your model classes should extend this class
 * It includes the incremental 'id' by default
 * ```ts
 * class User extends SSQLTable {
 *     username = "";
 *     age = 18;
 *     active = false;
 * }
 * ```
 * @export
 * @class SSQLTable
 */
export class SSQLTable {
    id = -1;
}

/**
 * Interface used to override the DEFAULT column type values
 * @export
 * @interface SSQLDefaults
 */
export interface SSQLDefaults {
    bool: boolean;
    str: string;
    int: number;
}

/**
 * Interface used for queries
 */
export interface SSQLQuery {
    where?: {
        clause: string;
        values: (boolean | string | number)[]
    },
    order?: {
        by: string;
        desc?: boolean;
    },
    limit?: number,
    offset?: number
}

/**
 * ORM Wrapper to interact with deno.land/x/sqlite using your `SSQLTable`
 * @export
 * @class SSQL
 */
export class SSQL {
    public db: DB;
    private defaults: SSQLDefaults;

    /**
     * Create an instance of SSQL
     * ```ts
     * const orm = new SSQL("test.db", [User]);
     * ```
     * @param dbName the name of the database file on disk used by sqlite
     * @param entities array of all models extending `SSQLTable`
     * @param defaults optional configuration to override DEFAULT vaules of columns by type
     */
    constructor(dbName: string, entities: (new () => SSQLTable)[], defaults?: SSQLDefaults) {
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

    private columnInfo<T extends SSQLTable>(table: T, column: string) {
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

    private alterTable<T extends SSQLTable>(table: T, columns: string[]) {
        for (const column of columns) {
            const statement = 'ALTER TABLE "' + table.constructor.name.toLowerCase() +
                '\" ADD COLUMN ' + column + " " +
                this.columnInfo<SSQLTable>(table, column);
            this.db.query(statement);
        }
    }

    private createTable<T extends SSQLTable>(table: T) {
        const names = Object.getOwnPropertyNames(table);
        let statement = 'CREATE TABLE IF NOT EXISTS "' + table.constructor.name.toLowerCase() + '" (';
        for (const p of names) {
            if (!statement.endsWith("(")) statement += ", ";
            statement += '"' + p + '" ' + this.columnInfo<SSQLTable>(table, p);
        }
        statement += ")";
        this.db.query(statement);
    }

    private insertRecord<T extends SSQLTable>(table: T) {
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

    private updateRecord<T extends SSQLTable>(table: T) {
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

    private find<T extends SSQLTable>(
        table: (new () => T), query: SSQLQuery, countOnly?: boolean): { count: number; objects: T[] } {
        let select = "*";
        if (countOnly) select = "COUNT(*) AS total";
        const obj = new table();
        const rows = this.db.query(
            "SELECT " + select + ' FROM "' + obj.constructor.name + '"' +
            (query.where ? (" WHERE " + query.where.clause) : "") +
            (query.order ? (" ORDER BY " + query.order.by + (query.order.desc ? " DESC " : " ASC ")) : "") +
            (query.limit ? " LIMIT " + query.limit : "") +
            (query.offset ? " OFFSET " + query.offset : ""),
            (query.where ? query.where.values : [])
        );
        if (!countOnly) {
            const list: T[] = [];
            let names: string[] = [];
            try { names = rows.columns().map((item) => item.name); } catch (e) {
                return { count: 0, objects: list };
            }
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
     * @param obj model based on `SSQLTable`
     */
    public delete<T extends SSQLTable>(obj: T) {
        this.db.query('DELETE FROM "' + obj.constructor.name + '" WHERE id = ?', [obj.id]);
    }

    /**
     * INSERT or UPDATE the obj based on the id (INSERT when -1 else UPDATE)
     * @param obj model based on `SSQLTable`
     */
    public save<T extends SSQLTable>(obj: T) {
        if (obj.id === -1) this.insertRecord(obj);
        else this.updateRecord(obj);
    }

    /**
     * SELECT * FROM table and return model WHERE id equals given id
     * ```ts
     * const user = orm.findOne(User, 1);
     * ```
     * @param table 
     * @param id id to match with `SSQLTable`
     */
    public findOne<T extends SSQLTable>(table: (new () => T), id: number) {
        return this.find(table, { where: { clause: "id = ?", values: [id] } }).objects[0];
    }

    /**
     * ```ts
     * const users = orm.findMany(User, { where: { clause: "username = ?", values: [username] }});
     * ```
     * @param table 
     * @param query 
     */
    public findMany<T extends SSQLTable>(table: (new () => T), query: SSQLQuery) {
        return this.find(table, query).objects;
    }

    /**
     * COUNT(*) on all records in the table given
     * @param table 
     */
    public count<T extends SSQLTable>(table: (new () => T)) {
        return this.find(table, {}, true).count;
    }

    /**
     * COUNT(*) on all records in the table given matching the `SSQLQuery` query object
     * @param table 
     * @param query 
     */
    public countBy<T extends SSQLTable>(table: (new () => T), query: SSQLQuery) {
        return this.find(table, query, true).count;
    }
}
