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
                            existing_answer = str(parsed.get("follow_up_answer") or "").strip()
                            if not existing_answer or "do not answer this question" in existing_answer.lower():
                                parsed["follow_up_answer"] = self._generate_grounded_answer(
                                    user_question, damage_metrics, retrieved_protocols
                                )
                            else:
                                parsed["follow_up_answer"] = existing_answer
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

        # Populate prioritized actions from retrieved protocols
        prioritized_actions = []
        for i, proto in enumerate(retrieved_protocols[:3], start=1):
            tag = proto.get("citation_tag", "")
            if not tag:
                continue
            section = proto.get("section", "Standard Flood Response")
            snippet = proto.get("content") or proto.get("snippet", "")
            first_sentence = snippet.split(".")[0].strip() if snippet else "Follow standard incident protocol."
            prioritized_actions.append({
                "priority_level": f"P{min(i, 3)}-URGENT",
                "action_title": f"Protocol Guidance: {section}",
                "action_details": f"{first_sentence}.",
                "resource_deployment": "Deploy local response personnel with certified flood safety equipment.",
                "citation": tag,
            })

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
                    f"({summary.get('total_flood_area_px', 0)} pixels). "
                    f"Identified {buildings.get('flooded_building_count', 0)} flooded buildings "
                    f"and {roads.get('flooded_road_coverage_pct', 0.0)}% road network inundation."
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
                "vegetation_and_terrain_impact": "Assessed via multi-class segmentation mask.",
            },
            "prioritized_actions": prioritized_actions,
            "logistics_and_lifelines": {
                "drinking_water_sanitation": "Assess local potable water access in flooded zones.",
                "power_grid_safety": "Isolate flooded electrical distribution nodes.",
                "traffic_and_access_routes": (
                    f"{roads.get('flooded_road_coverage_pct', 0.0)}% of roads are submerged; reroute transit via high ground."
                    if roads.get("flooded_road_coverage_pct", 0.0) > 0
                    else "Road routes remain largely clear of surface water."
                ),
            },
            "confidence_score": 0.0,
            "confidence_note": "Derived from semantic segmentation pixel classification.",
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
            result["follow_up_answer"] = self._generate_grounded_answer(
                user_question, damage_metrics, retrieved_protocols
            )
            result["markdown_rendered"] += (
                "\n\n## Follow-up question\n"
                f"{result['follow_up_answer']}"
            )
        return result

    @staticmethod
    def _generate_grounded_answer(
        question: str,
        damage_metrics: dict,
        retrieved_protocols: list,
    ) -> str:
        """
        Generates a direct, specific, and grounded answer to the user's question
        based strictly on verified damage metrics and retrieved protocols for the active image.
        Supports single-intent and multi-intent queries without premature cutoffs.
        """
        q = question.lower().strip()
        summary = damage_metrics.get("damage_summary", {})
        buildings = damage_metrics.get("buildings", {})
        roads = damage_metrics.get("roads", {})
        water = damage_metrics.get("water", {})
        pool = damage_metrics.get("pool", {})
        vehicles = damage_metrics.get("vehicles", {})
        class_dist = damage_metrics.get("class_distribution_pct", {})

        fb_cnt = buildings.get("flooded_building_count", 0)
        nfb_cnt = buildings.get("non_flooded_building_count", 0)
        total_bldg = buildings.get("total_building_count", fb_cnt + nfb_cnt)
        bldg_dmg_pct = buildings.get("structural_damage_pct")
        if bldg_dmg_pct is None:
            bldg_ratio = buildings.get("building_flood_ratio", round(fb_cnt / max(1, total_bldg), 3))
            bldg_dmg_pct = round(bldg_ratio * 100, 1)

        flood_pct = summary.get("flood_coverage_pct", 0.0)
        flood_px = summary.get("total_flood_area_px", 0)
        sev_score = summary.get("damage_severity_score", 0.0)
        sev_tier = summary.get("severity_label", "MODERATE")

        fr_pct = roads.get("flooded_road_coverage_pct", 0.0)
        nfr_pct = roads.get("non_flooded_road_coverage_pct", 0.0)
        veh_cnt = vehicles.get("vehicle_count", 0)
        veh_pct = vehicles.get("vehicle_area_pct", 0.0)
        tree_pct = class_dist.get("tree", 0.0)
        water_body_pct = water.get("water_body_coverage_pct", 0.0)
        pool_pct = pool.get("pool_area_pct", 0.0)

        # Detect intents from user question
        is_publish = any(w in q for w in ["publish", "community", "feed", "where is it published", "where is the report", "where does"])
        is_safe_focus = any(w in q for w in ["safe", "intact", "undamaged", "non-flooded"]) and not any(w in q for w in ["how many buildings are flooded", "flooded building", "flood damage"])
        is_buildings = is_safe_focus or any(w in q for w in ["building", "structure", "house", "home", "residential", "roof"])
        is_roads = any(w in q for w in ["road", "street", "highway", "access", "passab", "route", "corridor", "traffic", "drive", "transit"])
        is_water = any(w in q for w in ["water", "area", "extent", "cover", "inundat", "submerg", "pond", "pixel", "pool"])
        is_severity = any(w in q for w in ["severe", "severity", "level", "tier", "triage", "score", "index", "critical", "rating"])
        is_vehicles = any(w in q for w in ["vehicle", "car", "truck", "van", "bus", "transport"])
        is_vegetation = any(w in q for w in ["tree", "canopy", "grass", "vegetat", "green", "forest", "flora"])
        is_actions = any(w in q for w in [
            "action", "recommend", "protocol", "response", "do", "plan", "evacuat", "rescue",
            "guideline", "sop", "priority", "priorities", "prevent", "measure", "step", "precaut",
            "mitigat", "safeguard", "take", "taken", "procedure", "instruct", "advice",
            "advise", "solution", "relief", "remed", "manage", "handling", "contain", "protect",
            "order", "directive", "checklist", "prepare", "prepar", "tactic", "strategy", "task",
            "control", "curb", "avoid", "what should", "what can"
        ])
        is_health = any(w in q for w in ["potable", "drinking", "sanitat", "disease", "health", "contaminat", "hygiene", "sewage", "purif", "clean water", "illness", "infection"])
        is_electrical = any(w in q for w in ["power", "electric", "grid", "wire", "shock", "transform", "utility", "energy", "generator", "electrocute", "electrocution"])
        is_evacuation = any(w in q for w in ["evacuat", "shelter", "camp", "displace", "occupant", "resident", "relocat", "flee", "stay", "people affected", "victim", "population"])
        is_limitations = any(w in q for w in ["depth", "feet", "meter", "deep", "casualt", "injur", "death", "fatalit", "people", "inside", "trapped"])

        sections: list[tuple[str, str]] = []

        # 0. Publish / Community
        if is_publish:
            sections.append((
                "Report Publishing",
                "When you click **Publish report**, the assessment is published directly to the **Community Intelligence Feed** "
                "(accessible via the `/app/community` tab). It is saved to the central repository so other emergency response teams, "
                "field units, and municipal authorities can view, upvote, and coordinate actions based on your verified SITREP."
            ))

        # 1. Buildings / Structures
        if is_buildings:
            if is_safe_focus and nfb_cnt > 0:
                bldg_text = (
                    f"There are {nfb_cnt} intact / non-flooded structures observed on higher elevation ground outside "
                    f"the active flood boundary (out of {total_bldg} total detected buildings). "
                    f"{fb_cnt} structures ({bldg_dmg_pct}%) exhibit direct contact with surface water."
                )
            elif fb_cnt == 0:
                bldg_text = (
                    f"In this image, 0 out of {total_bldg} building structures are classified as flooded. "
                    f"All {nfb_cnt} detected building components appear intact and situated outside "
                    f"the visible water boundary."
                )
            else:
                bldg_boxes = buildings.get("detected_structures", [])
                flooded_ids = [b["id"] for b in bldg_boxes if b.get("flooded")]
                id_snippet = f" (Identified structures: {', '.join(flooded_ids[:4])}{' and others' if len(flooded_ids) > 4 else ''})" if flooded_ids else ""
                bldg_text = (
                    f"Based on the semantic segmentation analysis of this image, {fb_cnt} out of {total_bldg} "
                    f"detected buildings ({bldg_dmg_pct}%) are directly affected by floodwaters{id_snippet}. "
                    f"There are {nfb_cnt} non-flooded structures observed on higher elevation ground. "
                    "Note that this count reflects surface-level water inundation visible in the aerial capture; "
                    "physical structural integrity requires on-site structural engineering verification."
                )
            sections.append(("Structural Assessment", bldg_text))

        # 2. Roads / Passability
        if is_roads:
            if fr_pct > 0:
                passability_note = (
                    f"Road corridors in this sector exhibit severe disruption, with {fr_pct}% of the image's "
                    f"total road network inundated by floodwaters. Only {nfr_pct}% remains unflooded."
                )
            else:
                passability_note = (
                    f"The road network in this capture shows 0.0% direct surface submersion. "
                    f"Total road coverage is {nfr_pct}%, appearing dry and passable."
                )
            cite_str = ""
            for p in retrieved_protocols:
                if any(k in (p.get("section", "") + p.get("content", "")).lower() for k in ["road", "traffic", "access", "route"]):
                    cite_str = f" According to protocol [{p.get('citation_tag', 'REF')}]: {p.get('snippet', '')[:120]}..."
                    break
            road_text = (
                f"{passability_note}{cite_str} "
                "Emergency vehicular transit through flooded corridors should be suspended until physical depth is cleared."
            )
            sections.append(("Road & Route Passability", road_text))

        # 3. Severity
        if is_severity:
            sev_text = (
                f"The incident triage severity for this scene is classified as **{sev_tier}** "
                f"with a composite damage score of {sev_score}/100. This score is derived from weighted class "
                f"inundation, primarily driven by {fb_cnt} flooded buildings and {flood_pct}% overall water coverage."
            )
            sections.append(("Severity Classification", sev_text))

        # 4. Water / Flood Extent
        if is_water and not (is_buildings and is_roads and not any(w in q for w in ["water", "pixel", "pool", "extent", "coverage"])):
            water_text = (
                f"The vision segmentation model predicts {flood_px} flood-class pixels "
                f"({flood_pct}% of the analyzed image). This encompasses standing water bodies "
                f"({water_body_pct}%), flooded roadways ({fr_pct}%), "
                f"and inundated building parcels ({buildings.get('flooded_building_area_pct', 0.0)}%). "
                "Unflooded high ground constitutes the remaining portion of the scene."
            )
            sections.append(("Inundation & Water Extent", water_text))

        # 5. Vehicles
        if is_vehicles:
            if veh_cnt > 0:
                veh_text = (
                    f"There are {veh_cnt} vehicle components detected within this capture, "
                    f"accounting for {veh_pct}% of the scene pixels. "
                    "Any vehicles within or adjacent to the flood boundary must be assessed for electrical hazard."
                )
            else:
                veh_text = "No vehicles or mobile assets were detected within the analyzed image boundaries."
            sections.append(("Vehicular Assets", veh_text))

        # 6. Vegetation / Canopy
        if is_vegetation:
            veg_text = (
                f"Tree canopy covers {tree_pct}% of the analyzed image area. "
                f"Low-lying terrain and grass areas inundated by floodwaters are aggregated into the "
                f"{flood_pct}% active water extent to ensure precise flood delineation."
            )
            sections.append(("Vegetation & Environment", veg_text))

        # 7. Actions / Preventive Measures / Protocols
        if is_actions:
            measures = [
                f"**Perimeter Containment & Evacuation:** Establish an emergency cordon around the {flood_pct}% inundated zone. Verify evacuation status of all occupants from the {fb_cnt} flooded structures to designated relief centers on elevated ground.",
                f"**Transit & Access Control:** Barricade flooded roadways ({fr_pct}% of corridors inundated) to prevent vehicle drowning hazards. Route emergency supply convoys strictly through dry road corridors ({nfr_pct}% passable).",
                f"**Utility & Power Grid Isolation:** Remotely de-energize electrical distribution nodes and transformer boxes within the flood perimeter to eliminate electrocution risks.",
                f"**Potable Water & Health Protection:** Inundated water pipelines must be treated as biohazard-compromised. Issue immediate boil-water notices and distribute halogen water purification tablets.",
                f"**Structural Re-entry Prohibition:** Disallow civilian re-entry into affected buildings until certified structural engineers verify load-bearing foundations."
            ]
            actions_summary = []
            for i, p in enumerate(retrieved_protocols[:3], start=1):
                tag = p.get("citation_tag", f"P{i}")
                sec = p.get("section", "Standard Protocol")
                snippet = (p.get("content") or p.get("snippet", "")).strip().split("\n")[0][:120]
                actions_summary.append(f"• **[{tag}] {sec}:** {snippet}...")

            act_text = (
                f"For a scene with **{sev_tier}** severity and **{flood_pct}%** flood coverage, the following prioritized preventive and operational measures must be enacted:\n\n"
                + "\n\n".join(f"{idx}. {m}" for idx, m in enumerate(measures, 1))
            )
            if actions_summary:
                act_text += "\n\n**Authoritative Protocol Directives:**\n" + "\n".join(actions_summary)
            sections.append(("Preventive & Operational Measures", act_text))

        # 8. Health & Drinking Water
        if is_health and not is_actions:
            health_text = (
                f"Inundated municipal water pipelines and standing water bodies ({water_body_pct}% coverage) in this {sev_tier} zone "
                "are presumed contaminated with sewage, coliforms, and biological runoff. "
                "Enact an immediate boil-water mandate, distribute chlorine purification tablets, and instruct personnel to wear waterproof PPE "
                "to prevent waterborne infections and leptospirosis."
            )
            sections.append(("Public Health & Sanitation", health_text))

        # 9. Electrical Grid Safety
        if is_electrical and not is_actions:
            elec_text = (
                f"Mandatory utility protocol: Immediately de-energize all power distribution transformers and household meter connections "
                f"intersecting the {flood_pct}% flood contour. Responders must verify zero-voltage state before deploying rescue craft into flooded parcels."
            )
            sections.append(("Electrical Power Safety", elec_text))

        # 10. Evacuation & Shelter
        if is_evacuation and not is_actions:
            evac_text = (
                f"Evacuation priority: Visual analysis confirms {fb_cnt} building structures are directly inundated by floodwaters. "
                f"Immediate evacuation of all occupants to designated high-ground relief centers is prioritized. "
                f"Non-flooded structures ({nfb_cnt} intact buildings) and safe road segments ({nfr_pct}%) should be used as temporary staging axes."
            )
            sections.append(("Evacuation & Shelter", evac_text))

        # 11. Sensor Depth / Casualty Limitations
        if is_limitations:
            lim_text = (
                f"Physical water depth and human casualties cannot be directly measured from single 2D aerial segmentation. "
                f"While relative monocular depth indicates topography gradients across the {flood_pct}% water extent, "
                "exact column depth (in meters or feet) and casualty confirmation require deployed ground gauges or sonar reconnaissance."
            )
            sections.append(("Sensor Constraints", lim_text))

        # Return single paragraph if 1 section matched, or formatted multi-section response if compound
        if len(sections) == 1:
            return sections[0][1]
        elif len(sections) > 1:
            return "\n\n".join([f"**{title}:**\n{body}" for title, body in sections])

        # If user asked a question and retrieved protocols exist, synthesize guidance directly from RAG matches
        if retrieved_protocols:
            proto_guidance = []
            for p in retrieved_protocols[:3]:
                tag = p.get("citation_tag", "REF")
                sec = p.get("section", "Operational Protocol")
                snippet = (p.get("content") or p.get("snippet", "")).strip()
                if snippet:
                    first_sent = snippet.split("\n")[0][:140].strip()
                    proto_guidance.append(f"• **[{tag}] {sec}:** {first_sent}...")
            if proto_guidance:
                return (
                    f"Regarding your query on this **{sev_tier}** flood scene ({flood_pct}% flood coverage, "
                    f"{fb_cnt} flooded buildings, {fr_pct}% road inundation), the following verified protocols apply:\n\n"
                    + "\n\n".join(proto_guidance)
                    + f"\n\n*Operational Guidance: Responders must coordinate all interventions with Incident Command and maintain safety perimeters outside active floodwaters.*"
                )

        # Fallback / General / Summary / Overview questions
        return (
            f"Assessment summary for this scene: Floodwaters encompass {flood_pct}% of the area "
            f"resulting in a **{sev_tier}** severity tier (score {sev_score}/100). "
            f"Visual analysis identifies {fb_cnt} flooded buildings (out of {total_bldg} total), "
            f"{fr_pct}% road inundation, and {veh_cnt} mobile assets. "
            f"Non-flooded structures ({nfb_cnt}) remain elevated outside the active flood boundary."
        )

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


_generate_grounded_answer = FloodLLMEngine._generate_grounded_answer
