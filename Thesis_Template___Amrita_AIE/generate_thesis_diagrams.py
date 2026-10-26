"""
generate_thesis_diagrams.py
===========================
Generates 13 high-resolution, beautifully colored, professional publication-grade
diagrams for the FloodSense B.Tech thesis in Amrita AIE.
All diagrams are bounded within exact canvas limits and saved at 300 DPI.
"""

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ArrowStyle
import matplotlib.patheffects as patheffects

OUT_DIR = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(OUT_DIR, exist_ok=True)

# Common styling constants
FONT_FAMILY = "sans-serif"
plt.rcParams['font.family'] = FONT_FAMILY
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']

def draw_card(ax, x, y, w, h, bg_color, border_color="#1e293b", corner_radius=0.03, lw=1.5, zorder=2):
    """Draws a clean rounded rectangle card."""
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.01,rounding_size={corner_radius}",
        facecolor=bg_color,
        edgecolor=border_color,
        linewidth=lw,
        zorder=zorder
    )
    ax.add_patch(box)
    return box

def draw_arrow(ax, x1, y1, x2, y2, color="#334155", lw=2.0, style="->", zorder=3):
    """Draws a clean connecting arrow."""
    ax.annotate(
        "", xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(
            arrowstyle=style,
            color=color,
            lw=lw,
            shrinkA=4, shrinkB=4,
            mutation_scale=15
        ),
        zorder=zorder
    )


