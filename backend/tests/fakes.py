"""Tiny in-memory stand-in for the supabase-py table builder (select / eq / neq / limit / insert / delete)."""

from types import SimpleNamespace
from uuid import uuid4


class FakeDB:
    def __init__(self, **tables: list[dict]) -> None:
        self.tables = {name: list(rows) for name, rows in tables.items()}

    def table(self, name: str) -> "_Query":
        return _Query(self, name)


class _Query:
    def __init__(self, db: FakeDB, name: str) -> None:
        self.db, self.name = db, name
        self.filters: list = []
        self.op = "select"
        self.payload: dict | None = None
        self.max_rows: int | None = None

    def select(self, *_a):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self.filters.append(lambda r: r.get(col) != val)
        return self

    def limit(self, n):
        self.max_rows = n
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def delete(self):
        self.op = "delete"
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == "insert":
            row = {"id": str(uuid4()), **self.payload}
            rows.append(row)
            return SimpleNamespace(data=[row])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "delete":
            self.db.tables[self.name] = [r for r in rows if r not in hit]
            return SimpleNamespace(data=hit)
        return SimpleNamespace(data=hit[: self.max_rows] if self.max_rows else hit)
