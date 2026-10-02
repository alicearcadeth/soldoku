import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
schema = (root / "schema.sql").read_text(encoding="utf-8")
db_path = root / "output" / "d1-rehearsal.sqlite"
db_path.parent.mkdir(exist_ok=True)
if db_path.exists():
    db_path.unlink()

def tables(connection):
    return [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

connection = sqlite3.connect(db_path)
connection.executescript(schema)
first = tables(connection)
connection.executescript(schema)
second = tables(connection)
counts = {
    name: connection.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    for name in second
    if name != "sqlite_sequence"
}
connection.close()
print({"first": first, "second": second, "same": first == second, "counts": counts})