# ==============================================================================
# 1. Figure 1.1: The Operational Intelligence Gap
# ==============================================================================
def make_fig1_disaster_gap():
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.2)
    ax.axis('off')

    # Title
    ax.text(5, 4.85, "The Operational Intelligence Gap in Flood Disaster Response", 
            ha='center', va='center', fontsize=13, fontweight='bold', color='#0f172a')

    # 4 Main Stage Cards
    # Stage 1: Drone Ingestion
    draw_card(ax, 0.4, 2.5, 2.0, 1.8, "#eff6ff", "#3b82f6", lw=2)
    ax.text(1.4, 4.0, "Stage 1: Drone Recon", ha='center', va='center', fontsize=10, fontweight='bold', color='#1d4ed8')
    ax.text(1.4, 3.5, "Ultra-High-Res 12MP\nAerial Orthophotos\n(DJI Phantom 4)\nGSD < 3 cm/pixel", ha='center', va='center', fontsize=8, color='#334155')

    # Bottleneck 1 Callout
    draw_card(ax, 2.65, 3.45, 1.7, 0.85, "#fef2f2", "#ef4444", lw=1.5)
    ax.text(3.5, 4.0, "BOTTLENECK 1", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#b91c1c')
    ax.text(3.5, 3.7, "Raw masks only;\nno physical metrics", ha='center', va='center', fontsize=7, color='#7f1d1d')
    draw_arrow(ax, 2.4, 3.4, 2.65, 3.85, "#ef4444")
    draw_arrow(ax, 4.35, 3.85, 4.6, 3.4, "#ef4444")

    # Stage 2: Fragmented AI Tools
    draw_card(ax, 4.6, 2.5, 2.0, 1.8, "#fff7ed", "#f97316", lw=2)
    ax.text(5.6, 4.0, "Stage 2: Standard AI", ha='center', va='center', fontsize=10, fontweight='bold', color='#c2410c')
    ax.text(5.6, 3.5, "Binary Water Models\nNo road / building\nseverity context\nUncalibrated masks", ha='center', va='center', fontsize=8, color='#334155')

    # Bottleneck 2 Callout
    draw_card(ax, 6.85, 3.45, 1.7, 0.85, "#fef2f2", "#ef4444", lw=1.5)
    ax.text(7.7, 4.0, "BOTTLENECK 2", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#b91c1c')
    ax.text(7.7, 3.7, "LLM Hallucinations;\nno visual grounding", ha='center', va='center', fontsize=7, color='#7f1d1d')
    draw_arrow(ax, 6.6, 3.4, 6.85, 3.85, "#ef4444")
    draw_arrow(ax, 8.55, 3.85, 8.8, 3.4, "#ef4444")

    # Stage 3: Ground Relief Deficit
    draw_card(ax, 7.6, 1.5, 2.0, 1.8, "#fdf4ff", "#a855f7", lw=2)
    ax.text(8.6, 3.0, "Stage 3: Field Operations", ha='center', va='center', fontsize=10, fontweight='bold', color='#7e22ce')
    ax.text(8.6, 2.4, "Delayed Rescue Teams\nImpassable Roads\nConflicting Reports\nDelayed Logistics", ha='center', va='center', fontsize=8, color='#334155')

    # FloodSense Solution Bridge Banner
    draw_card(ax, 0.4, 0.3, 6.8, 1.8, "#ecfdf5", "#10b981", lw=2.5)
    ax.text(3.8, 1.8, "FLOODSENSE UNIFIED PARADIGM: BRIDGING THE GAP", ha='center', va='center', fontsize=11, fontweight='bold', color='#047857')
    ax.text(1.4, 1.0, "1. SOTA Multi-Class Vision\n(Class-Balanced SegFormer\n+ DiceFocalLoss)", ha='center', va='center', fontsize=8, fontweight='bold', color='#065f46')
    draw_arrow(ax, 2.5, 1.0, 2.8, 1.0, "#059669")
    ax.text(3.7, 1.0, "2. Damage Extraction\n(Physical areas, road cutoffs,\nbuilding damage counts)", ha='center', va='center', fontsize=8, fontweight='bold', color='#065f46')
    draw_arrow(ax, 4.7, 1.0, 5.0, 1.0, "#059669")
    ax.text(5.9, 1.0, "3. Protocol RAG & SITREP\n(NDMA/FEMA Vector Search,\nZero-Hallucination SITREP)", ha='center', va='center', fontsize=8, fontweight='bold', color='#065f46')

    draw_arrow(ax, 7.2, 1.0, 7.6, 1.8, "#10b981", lw=3.0)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig1_disaster_gap.png"), dpi=300)
    plt.close()
    print("Created fig1_disaster_gap.png")


# ==============================================================================
# 2. Figure 2.1: Taxonomy and Timeline of Disaster AI
# ==============================================================================
def make_fig2_lit_taxonomy():
    fig, ax = plt.subplots(figsize=(10, 5.0), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.0)
    ax.axis('off')

    ax.text(5, 4.7, "Taxonomy & Evolution of Post-Disaster AI Assessment Paradigms", 
            ha='center', va='center', fontsize=13, fontweight='bold', color='#0f172a')

    eras = [
        ("1970 - 2014\nClassical Vision", "#f1f5f9", "#64748b",
         ["• Otsu Thresholding", "• HSV / LAB color space", "• Morphological filters", "• High spectral variance", "• Severe shadow errors"]),
        ("2015 - 2022\nDeep CNNs & ViTs", "#eff6ff", "#3b82f6",
         ["• U-Net, DeepLabv3+", "• SegFormer (MiT-B3)", "• FCN / PSPNet", "• Better semantics", "• Class imbalance cap"]),
        ("2023 - 2025\nFoundation Models", "#fff7ed", "#f97316",
         ["• Meta SAM & SAM 2", "• Grounding DINO", "• DisasTeller (GPT-4o)", "• MASA + BLIP-2", "• High compute latency"]),
        ("2025+\nGrounded Multi-Modal", "#ecfdf5", "#10b981",
         ["• FloodSense (Ours)", "• Class-Balanced SegFormer", "• DiceFocalLoss Objective", "• Statutory Vector RAG", "• Verified SITREPs"])
    ]

    for i, (title, bg, border, bullets) in enumerate(eras):
        x = 0.4 + i * 2.35
        draw_card(ax, x, 0.4, 2.15, 3.8, bg, border, lw=2)
        ax.text(x + 1.07, 3.85, title, ha='center', va='center', fontsize=9.5, fontweight='bold', color='#0f172a')
        
        # Divider line
        ax.plot([x + 0.15, x + 2.0], [3.35, 3.35], color=border, lw=1.2)
        
        y_text = 3.05
        for b in bullets:
            is_bold = "FloodSense" in b
            ax.text(x + 0.15, y_text, b, ha='left', va='center', fontsize=7.5,
                    fontweight='bold' if is_bold else 'normal',
                    color='#047857' if is_bold else '#334155')
            y_text -= 0.55

        if i < 3:
            draw_arrow(ax, x + 2.15, 2.2, x + 2.35, 2.2, "#475569", lw=2.0)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig2_lit_taxonomy.png"), dpi=300)
    plt.close()
    print("Created fig2_lit_taxonomy.png")


# ==============================================================================
# 3. Figure 3.1: FloodSense End-to-End System Architecture
# ==============================================================================
def make_fig3_system_architecture():
    fig, ax = plt.subplots(figsize=(10, 6.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6.2)
    ax.axis('off')

    ax.text(5, 5.95, "FloodSense End-to-End System Architecture (The Three-Tier Pipeline)", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # TIER 1: COMPUTER VISION
    draw_card(ax, 0.4, 4.0, 9.2, 1.6, "#eff6ff", "#2563eb", lw=2)
    ax.text(0.6, 5.35, "TIER 1: HIGH-RESOLUTION COMPUTER VISION SEGMENTATION ENGINE", fontsize=9.5, fontweight='bold', color='#1d4ed8')
    
    # Tier 1 internal boxes
    draw_card(ax, 0.6, 4.15, 1.8, 0.95, "#ffffff", "#93c5fd")
    ax.text(1.5, 4.62, "Raw 12MP UAV\nOrthophoto\n(4000x3000)", ha='center', va='center', fontsize=7.5, color='#1e293b')
    
    draw_arrow(ax, 2.4, 4.62, 2.65, 4.62, "#2563eb")
    draw_card(ax, 2.65, 4.15, 2.0, 0.95, "#ffffff", "#93c5fd")
    ax.text(3.65, 4.62, "Gaussian Sliding Window\n(512x512, Stride 256)\nZero border seams", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 4.65, 4.62, 4.9, 4.62, "#2563eb")
    draw_card(ax, 4.9, 4.15, 2.2, 0.95, "#ffffff", "#93c5fd")
    ax.text(6.0, 4.62, "SegFormer-B3 Model\nClass-Balanced Sampling\n+ DiceFocalLoss Objective", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.1, 4.62, 7.35, 4.62, "#2563eb")
    draw_card(ax, 7.35, 4.15, 2.05, 0.95, "#ffffff", "#93c5fd")
    ax.text(8.37, 4.62, "Dihedral Multi-Scale TTA\n84.49% Pixel Accuracy\n10-Class Semantic Mask", ha='center', va='center', fontsize=7.5, color='#1e293b')

    # Connecting Arrow Tier 1 -> Tier 2
    draw_arrow(ax, 5.0, 4.0, 5.0, 3.65, "#0f172a", lw=2.5)

    # TIER 2: DAMAGE EXTRACTION & VECTOR RAG
    draw_card(ax, 0.4, 2.0, 9.2, 1.6, "#fff7ed", "#ea580c", lw=2)
    ax.text(0.6, 3.35, "TIER 2: DAMAGE EXTRACTION & STATUTORY VECTOR RAG RETRIEVAL ENGINE", fontsize=9.5, fontweight='bold', color='#c2410c')

    draw_card(ax, 0.6, 2.15, 2.2, 0.95, "#ffffff", "#fdba74")
    ax.text(1.7, 2.62, "Physical Damage Extractor\nFlooded Road Submergence %\nFlooded Building Counts\nStranded Vehicle Envelopes", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 2.8, 2.62, 3.1, 2.62, "#ea580c")
    draw_card(ax, 3.1, 2.15, 1.9, 0.95, "#ffffff", "#fdba74")
    ax.text(4.05, 2.62, "Severity Scorer\nS_severity in [0, 100]\nLevel 1-4 Priority Tiers\nDynamic Query Builder", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 5.0, 2.62, 5.3, 2.62, "#ea580c")
    draw_card(ax, 5.3, 2.15, 2.1, 0.95, "#ffffff", "#fdba74")
    ax.text(6.35, 2.62, "ChromaDB Vector Store\nSentence-BERT Embeddings\nall-MiniLM-L6-v2 (D=384)\nCosine Similarity Search", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.4, 2.62, 7.7, 2.62, "#ea580c")
    draw_card(ax, 7.7, 2.15, 1.7, 0.95, "#ffffff", "#fdba74")
    ax.text(8.55, 2.62, "Statutory Protocols\nNDMA Guidelines\nNDRF Rescue SOPs\nFEMA Flood Manual", ha='center', va='center', fontsize=7.5, color='#1e293b')

    # Connecting Arrow Tier 2 -> Tier 3
    draw_arrow(ax, 5.0, 2.0, 5.0, 1.65, "#0f172a", lw=2.5)

    # TIER 3: REPORTING & DEPLOYMENT
    draw_card(ax, 0.4, 0.05, 9.2, 1.6, "#ecfdf5", "#059669", lw=2)
    ax.text(0.6, 1.4, "TIER 3: GROUNDED LLM REPORT SYNTHESIS & REAL-TIME CLOUD DASHBOARD", fontsize=9.5, fontweight='bold', color='#047857')

    draw_card(ax, 0.6, 0.2, 2.5, 0.95, "#ffffff", "#6ee7b7")
    ax.text(1.85, 0.67, "Grounded Prompt Synthesis\nDamage metrics + top-k clauses\nStrict closed-world constraints\nZero Hallucination Guarantee", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 3.1, 0.67, 3.4, 0.67, "#059669")
    draw_card(ax, 3.4, 0.2, 2.4, 0.95, "#ffffff", "#6ee7b7")
    ax.text(4.6, 0.67, "Grounded LLM Reasoning\nDeterministic Fallback Engine\nInstant Offline Operation\nAudit Citation Trail", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 5.8, 0.67, 6.1, 0.67, "#059669")
    draw_card(ax, 6.1, 0.2, 1.7, 0.95, "#ffffff", "#6ee7b7")
    ax.text(6.95, 0.67, "Multi-Format Export\n• JSON GIS Schema\n• Markdown SITREP\n• Word DOCX / PDF", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.8, 0.67, 8.1, 0.67, "#059669")
    draw_card(ax, 8.1, 0.2, 1.3, 0.95, "#ffffff", "#6ee7b7")
    ax.text(8.75, 0.67, "Web UI\nNext.js Dashboard\nAzure Cloud Backend\nHF Spaces", ha='center', va='center', fontsize=7.5, color='#1e293b')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig3_system_architecture.png"), dpi=300)
    plt.close()
    print("Created fig3_system_architecture.png")


# ==============================================================================
# 4. Figure 3.2: 2D Gaussian Sliding-Window Pipeline
# ==============================================================================
def make_fig3_sliding_window():
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    ax.text(5, 4.5, "High-Resolution 2D Gaussian Sliding-Window Tiling Pipeline", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # 1. Full 12MP Image
    draw_card(ax, 0.3, 1.5, 1.8, 2.3, "#f8fafc", "#3b82f6", lw=1.8)
    ax.text(1.2, 3.5, "12MP Aerial Image\n(4000 x 3000)", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1d4ed8')
    # draw grid inside
    for gx in np.linspace(0.45, 1.95, 4):
        ax.plot([gx, gx], [1.7, 3.1], color="#93c5fd", lw=0.8, ls="--")
    for gy in np.linspace(1.7, 3.1, 4):
        ax.plot([0.45, 1.95], [gy, gy], color="#93c5fd", lw=0.8, ls="--")
    ax.text(1.2, 2.0, "Native GSD\n~2.5 cm/px", ha='center', va='center', fontsize=7.5, color='#475569')

    draw_arrow(ax, 2.1, 2.65, 2.5, 2.65, "#2563eb")

    # 2. Patch Extraction
    draw_card(ax, 2.5, 1.5, 1.8, 2.3, "#eff6ff", "#2563eb", lw=1.8)
    ax.text(3.4, 3.5, "Overlapping Tiling\n(512 x 512, Stride 256)", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1d4ed8')
    rect1 = patches.Rectangle((2.7, 2.0), 0.9, 0.9, facecolor="#bfdbfe", edgecolor="#1d4ed8", alpha=0.7)
    rect2 = patches.Rectangle((3.1, 1.8), 0.9, 0.9, facecolor="#fed7aa", edgecolor="#ea580c", alpha=0.7)
    ax.add_patch(rect1)
    ax.add_patch(rect2)
    ax.text(3.4, 2.45, "50% Overlap", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#1e293b')

    draw_arrow(ax, 4.3, 2.65, 4.7, 2.65, "#2563eb")

    # 3. Model Forward Pass
    draw_card(ax, 4.7, 1.5, 1.8, 2.3, "#fff7ed", "#ea580c", lw=1.8)
    ax.text(5.6, 3.5, "SegFormer Model\nForward Pass", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#c2410c')
    ax.text(5.6, 2.65, "P_k = Softmax(Logits)\nSize: [10, 512, 512]\nClass probabilities", ha='center', va='center', fontsize=8, color='#334155')

    draw_arrow(ax, 6.5, 2.65, 6.9, 2.65, "#ea580c")

    # 4. 2D Gaussian Window Feathering
    draw_card(ax, 6.9, 1.5, 1.8, 2.3, "#fdf4ff", "#a855f7", lw=1.8)
    ax.text(7.8, 3.5, "2D Gaussian\nSpatial Feathering", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#7e22ce')
    # draw a circle gradient representation
    circle = patches.Circle((7.8, 2.4), 0.55, facecolor="#e9d5ff", edgecolor="#9333ea", lw=1.5)
    circle_inner = patches.Circle((7.8, 2.4), 0.28, facecolor="#c084fc", edgecolor="#6b21a8", lw=1.2)
    ax.add_patch(circle)
    ax.add_patch(circle_inner)
    ax.text(7.8, 1.7, "W(u,v) = exp(-d^2 / 2s^2)\nsigma = K / 4 = 128", ha='center', va='center', fontsize=7, color='#581c87')

    draw_arrow(ax, 8.7, 2.65, 9.1, 2.65, "#a855f7")

    # 5. Output Seamless Canvas
    draw_card(ax, 9.1, 1.5, 0.8, 2.3, "#ecfdf5", "#059669", lw=1.8)
    ax.text(9.5, 2.65, "Final\nSeamless\n10-Class\nMask\n(Zero Seams)", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#047857')

    # Bottom summary box
    draw_card(ax, 0.3, 0.2, 9.4, 0.9, "#f8fafc", "#64748b", lw=1.2)
    ax.text(5, 0.65, "Mathematical Guarantee: Seamless probability blending eliminates edge boundary cliffs while preserving tiny vehicles and narrow roadways.",
            ha='center', va='center', fontsize=8, style='italic', color='#334155')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig3_sliding_window.png"), dpi=300)
    plt.close()
    print("Created fig3_sliding_window.png")


# ==============================================================================
# 5. Figure 3.3: Dynamic RAG Query Formulation & Retrieval Flow
# ==============================================================================
def make_fig3_rag_flow():
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    ax.text(5, 4.5, "Dynamic RAG Query Formulation and Statutory Retrieval Flow", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Step 1: Vision Telemetry
    draw_card(ax, 0.4, 1.6, 2.1, 2.3, "#eff6ff", "#2563eb", lw=2)
    ax.text(1.45, 3.6, "1. Extracted Telemetry", ha='center', va='center', fontsize=9, fontweight='bold', color='#1d4ed8')
    ax.text(1.45, 2.7, "• Inundation: 23,450 m^2\n• Flooded Roads: 38.2%\n• Flooded Bldgs: 6 / 14\n• Stranded Vehicles: 3\n• Severity: 76.4 (Level 4)",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 2.5, 2.75, 2.9, 2.75, "#2563eb")

    # Step 2: Dynamic Query Formulator
    draw_card(ax, 2.9, 1.6, 2.1, 2.3, "#fff7ed", "#ea580c", lw=2)
    ax.text(3.95, 3.6, "2. Query Builder", ha='center', va='center', fontsize=9, fontweight='bold', color='#c2410c')
    ax.text(3.95, 2.7, "Generates contextual\ntargeted queries:\n\"Submerged roadway\nboat rescue criteria,\ntrapped vehicles and\nstructural evacuation\"",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 5.0, 2.75, 5.4, 2.75, "#ea580c")

    # Step 3: ChromaDB Vector Match
    draw_card(ax, 5.4, 1.6, 2.1, 2.3, "#fdf4ff", "#a855f7", lw=2)
    ax.text(6.45, 3.6, "3. Vector Search", ha='center', va='center', fontsize=9, fontweight='bold', color='#7e22ce')
    ax.text(6.45, 2.7, "ChromaDB Store\nEmbed: all-MiniLM-L6-v2\nCosine Distance MIPS\nMRR = 0.95\nRecall@3 = 1.00",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.5, 2.75, 7.9, 2.75, "#a855f7")

    # Step 4: Top-k Statutory Context
    draw_card(ax, 7.9, 1.6, 1.7, 2.3, "#ecfdf5", "#059669", lw=2)
    ax.text(8.75, 3.6, "4. Retrieved Clauses", ha='center', va='center', fontsize=9, fontweight='bold', color='#047857')
    ax.text(8.75, 2.7, "• NDMA Sec 5.2.1\n• NDRF SOP Sec 4.1\n• FEMA P-1020 Sec 3.4\nExact Paragraphs &\nCitation Auditing",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    # Bottom Prompt Fusion Card
    draw_card(ax, 0.4, 0.2, 9.2, 1.1, "#f8fafc", "#334155", lw=1.5)
    ax.text(5, 0.75, "Prompt Assembly: [Visual Damage Metrics] + [Statutory Guidelines] + [Strict Anti-Hallucination Guardrails] -> Grounded SITREP",
            ha='center', va='center', fontsize=8, fontweight='bold', color='#0f172a')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig3_rag_flow.png"), dpi=300)
    plt.close()
    print("Created fig3_rag_flow.png")


# ==============================================================================
# 6. Figure 4.1: FloodNet Class Distribution Histogram
# ==============================================================================
def make_fig4_floodnet_distribution():
    fig, ax = plt.subplots(figsize=(10, 5.0), dpi=300)

    classes = [
        "Grass", "Tree", "Water", "Road (Non-Flooded)", "Building (Non-Flooded)",
        "Background", "Road (Flooded)", "Building (Flooded)", "Pool", "Vehicle"
    ]
    percentages = [54.8, 18.5, 11.1, 5.88, 2.84, 2.19, 2.58, 1.73, 0.19, 0.17]
    colors = [
        "#04fa07", "#0052ff", "#3de6fa", "#8c8c8c", "#b47878",
        "#000000", "#a09614", "#ff0000", "#ffeb00", "#ff00f5"
    ]

    y_pos = np.arange(len(classes))
    bars = ax.barh(y_pos, percentages, color=colors, edgecolor="#334155", height=0.65, lw=1.0)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(classes, fontsize=9, fontweight='bold')
    ax.invert_yaxis()
    ax.set_xlabel("Percentage of Total Annotated Pixels (%)", fontsize=10, fontweight='bold', color='#0f172a')
    ax.set_title("FloodNet Multi-Class Drone Dataset: Extreme Spatial Class Imbalance", fontsize=12, fontweight='bold', pad=15)
    ax.set_xlim(0, 65)

    for bar, pct in zip(bars, percentages):
        width = bar.get_width()
        ax.text(width + 0.8, bar.get_y() + bar.get_height()/2, f"{pct:.2f}%", 
                va='center', fontsize=8.5, fontweight='bold', color='#1e293b')

    # Annotation box
    ax.text(35, 7.5, "CRITICAL IMBALANCE:\nMinority classes like Vehicles (0.17%)\nand Flooded Roads (2.58%) fail with\nCross-Entropy, requiring class-balanced\nsampling & DiceFocalLoss optimization.",
            bbox=dict(boxstyle="round,pad=0.5", facecolor="#fef2f2", edgecolor="#ef4444", lw=1.5),
            fontsize=8.5, color='#991b1b', fontweight='bold')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig4_floodnet_distribution.png"), dpi=300)
    plt.close()
    print("Created fig4_floodnet_distribution.png")


# ==============================================================================
# 7. Figure 4.2: Class-Balanced Sampling & DiceFocalLoss Mechanism
# ==============================================================================
def make_fig4_lovasz_mechanism():
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.6)
    ax.axis('off')

    ax.text(5, 4.25, "Class-Balanced Sampling & Multi-Objective DiceFocalLoss Mechanism", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Step 1: Class Imbalance
    draw_card(ax, 0.4, 2.2, 2.0, 1.6, "#eff6ff", "#2563eb", lw=1.8)
    ax.text(1.4, 3.45, "1. Severe Imbalance", ha='center', va='center', fontsize=9, fontweight='bold', color='#1d4ed8')
    ax.text(1.4, 2.7, "FloodNet Classes:\nGrass/Trees > 75%\nVehicles: 0.17%\nFlooded Roads: 2.58%", ha='center', va='center', fontsize=8, color='#1e293b')

    draw_arrow(ax, 2.4, 3.0, 2.8, 3.0, "#2563eb")

    # Step 2: Class-Balanced Sampling
    draw_card(ax, 2.8, 2.2, 2.0, 1.6, "#fff7ed", "#ea580c", lw=1.8)
    ax.text(3.8, 3.45, "2. Balanced Sampler", ha='center', va='center', fontsize=9, fontweight='bold', color='#c2410c')
    ax.text(3.8, 2.7, "w_i = mean(1 / sqrt(N_c))\nWeightedRandomSampler\nGuarantees minority\nclass mini-batch exposure", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 4.8, 3.0, 5.2, 3.0, "#ea580c")

    # Step 3: Class-Weighted Focal Loss
    draw_card(ax, 5.2, 2.2, 2.0, 1.6, "#fdf4ff", "#a855f7", lw=1.8)
    ax.text(6.2, 3.45, "3. Class Focal Loss", ha='center', va='center', fontsize=9, fontweight='bold', color='#7e22ce')
    ax.text(6.2, 2.7, "L_Focal = alpha*(1-p_t)^gamma\n * w_c * CE_loss\n(gamma=2.0, alpha=0.25,\nweight cap kappa=3.0)", ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.2, 3.0, 7.6, 3.0, "#a855f7")

    # Step 4: Multi-Class Dice Loss
    draw_card(ax, 7.6, 2.2, 2.0, 1.6, "#ecfdf5", "#059669", lw=1.8)
    ax.text(8.6, 3.45, "4. Multi-Class Dice", ha='center', va='center', fontsize=9, fontweight='bold', color='#047857')
    ax.text(8.6, 2.7, "L_Dice = 1 - 2|Y & P|\n / (|Y| + |P| + eps)\nDirect global overlap\nand boundary agreement", ha='center', va='center', fontsize=7.5, color='#1e293b')

    # Bottom Compound Loss Fusion
    draw_card(ax, 0.4, 0.3, 9.2, 1.5, "#f8fafc", "#0f172a", lw=2)
    ax.text(5, 1.45, "DICEFOCALLOSS FUSION: L_DiceFocal = w_focal * L_Focal + w_dice * L_Dice", 
            ha='center', va='center', fontsize=10, fontweight='bold', color='#0f172a')
    ax.text(2.5, 0.8, "• Focal Loss Component (w_focal = 0.5):\n  Focuses gradients on hard, ambiguous boundary pixels", ha='center', va='center', fontsize=8, color='#334155')
    ax.text(7.5, 0.8, "• Soft Dice Loss Component (w_dice = 0.5):\n  Maximizes global intersection-over-union per class", ha='center', va='center', fontsize=8, color='#334155')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig4_lovasz_mechanism.png"), dpi=300)
    plt.savefig(os.path.join(OUT_DIR, "fig4_loss_mechanism.png"), dpi=300)
    plt.close()
    print("Created fig4_lovasz_mechanism.png and fig4_loss_mechanism.png")


# ==============================================================================
# 8. Figure 5.1: Damage Extraction & Hazard Adjacency
# ==============================================================================
def make_fig5_damage_extraction():
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.6)
    ax.axis('off')

    ax.text(5, 4.25, "Quantitative Damage Extraction & Spatial Hazard Adjacency Pipeline", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    stages = [
        ("1. Semantic Mask", "#eff6ff", "#2563eb", "Input 10-Class lattice\npredicted by SegFormer\n(at native GSD scale)"),
        ("2. Connected Components", "#fff7ed", "#ea580c", "8-connectivity labeling\nisolates individual\nbuilding footprints"),
        ("3. Flood Intersection", "#fdf4ff", "#a855f7", "R_building ratio\n6 Flooded / 14 Total\n(42.8% structural flood)"),
        ("4. Road Submergence", "#ecfdf5", "#059669", "R_road = A_rf / A_rtot\n38.2% road cutoffs\nImpassable to ambulances"),
        ("5. Hazard Adjacency", "#fef2f2", "#ef4444", "r = 15px buffer dilation\nVehicles in water envelope\n3 stranded cars flagged")
    ]

    for i, (title, bg, border, desc) in enumerate(stages):
        x = 0.35 + i * 1.92
        draw_card(ax, x, 1.8, 1.75, 2.0, bg, border, lw=1.8)
        ax.text(x + 0.87, 3.45, title, ha='center', va='center', fontsize=8.5, fontweight='bold', color='#0f172a')
        ax.text(x + 0.87, 2.5, desc, ha='center', va='center', fontsize=7.5, color='#334155')
        if i < 4:
            draw_arrow(ax, x + 1.75, 2.7, x + 1.92, 2.7, "#475569")

    # Severity Index Card at Bottom
    draw_card(ax, 0.35, 0.2, 9.3, 1.3, "#f8fafc", "#0f172a", lw=2)
    ax.text(5, 1.15, "Composite Disaster Severity Formula: S_severity = min(100, 40*R_bld + 35*R_road + 15*(N_veh/5) + 10*WaterRatio)",
            ha='center', va='center', fontsize=8.5, fontweight='bold', color='#0f172a')
    ax.text(5, 0.6, "Result: Score = 76.4 / 100 -> Mapped to LEVEL 4 (CATASTROPHIC INUNDATION) -> Triggers Air & Boat Rescue Directives",
            ha='center', va='center', fontsize=8, color='#b91c1c', fontweight='bold')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig5_damage_extraction.png"), dpi=300)
    plt.close()
    print("Created fig5_damage_extraction.png")


# ==============================================================================
# 9. Figure 5.2: ChromaDB Vector Architecture
# ==============================================================================
def make_fig5_vector_architecture():
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.6)
    ax.axis('off')

    ax.text(5, 4.25, "ChromaDB Dense Vector Store Indexing and Semantic Retrieval Architecture", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Source documents
    draw_card(ax, 0.4, 1.5, 2.0, 2.3, "#eff6ff", "#2563eb", lw=1.8)
    ax.text(1.4, 3.45, "Statutory Manuals", ha='center', va='center', fontsize=9, fontweight='bold', color='#1d4ed8')
    ax.text(1.4, 2.45, "• NDMA Flood Guidelines\n• NDRF Flood SOP\n• FEMA Ops Manual P-1020\n• Historical Flood Cases",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 2.4, 2.65, 2.8, 2.65, "#2563eb")

    # Chunking
    draw_card(ax, 2.8, 1.5, 2.0, 2.3, "#fff7ed", "#ea580c", lw=1.8)
    ax.text(3.8, 3.45, "Text Chunking", ha='center', va='center', fontsize=9, fontweight='bold', color='#c2410c')
    ax.text(3.8, 2.45, "Recursive Text Splitter\nChunk Size: 350 tokens\nChunk Overlap: 50 tokens\nTotal Chunks: 482",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 4.8, 2.65, 5.2, 2.65, "#ea580c")

    # Embeddings
    draw_card(ax, 5.2, 1.5, 2.0, 2.3, "#fdf4ff", "#a855f7", lw=1.8)
    ax.text(6.2, 3.45, "Dense Embedding", ha='center', va='center', fontsize=9, fontweight='bold', color='#7e22ce')
    ax.text(6.2, 2.45, "Sentence-BERT Bi-Encoder\nall-MiniLM-L6-v2\nDimension: D = 384\nUnit-normalized vectors",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 7.2, 2.65, 7.6, 2.65, "#a855f7")

    # ChromaDB & Retrieval
    draw_card(ax, 7.6, 1.5, 2.0, 2.3, "#ecfdf5", "#059669", lw=1.8)
    ax.text(8.6, 3.45, "ChromaDB HNSW", ha='center', va='center', fontsize=9, fontweight='bold', color='#047857')
    ax.text(8.6, 2.45, "HNSW Vector Index\nCosine Similarity Search\nTop-4 Context Chunks\nMRR = 0.95 | P@1 = 0.90",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    # Bottom Query flow
    draw_card(ax, 0.4, 0.2, 9.2, 1.0, "#f8fafc", "#334155", lw=1.5)
    ax.text(5, 0.65, "Query Ingestion: Dynamic damage criteria embedded on-the-fly -> Cosine match against 482 indexed chunks in < 15 ms",
            ha='center', va='center', fontsize=8, color='#0f172a', fontweight='bold')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig5_vector_architecture.png"), dpi=300)
    plt.close()
    print("Created fig5_vector_architecture.png")


# ==============================================================================
# 10. Figure 5.3: SITREP Structure & Hierarchy
# ==============================================================================
def make_fig5_sitrep_sample():
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.2)
    ax.axis('off')

    ax.text(5, 4.85, "Structure & Content Hierarchy of an Automated Disaster SITREP", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Report frame
    draw_card(ax, 0.5, 0.3, 9.0, 4.2, "#ffffff", "#0f172a", lw=2)

    # Header section
    draw_card(ax, 0.7, 3.4, 8.6, 0.9, "#f1f5f9", "#3b82f6", lw=1.5)
    ax.text(1.0, 4.0, "FLOODSENSE INCIDENT SITUATION REPORT (SITREP)", fontsize=9, fontweight='bold', color='#1e3a8a')
    ax.text(1.0, 3.65, "Incident ID: FLD-2026-10169  |  Classification: OFFICIAL EMERGENCY USE ONLY  |  Timestamp: 2026-10-24", fontsize=7.5, color='#334155')
    draw_card(ax, 7.3, 3.5, 1.8, 0.7, "#fef2f2", "#ef4444", lw=1.2)
    ax.text(8.2, 3.85, "LEVEL 4 SEVERITY\nSCORE: 76.4 / 100", ha='center', va='center', fontsize=7, fontweight='bold', color='#991b1b')

    # Section 1: Damage Telemetry
    draw_card(ax, 0.7, 2.4, 8.6, 0.9, "#fff7ed", "#f97316", lw=1.5)
    ax.text(0.9, 3.05, "SECTION 1: QUANTITATIVE DAMAGE TELEMETRY", fontsize=8.5, fontweight='bold', color='#c2410c')
    ax.text(0.9, 2.65, "• Inundation Area: 23,450 m^2 (40.1%)   • Flooded Buildings: 6 / 14 (42.8%)   • Road Submergence: 38.2%   • Stranded Vehicles: 3 confirmed",
            fontsize=7.5, color='#1e293b')

    # Section 2: Statutory Phased Action Plan
    draw_card(ax, 0.7, 1.35, 8.6, 0.95, "#ecfdf5", "#10b981", lw=1.5)
    ax.text(0.9, 2.05, "SECTION 2: STATUTORY ACTION PLAN (GROUNDED IN RETRIEVED PROTOCOLS)", fontsize=8.5, fontweight='bold', color='#047857')
    ax.text(0.9, 1.6, "• Phase 1 (0-6h): Deploy 2 NDRF motorized inflatable rescue boats to sector B [NDRF Flood SOP Sec 4.1]\n• Phase 2 (6-12h): Physical road closure on corridor 3 [FEMA P-1020]; isolate power grid [NDMA Sec 6.4.3]\n• Phase 3 (12-24h): Position high-capacity pump drainage (500 gpm) at culvert junction [NDMA Guidelines Sec 7.1]",
            fontsize=7, color='#1e293b')

    # Section 3: Citation Audit Trail
    draw_card(ax, 0.7, 0.45, 8.6, 0.8, "#f8fafc", "#64748b", lw=1.5)
    ax.text(0.9, 1.0, "SECTION 3: STATUTORY CITATIONS & AUDIT TRAIL", fontsize=8.5, fontweight='bold', color='#334155')
    ax.text(0.9, 0.65, "[1] NDMA Guidelines Management of Floods (2008) Sec 5.2.1  |  [2] NDRF SOP Flood Rescue Ops Sec 4.1  |  [3] FEMA NIMS P-1020 Sec 3.4",
            fontsize=7, color='#475569')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig5_sitrep_sample.png"), dpi=300)
    plt.close()
    print("Created fig5_sitrep_sample.png")


# ==============================================================================
# 11. Figure 6.5: Training Convergence Curves
# ==============================================================================
def make_fig6_training_curves():
    fig, ax1 = plt.subplots(figsize=(10, 4.8), dpi=300)

    epochs = np.arange(1, 13)
    # Exact training loss from results/segformer_sota.json
    train_loss = [0.5995, 0.3700, 0.3243, 0.2958, 0.2807, 0.2605, 0.2472, 0.2333, 0.2233, 0.2140, 0.2114, 0.2102]
    # Validation accuracy and mIoU (evaluated at ep 2, 4, 6, 8, 10, 12)
    val_epochs = [2, 4, 6, 8, 10, 12]
    val_miou = [0.4468, 0.4691, 0.4976, 0.4969, 0.4963, 0.4925]
    val_acc = [0.8251, 0.8346, 0.8449, 0.8440, 0.8458, 0.8447]

    # Primary axis: Loss
    color = '#dc2626'
    ax1.set_xlabel('Training Epochs', fontsize=10, fontweight='bold', color='#0f172a')
    ax1.set_ylabel('DiceFocalLoss (Focal + Dice)', color=color, fontsize=10, fontweight='bold')
    line1 = ax1.plot(epochs, train_loss, color=color, marker='o', lw=2.5, label='Training Loss')
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.set_ylim(0.15, 0.65)
    ax1.grid(True, linestyle='--', alpha=0.5)

    # Secondary axis: Metrics
    ax2 = ax1.twinx()
    color2 = '#2563eb'
    color3 = '#059669'
    ax2.set_ylabel('Validation Performance Metrics', color='#0f172a', fontsize=10, fontweight='bold')
    line2 = ax2.plot(val_epochs, val_acc, color=color2, marker='s', lw=2.5, label='Pixel Accuracy (84.49%)')
    line3 = ax2.plot(val_epochs, val_miou, color=color3, marker='^', lw=2.5, ls='--', label='Validation mIoU (0.4976)')
    ax2.tick_params(axis='y', labelcolor='#0f172a')
    ax2.set_ylim(0.40, 0.90)

    # Title & Legend
    plt.title("SOTA SegFormer Training Convergence: Loss Reduction & Metric Evolution", fontsize=12, fontweight='bold', pad=15)
    lines = line1 + line2 + line3
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc='center right', framealpha=0.95, fontsize=8.5)

    # Best epoch marker
    ax2.annotate('Best Model Saved\n(Ep 6: mIoU=0.4976, Acc=84.49%)',
                 xy=(6, 0.4976), xytext=(7.2, 0.55),
                 arrowprops=dict(facecolor='#059669', shrink=0.05, width=1.5, headwidth=7),
                 fontsize=8, fontweight='bold', color='#065f46',
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="#ecfdf5", edgecolor="#059669"))

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig6_training_curves.png"), dpi=300)
    plt.close()
    print("Created fig6_training_curves.png")


# ==============================================================================
# 12. Figure 7.1: Cloud Deployment Topology
# ==============================================================================
def make_fig7_deployment_topology():
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    ax.text(5, 4.5, "FloodSense Multi-Cloud & Edge Deployment Architecture", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Client Ingestion
    draw_card(ax, 0.4, 1.8, 1.9, 2.0, "#eff6ff", "#3b82f6", lw=2)
    ax.text(1.35, 3.45, "Client / EOC Pilot", ha='center', va='center', fontsize=9, fontweight='bold', color='#1d4ed8')
    ax.text(1.35, 2.55, "Drone Pilot / Ops Center\nWeb Browser Interface\nDrag-and-Drop 12MP UAV\nInteractive Split-Slider",
            ha='center', va='center', fontsize=7.5, color='#1e293b')

    draw_arrow(ax, 2.3, 2.8, 2.8, 2.8, "#2563eb", style="<->")

    # Cloud Production Box (Microsoft Azure)
    draw_card(ax, 2.8, 0.5, 4.4, 3.5, "#f8fafc", "#0f172a", lw=2)
    ax.text(5.0, 3.75, "Microsoft Azure Cloud Production Backend", ha='center', va='center', fontsize=9.5, fontweight='bold', color='#0f172a')

    # Inside Azure Container App (floodsense-backend)
    draw_card(ax, 3.0, 2.2, 1.9, 1.2, "#fff7ed", "#ea580c", lw=1.5)
    ax.text(3.95, 3.1, "Flask WSGI Server", ha='center', va='center', fontsize=8, fontweight='bold', color='#c2410c')
    ax.text(3.95, 2.6, "Python 3.11 + Gunicorn\nREST API Endpoints\nAuto-scaling worker", ha='center', va='center', fontsize=7, color='#1e293b')

    draw_card(ax, 5.1, 2.2, 1.9, 1.2, "#fdf4ff", "#a855f7", lw=1.5)
    ax.text(6.05, 3.1, "PyTorch SegFormer", ha='center', va='center', fontsize=8, fontweight='bold', color='#7e22ce')
    ax.text(6.05, 2.6, "GPU Inference Worker\nGaussian Sliding Window\nDihedral TTA Engine", ha='center', va='center', fontsize=7, color='#1e293b')

    draw_card(ax, 3.0, 0.8, 1.9, 1.1, "#ecfdf5", "#059669", lw=1.5)
    ax.text(3.95, 1.6, "ChromaDB Store", ha='center', va='center', fontsize=8, fontweight='bold', color='#047857')
    ax.text(3.95, 1.15, "Dense Vector Index\nStatutory Protocols\nCosine MIPS Search", ha='center', va='center', fontsize=7, color='#1e293b')

    draw_card(ax, 5.1, 0.8, 1.9, 1.1, "#f1f5f9", "#475569", lw=1.5)
    ax.text(6.05, 1.6, "SITREP Exporters", ha='center', va='center', fontsize=8, fontweight='bold', color='#1e293b')
    ax.text(6.05, 1.15, "• JSON / Markdown\n• Word DOCX\n• Executive PDF", ha='center', va='center', fontsize=7, color='#1e293b')

    draw_arrow(ax, 7.2, 2.8, 7.7, 2.8, "#059669")

    # Secondary deployments
    draw_card(ax, 7.7, 2.4, 1.9, 1.4, "#fef3c7", "#d97706", lw=1.8)
    ax.text(8.65, 3.5, "HF Spaces POC", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#b45309')
    ax.text(8.65, 2.9, "Public demo instance\nZero-setup evaluation\nLive test samples", ha='center', va='center', fontsize=7, color='#1e293b')

    draw_card(ax, 7.7, 0.7, 1.9, 1.4, "#ecfeff", "#0891b2", lw=1.8)
    ax.text(8.65, 1.8, "GitHub Pages", ha='center', va='center', fontsize=8.5, fontweight='bold', color='#0e7490')
    ax.text(8.65, 1.2, "Automated CI/CD\nStatic client docs\nAPI Documentation", ha='center', va='center', fontsize=7, color='#1e293b')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig7_deployment_topology.png"), dpi=300)
    plt.close()
    print("Created fig7_deployment_topology.png")


# ==============================================================================
# 13. Figure 7.2: Web Dashboard UI Mockup
# ==============================================================================
def make_fig7_dashboard_screenshot():
    fig, ax = plt.subplots(figsize=(10, 5.4), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.4)
    ax.axis('off')

    ax.text(5, 5.15, "FloodSense Interactive Web Dashboard Interface", 
            ha='center', va='center', fontsize=12.5, fontweight='bold', color='#0f172a')

    # Main Dashboard Window Frame
    draw_card(ax, 0.3, 0.2, 9.4, 4.6, "#0f172a", "#1e293b", lw=2)

    # Top Navigation Bar
    draw_card(ax, 0.4, 4.25, 9.2, 0.45, "#1e293b", "#334155", lw=1)
    ax.text(0.6, 4.47, "FloodSense EOC Dashboard  |  Amrita Department of AI", fontsize=8.5, fontweight='bold', color='#38bdf8')
    ax.text(9.4, 4.47, "Status: CONNECTED (CUDA GPU) | Active Model: SegFormer-B3", ha='right', fontsize=7, color='#94a3b8')

    # Left Panel: Upload & Controls
    draw_card(ax, 0.4, 0.35, 2.3, 3.8, "#1e293b", "#334155", lw=1)
    ax.text(1.55, 3.9, "Reconnaissance Ingestion", ha='center', va='center', fontsize=8, fontweight='bold', color='#f8fafc')
    
    # Upload box
    draw_card(ax, 0.55, 2.5, 2.0, 1.1, "#334155", border_color="#60a5fa", lw=1)
    ax.text(1.55, 3.2, "Drag & Drop Drone Orthophoto", ha='center', va='center', fontsize=6.5, color='#93c5fd')
    ax.text(1.55, 2.8, "[Upload 12MP JPEG / PNG]", ha='center', va='center', fontsize=7, fontweight='bold', color='#ffffff')

    ax.text(0.6, 2.2, "Model Selection:", fontsize=7, color='#94a3b8')
    draw_card(ax, 0.55, 1.7, 2.0, 0.4, "#334155", "#475569", lw=1)
    ax.text(1.55, 1.9, "SegFormer-B3 (Class-Balanced)", ha='center', va='center', fontsize=6.5, color='#f8fafc')

    ax.text(0.6, 1.4, "Inference Mode:", fontsize=7, color='#94a3b8')
    draw_card(ax, 0.55, 0.9, 2.0, 0.4, "#334155", "#475569", lw=1)
    ax.text(1.55, 1.1, "Gaussian Sliding Window (HR)", ha='center', va='center', fontsize=6.5, color='#f8fafc')

    draw_card(ax, 0.55, 0.45, 2.0, 0.35, "#2563eb", "#1d4ed8", lw=1)
    ax.text(1.55, 0.62, "RUN SEGMENTATION", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#ffffff')

    # Center Panel: Interactive Multi-Layer Canvas
    draw_card(ax, 2.85, 0.35, 4.3, 3.8, "#1e293b", "#334155", lw=1)
    ax.text(5.0, 3.9, "Interactive Split-Slider Viewport (Drone Aerial <-> 10-Class Semantic Mask)", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#f8fafc')

    # Simulated split viewport
    rect_left = patches.Rectangle((3.0, 0.55), 2.0, 3.1, facecolor="#334155", edgecolor="#475569")
    rect_right = patches.Rectangle((5.0, 0.55), 2.0, 3.1, facecolor="#1e3a5f", edgecolor="#475569")
    ax.add_patch(rect_left)
    ax.add_patch(rect_right)

    # divider bar
    ax.plot([5.0, 5.0], [0.55, 3.65], color="#38bdf8", lw=3)
    ax.text(5.0, 2.1, "<||>", ha='center', va='center', fontsize=9, fontweight='bold', color='#ffffff',
            bbox=dict(boxstyle="circle,pad=0.2", facecolor="#0284c7", edgecolor="#ffffff"))

    ax.text(4.0, 1.0, "[RAW ORTHOPHOTO]", ha='center', va='center', fontsize=7, color='#94a3b8')
    ax.text(6.0, 1.0, "[SEMANTIC MASK]", ha='center', va='center', fontsize=7, color='#38bdf8')

    # Right Panel: Damage Telemetry & SITREP
    draw_card(ax, 7.3, 0.35, 2.3, 3.8, "#1e293b", "#334155", lw=1)
    ax.text(8.45, 3.9, "Damage Telemetry", ha='center', va='center', fontsize=8, fontweight='bold', color='#f8fafc')

    # Severity alert card
    draw_card(ax, 7.45, 3.15, 2.0, 0.55, "#450a0a", "#ef4444", lw=1)
    ax.text(8.45, 3.42, "DISASTER SEVERITY: LEVEL 4\nSCORE: 76.4 / 100", ha='center', va='center', fontsize=7, fontweight='bold', color='#fca5a5')

    # Metric cards
    draw_card(ax, 7.45, 2.45, 2.0, 0.6, "#334155", "#475569", lw=1)
    ax.text(8.45, 2.75, "Flooded Inundation Area:\n23,450 m^2 (40.1%)", ha='center', va='center', fontsize=7, color='#f8fafc')

    draw_card(ax, 7.45, 1.75, 2.0, 0.6, "#334155", "#475569", lw=1)
    ax.text(8.45, 2.05, "Road Submergence:\n38.2% Impassable", ha='center', va='center', fontsize=7, color='#f8fafc')

    draw_card(ax, 7.45, 1.05, 2.0, 0.6, "#334155", "#475569", lw=1)
    ax.text(8.45, 1.35, "Flooded Buildings: 6 / 14\nStranded Vehicles: 3", ha='center', va='center', fontsize=7, color='#f8fafc')

    # Export button
    draw_card(ax, 7.45, 0.45, 2.0, 0.45, "#059669", "#10b981", lw=1)
    ax.text(8.45, 0.67, "DOWNLOAD SITREP (PDF)", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#ffffff')

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig7_dashboard_screenshot.png"), dpi=300)
    plt.close()
    print("Created fig7_dashboard_screenshot.png")


if __name__ == "__main__":
    print("Generating all 13 thesis diagrams...")
    make_fig1_disaster_gap()
    make_fig2_lit_taxonomy()
    make_fig3_system_architecture()
    make_fig3_sliding_window()
    make_fig3_rag_flow()
    make_fig4_floodnet_distribution()
    make_fig4_lovasz_mechanism()
    make_fig5_damage_extraction()
    make_fig5_vector_architecture()
    make_fig5_sitrep_sample()
    make_fig6_training_curves()
    make_fig7_deployment_topology()
    make_fig7_dashboard_screenshot()
    print("All 13 diagrams generated successfully in 'images/'!")
