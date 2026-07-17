"""
One-shot wrapper: patches the migration script to import from /app (the
container's working dir) and to point at the in-network Elasticsearch host,
then executes it. Safe to delete after the algorithm scorer is repopulated.
"""
import sys

# Make sibling modules importable
sys.path.insert(0, "/app")

# Read, patch in-memory, and exec the original migration script
with open("/app/migrate_algorithms_to_es.py", "r", encoding="utf-8") as f:
    src = f.read()

# Point at the in-network elasticsearch
src = src.replace("http://localhost:9201", "http://elasticsearch:9200")

# Strip path inserts that point at non-existent host directories.
src = src.replace(
    "sys.path.insert(0, os.path.join(project_root, 'repo_scanner'))",
    "# patched: /app is already on sys.path",
)
src = src.replace(
    "sys.path.insert(0, os.path.join(project_root, 'universal-scoring-service', 'core'))",
    "# patched: /app is already on sys.path",
)

exec(compile(src, "/app/migrate_algorithms_to_es.py", "exec"),
     {"__name__": "__main__", "__file__": "/app/migrate_algorithms_to_es.py"})
