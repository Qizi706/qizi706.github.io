#!/usr/bin/env python3
"""Run a deterministic RPC side-effect demo with Python 3.10+ and SQLite.

Each request runs in a fresh child process. os._exit injects process failure
before or after commit; the parent observes no reply and retries the same ID.
This models a lost response without implementing a network transport.
Temporary databases are deleted after the checks. No packages are required.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory

REQUEST = {"operation_id": "reserve-1", "block_group": "bg_1", "epoch": 7, "slots": 1}


def initialize(path):
    with sqlite3.connect(path) as db:
        db.executescript("""
            CREATE TABLE blocks (
                name TEXT PRIMARY KEY, epoch INTEGER NOT NULL,
                reserved INTEGER NOT NULL
            );
            INSERT INTO blocks VALUES ('bg_1', 7, 0);
            CREATE TABLE operations (
                id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT NOT NULL
            );
        """)


def serve(path, mode, request, fault):
    """Atomically reserve slots and save the original result in safe mode."""
    payload = json.dumps({k: request[k] for k in ("block_group", "epoch", "slots")}, sort_keys=True)
    with sqlite3.connect(path, timeout=10) as db:
        db.execute("PRAGMA synchronous = FULL")
        db.execute("BEGIN IMMEDIATE")
        if mode == "safe":
            previous = db.execute(
                "SELECT payload, result FROM operations WHERE id = ?",
                (request["operation_id"],),
            ).fetchone()
            if previous:
                if previous[0] != payload:
                    raise ValueError("operation_id reused with different parameters")
                return json.loads(previous[1])

        row = db.execute(
            "SELECT epoch, reserved FROM blocks WHERE name = ?",
            (request["block_group"],),
        ).fetchone()
        if row is None or row[0] != request["epoch"]:
            raise ValueError("stale epoch or unknown block")
        if type(request["slots"]) is not int or request["slots"] <= 0:
            raise ValueError("slots must be a positive integer")
        result = {"reserved": row[1] + request["slots"]}
        db.execute(
            "UPDATE blocks SET reserved = ? WHERE name = ?",
            (result["reserved"], request["block_group"]),
        )
        if fault == "before_commit":
            # Simulate abrupt process exit after the side-effect write,
            # before the result record and COMMIT. No Python cleanup runs.
            os._exit(70)
        if mode == "safe":
            db.execute(
                "INSERT INTO operations VALUES (?, ?, ?)",
                (request["operation_id"], payload, json.dumps(result)),
            )
        db.commit()
        if fault == "after_commit":
            # The database committed, but the caller receives no response.
            os._exit(71)
    return result


def call(path, mode, request=REQUEST, fault="none", expected_code=0):
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--request", str(path),
         mode, json.dumps(request), fault],
        capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == expected_code, (result.returncode, result.stderr)
    if expected_code in (70, 71):
        assert result.stdout == "", result.stdout
        return None
    return json.loads(result.stdout)


def reserved(path):
    with sqlite3.connect(path) as db:
        return db.execute("SELECT reserved FROM blocks WHERE name = 'bg_1'").fetchone()[0]


def main():
    with TemporaryDirectory(prefix="rpc-idempotency-") as workdir:
        paths = {name: Path(workdir)/f"{name}.sqlite" for name in ("unsafe", "safe", "rollback", "concurrent")}
        for path in paths.values():
            initialize(path)

        call(paths["unsafe"], "unsafe", fault="after_commit", expected_code=71)
        call(paths["unsafe"], "unsafe")
        assert reserved(paths["unsafe"]) == 2
        print("unsafe / response lost + retry: reserved=2 (duplicate effect)")

        call(paths["safe"], "safe", fault="after_commit", expected_code=71)
        assert call(paths["safe"], "safe") == {"reserved": 1}
        assert reserved(paths["safe"]) == 1
        print("safe / restart + same ID: reserved=1 (saved result replayed)")

        call(paths["rollback"], "safe", fault="before_commit", expected_code=70)
        assert reserved(paths["rollback"]) == 0
        assert call(paths["rollback"], "safe") == {"reserved": 1}
        print("safe / crash before commit: reserved=0; retry -> reserved=1")

        conflict = {**REQUEST, "slots": 2}
        error = call(paths["safe"], "safe", conflict, expected_code=2)
        assert error == {"error": "operation_id reused with different parameters"}
        assert reserved(paths["safe"]) == 1
        print("safe / same ID + changed parameters: rejected; reserved=1")

        stale = {**REQUEST, "operation_id": "reserve-2", "epoch": 6}
        error = call(paths["safe"], "safe", stale, expected_code=2)
        assert error == {"error": "stale epoch or unknown block"}
        assert reserved(paths["safe"]) == 1
        print("safe / new ID + stale epoch: rejected; reserved=1")

        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(lambda _: call(paths["concurrent"], "safe"), range(4)))
        assert replies == [{"reserved": 1}] * 4
        assert reserved(paths["concurrent"]) == 1
        print("safe / 4 concurrent retries: reserved=1")
        print("PASS: 6 failure/contract scenarios")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--request":
        try:
            reply = serve(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]), sys.argv[5])
        except ValueError as error:
            print(json.dumps({"error": str(error)}))
            sys.exit(2)
        print(json.dumps(reply))
    else:
        main()
