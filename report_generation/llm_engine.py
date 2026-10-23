"""
FloodSense LLM Synthesis Engine
================================
Synthesizes computer vision metrics and RAG context into structured disaster situation reports.
Powered by Groq High-Speed LPU Inference (openai/gpt-oss-120b) with automated deterministic fallback.
"""

import os
import re
import json
import time
import datetime
import urllib.request
import urllib.error
from .prompt_templates import FLOOD_SYSTEM_PROMPT, create_user_prompt

def _load_env():
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip().strip("'\""))
        except OSError as error:
            print(f"[LLM Engine Notice] Could not read the project .env file: {error}")

_load_env()

GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]

class FloodLLMEngine:
    def __init__(self, api_key: str = None, provider: str = "groq"):
        if not api_key:
            api_key = os.environ.get("GROQ_API_KEY")
        self.api_key = api_key
        self.provider = provider

    def generate_grounded_report(
        self,
        damage_metrics: dict,
        retrieved_protocols: list,
        user_question: str | None = None,
    ) -> dict:
        """
        Main interface to generate a grounded disaster report from CV metrics and RAG protocols.
        Prioritizes Groq LLM generation, with automatic fallback to deterministic synthesis on failure.
        """
        t0 = time.time()
        
        # 1. Attempt Groq LLM generation if enabled and key is available
        if self.provider != "offline" and self.api_key:
            try:
                report = self._call_groq_api(
                    damage_metrics,
                    retrieved_protocols,
                    user_question=user_question,
                )
                if report and "incident_report" in report:
                    report["generation_time_ms"] = round((time.time() - t0) * 1000, 2)
                    report["synthesis_engine"] = "Groq LPU (openai/gpt-oss-120b)"
                    return report
            except Exception as e:
                print(f"[LLM Engine Notice] Groq API call encountered: {e}. Engaging deterministic synthesis fallback...")

        # 2. Deterministic Grounded Synthesis Fallback (guarantees zero-hallucination & full citations)
        report = self._deterministic_grounded_synthesis(
            damage_metrics,
            retrieved_protocols,
            user_question=user_question,
        )
        report["generation_time_ms"] = round((time.time() - t0) * 1000, 2)
        report["synthesis_engine"] = "Deterministic Grounded Engine"
        return report

    def _call_groq_api(
        self,
        damage_metrics: dict,
        retrieved_protocols: list,
        user_question: str | None = None,
    ) -> dict:
        """
        Invokes Groq OpenAI-compatible Chat Completions API with structured JSON output.
        """
        user_prompt = create_user_prompt(
            damage_metrics,
            retrieved_protocols,
            user_question=user_question,
        )
        endpoint = "https://api.groq.com/openai/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "FloodSense-AI/1.0"
        }

        last_error = None
        for model in GROQ_MODELS:
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": FLOOD_SYSTEM_PROMPT + "\nIMPORTANT: You must return ONLY a single valid JSON object following the schema. Do not enclose in backticks or add preambles."
                    },
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ],
                "temperature": 0.15,
                "response_format": {"type": "json_object"}
            }

            try:
                req = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers=headers,
                    method="POST"
                )
                
                with urllib.request.urlopen(req, timeout=25) as response:
                    raw_body = response.read().decode("utf-8")
                    result = json.loads(raw_body)
                    content = result["choices"][0]["message"]["content"]
                    
                    # Parse JSON from content
                    parsed = self._extract_json(content)
                    if parsed and "incident_report" in parsed:
                        inc_rep = parsed["incident_report"]
                        allowed_citations = {
                            protocol.get("citation_tag")
                            for protocol in retrieved_protocols
                            if protocol.get("citation_tag")
                        }
                        reported_citations = inc_rep.get("retrieved_citations", [])
                        inc_rep["retrieved_citations"] = [
                            citation for citation in reported_citations
                            if isinstance(citation, str) and citation in allowed_citations
                        ] if isinstance(reported_citations, list) else []
                        grounded_actions = []
                        for action in inc_rep.get("prioritized_actions", []):
                            action["citation"] = " ".join(
                                citation
                                for citation in re.findall(r"\[[^\]]+\]", str(action.get("citation", "")))
                                if citation in allowed_citations
                            )
                            if action["citation"]:
                                grounded_actions.append(action)
                        inc_rep["prioritized_actions"] = grounded_actions
                        inc_rep["confidence_score"] = 0.0
                        inc_rep["confidence_note"] = "No calibrated confidence score is available."
                        self._overwrite_vision_metrics(inc_rep, damage_metrics)
                        if user_question:
                            parsed["follow_up_answer"] = str(
                                parsed.get("follow_up_answer")
                                or "The available image metrics and retrieved sources do not answer this question."
                            )
                        markdown = self._render_markdown(inc_rep)
                        if user_question:
                            markdown += (
                                "\n\n## Follow-up question\n"
                                f"{parsed['follow_up_answer']}"
                            )
                        parsed["markdown_rendered"] = markdown
                        print(f"[Groq LLM Engine] Successfully generated SITREP using model '{model}'")
                        return parsed
            except Exception as err:
                last_error = err
                print(f"[Groq LLM Engine] Model '{model}' attempt failed ({err}), trying fallback model...")
                continue

        raise RuntimeError(f"All Groq models failed. Last error: {last_error}")

    def _extract_json(self, text: str) -> dict:
        """Robustly extracts JSON from raw LLM output, stripping code blocks if present."""
        text = text.strip()
        # Direct parse attempt
        try:
            return json.loads(text)
        except Exception:
            pass
        
        # Regex match outer braces
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
        return {}

    def _deterministic_grounded_synthesis(
        self,
        damage_metrics: dict,
        retrieved_protocols: list,
        user_question: str | None = None,
    ) -> dict:
        """Create a facts-only report when no remote language model is configured."""
        summary = damage_metrics.get("damage_summary", {})
        buildings = damage_metrics.get("buildings", {})
        roads = damage_metrics.get("roads", {})
        vehicles = damage_metrics.get("vehicles", {})
        severity_label = summary.get("severity_label", "UNASSESSED")
        now = datetime.datetime.now(datetime.timezone.utc)
        report_id = f"FS-SITREP-{now.strftime('%Y%m%d')}-{abs(hash(str(damage_metrics))) % 10000:04d}"
        citations = [p["citation_tag"] for p in retrieved_protocols if p.get("citation_tag")]
        incident_report = {
            "report_id": report_id,
            "timestamp": now.isoformat(),
            "severity_classification": {
                "severity_score": summary.get("damage_severity_score", 0.0),
                "severity_tier": severity_label,
                "triage_summary": (
                    f"The vision model assigned the uncalibrated image-class proxy "
                    f"{severity_label}; predicted flood-class pixels cover "
                    f"{summary.get('flood_coverage_pct', 0.0)}% of the image "
                    f"({summary.get('total_flood_area_px', 0)} pixels). This is not "
                    "a verified emergency classification or physical area estimate."
                ),
            },
            "damage_assessment": {
                "total_flood_area_m2": None,
                "total_flood_area_px": summary.get("total_flood_area_px", 0),
                "flood_coverage_pct": summary.get("flood_coverage_pct", 0.0),
                "flooded_buildings_count": buildings.get("flooded_building_count", 0),
                "non_flooded_buildings_count": buildings.get("non_flooded_building_count", 0),
                "flooded_road_pct": roads.get("flooded_road_coverage_pct", 0.0),
                "submerged_vehicles_count": vehicles.get("vehicle_count", 0),
                "vegetation_and_terrain_impact": "Not assessed by the reported damage metrics.",
            },
            "prioritized_actions": [],
            "logistics_and_lifelines": {
                "drinking_water_sanitation": "No operational instruction is generated by the deterministic report.",
                "power_grid_safety": "No operational instruction is generated by the deterministic report.",
                "traffic_and_access_routes": "No operational instruction is generated by the deterministic report.",
            },
            "confidence_score": 0.0,
            "confidence_note": "No calibrated confidence score is available.",
            "retrieved_citations": citations,
            "retrieved_evidence": [
                {
                    "citation": protocol["citation_tag"],
                    "source": protocol.get("source_doc", "Unknown"),
                    "section": protocol.get("section", "GENERAL"),
                    "excerpt": protocol.get("content", ""),
                }
                for protocol in retrieved_protocols if protocol.get("citation_tag")
            ],
        }
        result = {"incident_report": incident_report}
        result["markdown_rendered"] = self._render_markdown(incident_report)
        if user_question:
            result["follow_up_answer"] = (
                "The image-derived estimates for this same image are: "
                f"{summary.get('total_flood_area_px', 0)} flood-class pixels "
                f"({summary.get('flood_coverage_pct', 0.0)}% of the image), "
                f"{buildings.get('flooded_building_count', 0)} flooded-building "
                "components, and "
                f"{roads.get('flooded_road_area_px', 0)} flooded-road pixels. "
                "These predictions cannot establish physical water depth, exact "
                "object identity, or a safe route."
            )
            result["markdown_rendered"] += (
                "\n\n## Follow-up question\n"
                f"{result['follow_up_answer']}"
            )
        return result

    @staticmethod
    def _overwrite_vision_metrics(report: dict, damage_metrics: dict) -> None:
        """Keep generated report figures identical to the upstream vision output."""
        summary = damage_metrics.get("damage_summary", {})
        buildings = damage_metrics.get("buildings", {})
        roads = damage_metrics.get("roads", {})
        vehicles = damage_metrics.get("vehicles", {})
        severity = report.setdefault("severity_classification", {})
        severity["severity_score"] = summary.get("damage_severity_score", 0.0)
        severity["severity_tier"] = summary.get("severity_label", "UNASSESSED")
        assessment = report.setdefault("damage_assessment", {})
        assessment.update({
            "total_flood_area_m2": None,
            "total_flood_area_px": summary.get("total_flood_area_px", 0),
            "flood_coverage_pct": summary.get("flood_coverage_pct", 0.0),
            "flooded_buildings_count": buildings.get("flooded_building_count", 0),
            "non_flooded_buildings_count": buildings.get("non_flooded_building_count", 0),
            "flooded_road_pct": roads.get("flooded_road_coverage_pct", 0.0),
            "submerged_vehicles_count": vehicles.get("vehicle_count", 0),
        })

    def _render_markdown(self, report: dict) -> str:
        """Render the estimate and its retrieved-source citations as Markdown."""
        rep_id = report.get("report_id", "FS-SITREP-LIVE")
        timestamp = report.get("timestamp", datetime.datetime.now().isoformat())
        
        sev = report.get("severity_classification", {})
        tier = sev.get("severity_tier", "MODERATE")
        score = sev.get("severity_score", 0.0)
        triage = sev.get("triage_summary", "Incident evaluation underway.")
        
        da = report.get("damage_assessment", {})
        flood_area_px = da.get("total_flood_area_px", 0)
        flood_pct = da.get("flood_coverage_pct", 0.0)
        fb_cnt = da.get("flooded_buildings_count", 0)
        nfb_cnt = da.get("non_flooded_buildings_count", 0)
        fr_pct = da.get("flooded_road_pct", 0.0)
        veh_cnt = da.get("submerged_vehicles_count", 0)
        terrain = da.get("vegetation_and_terrain_impact", "Natural terrain impact assessed.")
        
        md = f"""# FLOODSENSE IMAGE-ASSESSMENT REPORT
**Report Reference:** `{rep_id}`  
**Issue Timestamp:** `{timestamp}`  
**Severity Tier:** **{tier}** (Index Score: **{score}/100**)  
**Calibrated Confidence:** Not available

---

## 1. Executive Summary & Incident Triage
{triage}

---

## 2. Image-Mask Estimates (Not Ground-Truth Verified)
- **Flood-class pixels:** **{flood_area_px:,} pixels** ({flood_pct}% of the analyzed image; not georeferenced area)
- **Building-Flooded components:** **{fb_cnt}** (Building-Safe components: {nfb_cnt}); not verified object counts
- **Road-Flooded class pixels:** **{fr_pct}%** of predicted Road pixels
- **Vehicle/Vessel-class components:** **{veh_cnt}**; not verified vehicle detections
- **Terrain & Environment:** {terrain}

---

## 3. Prioritized Actionable Response Protocols
"""
        actions = report.get("prioritized_actions", [])
        for a in actions:
            p_level = a.get("priority_level", "P2-URGENT")
            title = a.get("action_title", "Emergency Response Action")
            details = a.get("action_details", "Execute designated flood response protocol.")
            resources = a.get("resource_deployment", "Standard rescue deployment.")
            cite = a.get("citation", "")
            
            md += f"""### [{p_level}] {title}
- **Action Details:** {details}
- **Required Resources:** `{resources}`
- **Protocol Authority:** `{cite}`

"""

        logistics = report.get("logistics_and_lifelines", {})
        water_san = logistics.get("drinking_water_sanitation", "No source-backed instruction available.")
        power = logistics.get("power_grid_safety", "No source-backed instruction available.")
        traffic = logistics.get("traffic_and_access_routes", "No source-backed instruction available.")
        
        md += f"""---

## 4. Critical Lifelines & Logistics
- **Drinking Water & Sanitation:** {water_san}
- **Electrical Power Safety:** {power}
- **Emergency Traffic Routing:** {traffic}

---

## 5. Traceable Regulatory Citations & Verification
"""
        citations = report.get("retrieved_citations", [])
        for cite in citations:
            md += f"- `{cite}`\n"

        return md
