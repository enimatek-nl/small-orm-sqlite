# SmallORM SQLite

**S**i**m**ple **L**itt**l**e ORM for SQLite

Very small Object-relational mapper (bare essential) to quickly setup embedded database in SQLite Deno/Typescript/Web.

## Learn By Examples

```typescript
import {
  SmallSQLiteORM,
  SmallSQLiteTable,
} from "https://deno.land/x/smallorm_sqlite/mod.ts";

// extend SmallSQLiteTable on your model
// it will add an incremental id by default
export class User extends SmallSQLiteTable {
  userName = "";
  address = "";
  active = false;
  age = 18;
}

export class AnotherTable extends SmallSQLiteTable { }

const orm = new SmallSQLiteORM(
  "test.db", // Name of the db file
  [User, AnotherTable], // All models to Map
  { bool: false, int: 0, str: "" }  // DEFAULT values for all types
);

const user = new User();

user.address = "Denoland 12";
user.userName = "Joe Deno";
user.active = true;
orm.save(user);

console.log(user.id); // Joe now has an id of 1 in our DB

for (let i = 0; i < 5; i++) {
  orm.save(new User()); // Add some more users...
}

console.log(
  orm.count(User),
); // Shows 6 total users in the db

let i = 0;
for (const u of orm.findMany(User)) {
  u.age = 18 + (i++);
  orm.save(u); // Update the age of all our users
}

console.log(
  orm.countBy(User, "age > ?", [21]),
); // Only 2 users are now older than 21

const users = orm.findMany(User, "id > ?", [0], 1, 4); // Returns only 1 (LIMIT) user on OFFSET 4

orm.delete(users[0]); // Removed user row from the DB
```

## Extra Features
 - Automatically CREATE TABLE when database file is initialized
 - Automatically ALTER TABLE when model class is changed (only ADD COLUMN)