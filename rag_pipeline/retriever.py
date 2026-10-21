"""Query construction and citation-preserving multi-query retrieval."""

import re

from .vector_store import DisasterProtocolVectorStore


class FloodProtocolRetriever:
    def __init__(self, vector_store=None):
        self.vector_store = vector_store or DisasterProtocolVectorStore()

    def build_queries_from_damage_metrics(self, damage_metrics):
        """Translate image-derived categories into broad, evidence-seeking queries."""
        summary = damage_metrics.get("damage_summary", {})
        severity = str(summary.get("severity_label", "")).strip()
        flood_pct = summary.get("flood_coverage_pct", 0)
        buildings = damage_metrics.get("buildings", {})
        roads = damage_metrics.get("roads", {})
        vehicles = damage_metrics.get("vehicles", {})

        queries = ["flood response priorities and incident triage"]
        if buildings.get("flooded_building_count", 0):
            queries.append("flooded buildings evacuation and structural safety")
        if roads.get("flooded_road_coverage_pct", 0) > 0 or vehicles.get("vehicle_count", 0):
            queries.append("flooded roads traffic access and vehicle rescue")
        if float(flood_pct or 0) > 0:
            queries.append("flood recovery public health water and sanitation")
        if severity:
            queries.append(f"{severity.lower()} flood response guidance")
        return queries

    @staticmethod
    def _citation_tag(result):
        document_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", result["document_id"]).strip("-").upper()
        section = re.sub(r"[^A-Za-z0-9_.-]+", "-", result["section"]).strip("-").upper()
        return f"[{document_id}:{section or 'GENERAL'}]"

    def _retrieve_queries(self, queries, top_k_per_query, limit):
        if not isinstance(top_k_per_query, int) or not 1 <= top_k_per_query <= 50:
            raise ValueError("top_k_per_query must be between 1 and 50.")
        if not isinstance(limit, int) or not 1 <= limit <= 20:
            raise ValueError("limit must be between 1 and 20.")

        fused = {}
        for query in queries:
            for rank, result in enumerate(self.vector_store.query(query, top_k=top_k_per_query), start=1):
                key = (result["source_doc"], result["section"], result["content_hash"])
                reciprocal_rank = 1 / (60 + rank)
                if key not in fused:
                    fused[key] = (reciprocal_rank, result)
                    result["matched_queries"] = [query]
                else:
                    score, existing = fused[key]
                    existing["matched_queries"].append(query)
                    if result.get("similarity_score", 0) > existing.get("similarity_score", 0):
                        result["matched_queries"] = existing["matched_queries"]
                        result["retrieval_score"] = result.get("retrieval_score")
                        fused[key] = (score + reciprocal_rank, result)
                    else:
                        fused[key] = (score + reciprocal_rank, existing)

        ranked = sorted(fused.values(), key=lambda item: item[0], reverse=True)
        results = []
        for score, result in ranked[:limit]:
            result["retrieval_score"] = round(score, 6)
            result["citation_tag"] = self._citation_tag(result)
            results.append(result)
        return results

    def retrieve_query(self, query_text, top_k=5):
        if not isinstance(query_text, str) or not query_text.strip():
            raise ValueError("query_text must be a non-empty string.")
        return self._retrieve_queries([query_text.strip()], top_k, top_k)

    def retrieve_grounded_protocols(self, damage_metrics, top_k_per_query=3, limit=8):
        queries = self.build_queries_from_damage_metrics(damage_metrics)
        return self._retrieve_queries(queries, top_k_per_query, limit)
