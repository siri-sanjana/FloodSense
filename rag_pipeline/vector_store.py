"""Document ingestion, indexing, and hybrid retrieval for FloodSense RAG."""

import glob
import hashlib
import math
import os
import re
from collections import Counter

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_BASE_DIR = os.path.join(ROOT_DIR, "knowledge_base")
CHROMA_PERSIST_DIR = os.path.join(KNOWLEDGE_BASE_DIR, "chroma_db")
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
COLLECTION_NAME = "flood_disaster_protocols"
SUPPORTED_EXTENSIONS = (".md", ".txt")
HEADING_PATTERN = re.compile(r"^\s*\[([^\]]+)\]\s*(.*)$")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
DOCUMENT_ID_PATTERN = re.compile(r"^Document ID:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
AUTHORITY_PATTERN = re.compile(r"^Authority:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


class DisasterProtocolVectorStore:
    """Maintain a file-synchronized local index and retrieve with lexical/vector fusion."""

    def __init__(self, persist_dir=CHROMA_PERSIST_DIR, model_name=EMBEDDING_MODEL_NAME, use_tfidf=None):
        self.persist_dir = persist_dir
        self.model_name = model_name
        self.embedder = None
        self.collection = None
        self.client = None
        self.fallback_reason = None
        env_lexical_only = os.environ.get("RENDER") is not None or os.environ.get("USE_TFIDF_RAG", "0") == "1"
        self.use_tfidf = env_lexical_only if use_tfidf is None else use_tfidf
        self.fallback_chunks = []
        self.fallback_df = Counter()
        self.fallback_vectors = []
        self.document_metadata = {}

        if not self.use_tfidf:
            try:
                import chromadb
                from sentence_transformers import SentenceTransformer

                os.makedirs(self.persist_dir, exist_ok=True)
                self.embedder = SentenceTransformer(model_name)
                self.client = chromadb.PersistentClient(path=self.persist_dir)
                self.collection = self.client.get_or_create_collection(
                    name=COLLECTION_NAME,
                    metadata={"hnsw:space": "cosine"},
                )
            except Exception as error:
                self.fallback_reason = f"{type(error).__name__}: {error}"
                print(f"[VectorStore] Embedding/vector backend unavailable; using TF-IDF ({self.fallback_reason})")
                self.use_tfidf = True

        self._load_local_documents(KNOWLEDGE_BASE_DIR)

    @staticmethod
    def _file_paths(kb_dir):
        paths = []
        for extension in SUPPORTED_EXTENSIONS:
            paths.extend(glob.glob(os.path.join(kb_dir, f"*{extension}")))
        return sorted(path for path in paths if os.path.isfile(path))

    @staticmethod
    def _read_document(file_path):
        with open(file_path, "r", encoding="utf-8") as document_file:
            content = document_file.read()
        if not content.strip():
            return ""
        return content

    def _load_local_documents(self, kb_dir):
        """Load source files and rebuild the dependency-free lexical index."""
        self.fallback_chunks = []
        self.document_metadata = {}
        for file_path in self._file_paths(kb_dir):
            filename = os.path.basename(file_path)
            content = self._read_document(file_path)
            if not content:
                continue
            doc_match = DOCUMENT_ID_PATTERN.search(content)
            authority_match = AUTHORITY_PATTERN.search(content)
            document_id = doc_match.group(1).strip() if doc_match else os.path.splitext(filename)[0]
            authority = authority_match.group(1).strip() if authority_match else "Unspecified"
            self.document_metadata[filename] = {
                "document_id": document_id,
                "authority": authority,
                "title": next((line.strip().lstrip("# ").strip() for line in content.splitlines() if line.strip()), filename),
            }
            self.fallback_chunks.extend(self.chunk_document(content, source_doc=filename))
        self._build_lexical_index()

    def _build_lexical_index(self):
        document_count = len(self.fallback_chunks)
        document_tokens = []
        self.fallback_df = Counter()
        for chunk in self.fallback_chunks:
            tokens = Counter(TOKEN_PATTERN.findall(chunk["text"].lower()))
            document_tokens.append(tokens)
            self.fallback_df.update(tokens.keys())

        self.fallback_vectors = []
        for tokens in document_tokens:
            weights = {
                token: (1 + math.log(count)) * (math.log((document_count + 1) / (self.fallback_df[token] + 1)) + 1)
                for token, count in tokens.items()
            }
            norm = math.sqrt(sum(weight * weight for weight in weights.values()))
            self.fallback_vectors.append(
                {token: weight / norm for token, weight in weights.items()} if norm else {}
            )

    def chunk_document(self, text, source_doc, chunk_size=700, overlap=100):
        """Split on headings and paragraph boundaries while retaining source sections."""
        if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
            raise ValueError("chunk_size must be positive and overlap must be smaller than chunk_size.")

        chunks = []
        current_section = "GENERAL"
        current_parts = []
        current_length = 0

        def flush():
            nonlocal current_parts, current_length
            content = "\n".join(current_parts).strip()
            if content:
                metadata = self.document_metadata.get(source_doc, {})
                digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
                chunks.append({
                    "text": content,
                    "source": source_doc,
                    "section": current_section,
                    "document_id": metadata.get("document_id", os.path.splitext(source_doc)[0]),
                    "authority": metadata.get("authority", "Unspecified"),
                    "title": metadata.get("title", source_doc),
                    "content_hash": digest,
                    "chunk_index": len(chunks),
                })
            current_parts = []
            current_length = 0

        for paragraph in re.split(r"\n\s*\n", text):
            lines = [line.strip() for line in paragraph.splitlines() if line.strip()]
            if not lines:
                continue
            heading = HEADING_PATTERN.match(lines[0])
            if heading:
                flush()
                current_section = heading.group(1).strip()
                lines = ([heading.group(2).strip()] if heading.group(2).strip() else []) + lines[1:]
                if not lines:
                    continue
            paragraph_text = "\n".join(lines)
            if current_length and current_length + len(paragraph_text) + 1 > chunk_size:
                previous_text = "\n".join(current_parts)
                flush()
                if overlap:
                    carry = previous_text[-overlap:].strip()
                    if carry:
                        current_parts = [carry]
                        current_length = len(carry)
            while len(paragraph_text) > chunk_size:
                if current_parts:
                    flush()
                chunks.append({
                    "text": paragraph_text[:chunk_size],
                    "source": source_doc,
                    "section": current_section,
                    "document_id": self.document_metadata.get(source_doc, {}).get("document_id", os.path.splitext(source_doc)[0]),
                    "authority": self.document_metadata.get(source_doc, {}).get("authority", "Unspecified"),
                    "title": self.document_metadata.get(source_doc, {}).get("title", source_doc),
                    "content_hash": hashlib.sha256(paragraph_text[:chunk_size].encode("utf-8")).hexdigest(),
                    "chunk_index": len(chunks),
                })
                paragraph_text = paragraph_text[chunk_size - overlap:]
            if current_length and current_length + len(paragraph_text) + 1 > chunk_size:
                flush()
            current_parts.append(paragraph_text)
            current_length += len(paragraph_text) + 1

        flush()
        return chunks

    @staticmethod
    def _chunk_id(chunk):
        identity = f"{chunk['source']}\0{chunk['section']}\0{chunk['content_hash']}"
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()

    @staticmethod
    def _chunk_metadata(chunk):
        return {
            "source": chunk["source"],
            "section": chunk["section"],
            "document_id": chunk["document_id"],
            "authority": chunk["authority"],
            "title": chunk["title"],
            "content_hash": chunk["content_hash"],
            "chunk_index": chunk["chunk_index"],
        }

    def build_or_update_index(self, kb_dir=KNOWLEDGE_BASE_DIR):
        """Synchronize Chroma with current source files and return the indexed chunk count."""
        self._load_local_documents(kb_dir)
        if self.collection is None or self.embedder is None:
            return len(self.fallback_chunks)

        chunks = self.fallback_chunks
        desired_ids = [self._chunk_id(chunk) for chunk in chunks]
        desired_id_set = set(desired_ids)
        existing = self.collection.get(include=["metadatas"])
        existing_ids = existing.get("ids", [])
        stale_ids = [chunk_id for chunk_id in existing_ids if chunk_id not in desired_id_set]
        if stale_ids:
            self.collection.delete(ids=stale_ids)
        if chunks:
            embeddings = self.embedder.encode(
                [chunk["text"] for chunk in chunks],
                convert_to_numpy=True,
                show_progress_bar=False,
            ).tolist()
            self.collection.upsert(
                ids=desired_ids,
                documents=[chunk["text"] for chunk in chunks],
                embeddings=embeddings,
                metadatas=[self._chunk_metadata(chunk) for chunk in chunks],
            )
        return len(chunks)

    def _lexical_query(self, query_text, top_k):
        query_counts = Counter(TOKEN_PATTERN.findall(query_text.lower()))
        if not query_counts or not self.fallback_chunks:
            return []
        document_count = len(self.fallback_chunks)
        query_weights = {
            token: (1 + math.log(count)) * (math.log((document_count + 1) / (self.fallback_df[token] + 1)) + 1)
            for token, count in query_counts.items()
            if self.fallback_df[token]
        }
        query_norm = math.sqrt(sum(weight * weight for weight in query_weights.values()))
        if not query_norm:
            return []
        query_weights = {token: weight / query_norm for token, weight in query_weights.items()}

        scored = []
        for index, vector in enumerate(self.fallback_vectors):
            score = sum(weight * vector.get(token, 0.0) for token, weight in query_weights.items())
            if score > 0:
                scored.append((score, self.fallback_chunks[index]))
        scored.sort(key=lambda item: item[0], reverse=True)
        results = []
        for score, chunk in scored[:top_k]:
            results.append(self._format_result(chunk, score, lexical_score=score))
        return results

    @staticmethod
    def _format_result(chunk, score, lexical_score=None, semantic_score=None):
        result = {
            "content": chunk["text"],
            "source_doc": chunk.get("source", "Unknown"),
            "document_id": chunk.get("document_id", os.path.splitext(chunk.get("source", "Unknown"))[0]),
            "title": chunk.get("title", chunk.get("source", "Unknown")),
            "authority": chunk.get("authority", "Unspecified"),
            "section": chunk.get("section", "GENERAL"),
            "chunk_index": chunk.get("chunk_index", 0),
            "content_hash": chunk.get("content_hash", hashlib.sha256(chunk["text"].encode("utf-8")).hexdigest()),
            "similarity_score": round(float(score), 4),
        }
        if lexical_score is not None:
            result["lexical_score"] = round(float(lexical_score), 4)
        if semantic_score is not None:
            result["semantic_score"] = round(float(semantic_score), 4)
        return result

    def query(self, query_text, top_k=4):
        """Return hybrid-ranked matches; scores are similarity values, not probabilities."""
        if not isinstance(query_text, str) or not query_text.strip():
            raise ValueError("query_text must be a non-empty string.")
        if not isinstance(top_k, int) or isinstance(top_k, bool) or not 1 <= top_k <= 50:
            raise ValueError("top_k must be an integer between 1 and 50.")

        lexical_results = self._lexical_query(query_text, top_k=max(top_k * 4, 20))
        if self.collection is None or self.embedder is None:
            return lexical_results[:top_k]
        collection_count = self.collection.count()
        if collection_count == 0:
            return lexical_results[:top_k]

        semantic_results = []
        query_embedding = self.embedder.encode([query_text], convert_to_numpy=True).tolist()
        candidates = self.collection.query(
            query_embeddings=query_embedding,
            n_results=min(max(top_k * 4, 20), collection_count),
            include=["documents", "metadatas", "distances"],
        )
        documents = (candidates.get("documents") or [[]])[0]
        metadatas = (candidates.get("metadatas") or [[]])[0]
        distances = (candidates.get("distances") or [[]])[0]
        for document, metadata, distance in zip(documents, metadatas, distances):
            similarity = max(-1.0, min(1.0, 1.0 - float(distance)))
            semantic_results.append({
                "content": document,
                "source_doc": metadata.get("source", "Unknown"),
                "document_id": metadata.get("document_id", os.path.splitext(metadata.get("source", "Unknown"))[0]),
                "title": metadata.get("title", metadata.get("source", "Unknown")),
                "authority": metadata.get("authority", "Unspecified"),
                "section": metadata.get("section", "GENERAL"),
                "chunk_index": metadata.get("chunk_index", 0),
                "content_hash": metadata.get("content_hash", hashlib.sha256(document.encode("utf-8")).hexdigest()),
                "similarity_score": round(similarity, 4),
                "semantic_score": round(similarity, 4),
            })

        ranked = {}
        for rank, result in enumerate(semantic_results, start=1):
            key = (result["source_doc"], result["section"], result["content_hash"])
            ranked[key] = (1 / (60 + rank), result)
        for rank, result in enumerate(lexical_results, start=1):
            key = (result["source_doc"], result["section"], result["content_hash"])
            score = 1 / (60 + rank)
            if key in ranked:
                rrf, previous = ranked[key]
                previous["lexical_score"] = result["lexical_score"]
                ranked[key] = (rrf + score, previous)
            else:
                result["lexical_score"] = result["similarity_score"]
                ranked[key] = (score, result)

        combined = sorted(ranked.values(), key=lambda item: item[0], reverse=True)
        results = []
        for rank_score, result in combined[:top_k]:
            result["retrieval_score"] = round(rank_score, 6)
            results.append(result)
        return results

    def status(self):
        """Return index/configuration facts without exposing document text."""
        indexed_chunks = len(self.fallback_chunks)
        if self.collection is not None:
            indexed_chunks = self.collection.count()
        return {
            "backend": "tfidf" if self.collection is None else "chroma+sentence-transformers",
            "indexed_chunks": indexed_chunks,
            "source_documents": [
                {"filename": filename, **metadata}
                for filename, metadata in sorted(self.document_metadata.items())
            ],
            "fallback_reason": self.fallback_reason,
        }


if __name__ == "__main__":
    store = DisasterProtocolVectorStore()
    count = store.build_or_update_index()
    print(f"Index synchronized: {count} chunks from {len(store.document_metadata)} documents.")
    for result in store.query(
        "What should responders do when buildings and roads are flooded?",
        top_k=3,
    ):
        print(f"{result['source_doc']} / {result['section']} ({result['similarity_score']}):")
        print(result["content"][:180], "\n")
