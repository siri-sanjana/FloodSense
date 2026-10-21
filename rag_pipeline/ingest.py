"""Command-line entry point for synchronizing the knowledge-base index."""

import json

from .vector_store import DisasterProtocolVectorStore


def main():
    store = DisasterProtocolVectorStore()
    chunk_count = store.build_or_update_index()
    summary = store.status()
    summary["ingested_chunks"] = chunk_count
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
