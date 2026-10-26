"""
Tests for Image-Specific 3D / Analysis Pipeline, LLM Grounding, and Bounding Box Extraction.
Validates:
1. Different images / masks produce genuinely different metrics and bounding boxes.
2. Bounding boxes are derived from connected components without static hardcoded coordinates.
3. LLM QA engine produces distinct, grounded answers tailored to the user's question and image metrics.
4. Metric consistency between segmentation mask components and report payloads.
"""
import pytest
import numpy as np
from damage_extraction.damage_extractor import extract_component_bounding_boxes
from dashboard.server import extract_metrics_from_class_mask
from report_generation.llm_engine import _generate_grounded_answer

def test_bounding_box_extraction_image_specific():
    # Create two synthetic masks with completely different object locations and classes
    # Mask 1: Flooded building in top-left, non-flooded building in bottom-right
    mask1 = np.zeros((100, 100), dtype=np.uint8)
    mask1[10:30, 10:30] = 1  # Building-flooded (class 1)
    mask1[70:90, 70:90] = 2  # Building-non-flooded (class 2)

    _, _, fb_boxes1 = extract_component_bounding_boxes(
        (mask1 == 1).astype(np.uint8), class_id=1, class_name="Building (Flooded)", min_pixels=10, is_flooded=True
    )
    _, _, nfb_boxes1 = extract_component_bounding_boxes(
        (mask1 == 2).astype(np.uint8), class_id=2, class_name="Building (Safe)", min_pixels=10, is_flooded=False
    )
    boxes1 = fb_boxes1 + nfb_boxes1
    assert len(boxes1) == 2, f"Expected 2 bounding boxes, got {len(boxes1)}"

    b1_flooded = next(b for b in boxes1 if b['flooded'])
    b1_safe = next(b for b in boxes1 if not b['flooded'])

    # Check normalized coordinates for mask1
    assert b1_flooded['flooded'] is True
    assert 9 <= b1_flooded['x'] <= 11
    assert 9 <= b1_flooded['y'] <= 11
    assert 19 <= b1_flooded['w'] <= 21
    assert 19 <= b1_flooded['h'] <= 21

    # Mask 2: Multiple flooded buildings in different positions, safe building in center
    mask2 = np.zeros((100, 100), dtype=np.uint8)
    mask2[40:60, 40:60] = 2  # Safe building in center
    mask2[5:15, 80:95] = 1   # Flooded building top-right
    mask2[75:95, 10:25] = 1  # Flooded building bottom-left

    _, _, fb_boxes2 = extract_component_bounding_boxes(
        (mask2 == 1).astype(np.uint8), class_id=1, class_name="Building (Flooded)", min_pixels=10, is_flooded=True
    )
    _, _, nfb_boxes2 = extract_component_bounding_boxes(
        (mask2 == 2).astype(np.uint8), class_id=2, class_name="Building (Safe)", min_pixels=10, is_flooded=False
    )
    boxes2 = fb_boxes2 + nfb_boxes2
    assert len(boxes2) == 3, f"Expected 3 bounding boxes, got {len(boxes2)}"

    flooded_boxes2 = [b for b in boxes2 if b['flooded']]
    assert len(flooded_boxes2) == 2

    # Assert that mask1 and mask2 produce completely different bounding box coordinates
    b2_coords = {(b['x'], b['y']) for b in boxes2}
    b1_coords = {(b['x'], b['y']) for b in boxes1}
    assert b2_coords.isdisjoint(b1_coords), "Mask 1 and Mask 2 bounding boxes should not overlap or share static coordinates"

