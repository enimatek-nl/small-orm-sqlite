# Small ORM SQLite

[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https/raw.githubusercontent.com/cybertim/SmallSQLiteORM/main/mod.ts)

Very small Object-relational mapper (bare essential) to quickly setup embedded database in SQLite Deno/Typescript/Web.

## Learn By Examples

```typescript
import { SSQL, SSQLTable } from "./lib/SmallSQLite.ts";

export class User extends SSQLTable {
    userName = "";
    address = "";
    active = false;
    age = 0;
}

export class Log extends SSQLTable {
    userId = -1;
    insertDate = new Date().getDate();
    description = "";
    status = 0;
}

const orm = new SSQL("test.db", [User, Log]);

const user = new User();

user.address = "Denoland 12";
user.userName = "Joe Deno";
user.active = true; // Make Joe active
orm.save(user);

console.log(user.id); // Joe now has an id of 1 in our DB

// Add 5 total some Logs
for (let i = 0; i < 5; i++) {
    const log = new Log();
    log.userId = user.id;
    log.description = "log " + i;
    log.status = 1;
    orm.save(log);
}

console.log("5 logs total: " + orm.count(Log));

// Update only 2 logs with status 2 in the db
for (const log of orm.findMany(Log, { limit: 2 })) {
    log.status = 2;
    orm.save(log);
}

console.log(
    "Count only 2 logs with status > 1: " +
    orm.countBy(Log, { where: { clause: "status > ?", values: [1] } })
);

const orderedLogs = orm.findMany(Log, {
    where: { clause: "status < ?", values: [2] },
    order: { by: "id", desc: true }
})

for (const l of orderedLogs) console.log("ordered desc: " + l.id + " " + l.status);

const logs = orm.findMany(Log, { offset: 4, limit: 1 }); // Returns only 1 result on offset 4

const logUser = orm.findOne(User, logs[0].userId); // quickly retrieve the user of the log

orm.delete(logs[0]); // Removed from the DB

console.log("only 4 logs left: " + orm.count(Log));
```

## Breaking changes 0.1.5 -> 0.2.0
* Classnames have been renamed eg. `SmallSQLiteORM` changed into `SSQL`.
* All methodcalls use the `SSQLQuery` object instead with more options.

## Documentation
View it online at [doc.deno.land](https://doc.deno.land/https/raw.githubusercontent.com/cybertim/SmallSQLiteORM/main/mod.ts)

## Extra Features
 - Automatically CREATE TABLE when database file is initialized
 - Automatically ALTER TABLE when model class is changed (only ADD COLUMN)