def test_damage_extractor_integration_and_counts():
    # Mask with 3 flooded buildings, 1 safe building, flooded road, water
    # Create larger components to pass the 250px threshold in server.extract_metrics_from_class_mask
    mask = np.zeros((200, 200), dtype=np.uint8)
    mask[10:30, 10:30] = 1  # Flooded building 1 (400 px)
    mask[40:60, 10:30] = 1  # Flooded building 2 (400 px)
    mask[70:90, 10:30] = 1  # Flooded building 3 (400 px)
    mask[10:30, 70:90] = 2  # Non-flooded building (400 px)
    mask[100:150, :] = 5    # Water (Class 5)
    mask[160:170, :] = 3    # Road-flooded (Class 3)

    metrics = extract_metrics_from_class_mask(mask)

    assert metrics['buildings']['flooded_building_count'] == 3
    assert metrics['buildings']['non_flooded_building_count'] == 1
    assert metrics['buildings']['total_building_count'] == 4
    assert len(metrics['buildings']['detected_structures']) == 4
    assert metrics['damage_summary']['severity_label'] in ['MODERATE', 'SEVERE', 'CRITICAL']

def test_llm_answers_grounded_and_question_specific():
    metrics_a = {
        'buildings': {
            'flooded_building_count': 5,
            'non_flooded_building_count': 2,
            'total_building_count': 7,
            'structural_damage_pct': 71.4,
            'detected_structures': [{'id': 'b1', 'flooded': True}] * 5
        },
        'roads': {
            'flooded_road_coverage_pct': 42.0,
            'non_flooded_road_coverage_pct': 58.0
        },
        'damage_summary': {
            'flood_coverage_pct': 38.5,
            'severity_label': 'SEVERE',
            'damage_severity_score': 72.0
        }
    }

    metrics_b = {
        'buildings': {
            'flooded_building_count': 0,
            'non_flooded_building_count': 10,
            'total_building_count': 10,
            'structural_damage_pct': 0.0,
            'detected_structures': []
        },
        'roads': {
            'flooded_road_coverage_pct': 0.0,
            'non_flooded_road_coverage_pct': 100.0
        },
        'damage_summary': {
            'flood_coverage_pct': 4.1,
            'severity_label': 'LOW',
            'damage_severity_score': 8.0
        }
    }

    # Test Question 1: Building damage on Scene A vs Scene B
    q_bld = "How many buildings are flooded and what is the structural damage?"
    ans_a_bld = _generate_grounded_answer(q_bld, metrics_a, [])
    ans_b_bld = _generate_grounded_answer(q_bld, metrics_b, [])

    assert "5 out of 7" in ans_a_bld
    assert "71.4%" in ans_a_bld
    assert "0 out of 10" in ans_b_bld
    assert ans_a_bld != ans_b_bld

    # Test Question 2: Road conditions on Scene A vs Scene B
    q_roads = "Are any roads flooded and passable for emergency vehicles?"
    ans_a_roads = _generate_grounded_answer(q_roads, metrics_a, [])
    ans_b_roads = _generate_grounded_answer(q_roads, metrics_b, [])

    assert "42.0%" in ans_a_roads
    assert "severe disruption" in ans_a_roads
    assert "0.0% direct surface submersion" in ans_b_roads
    assert ans_a_roads != ans_b_roads

    # Test Question 3: Different questions on the SAME scene produce distinct, non-repetitive answers
    q_actions = "What are the recommended emergency actions and protocols?"
    ans_a_actions = _generate_grounded_answer(q_actions, metrics_a, [{"citation_tag": "SOP-FLD-01", "section": "Evacuate zone", "content": "Evacuate low-lying areas"}])

    assert ans_a_bld != ans_a_actions
    assert ans_a_roads != ans_a_actions
    assert "SOP-FLD-01" in ans_a_actions

    # Test Question 4: Compound query addressing both buildings and roads
    q_compound = "How many buildings are flooded and are the roads passable?"
    ans_compound = _generate_grounded_answer(q_compound, metrics_a, [])
    assert "5 out of 7" in ans_compound
    assert "42.0%" in ans_compound
    assert "Road & Route Passability" in ans_compound

    # Test Question 5: Safe structures inquiry
    q_safe = "Are any buildings safe and intact?"
    ans_safe = _generate_grounded_answer(q_safe, metrics_a, [])
    assert "2 intact / non-flooded structures" in ans_safe
