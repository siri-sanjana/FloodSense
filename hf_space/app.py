"""Standalone Gradio entry point for the reversible Hugging Face trial."""

import gradio as gr
import spaces
import torch
import torch.nn.functional as functional
from PIL import Image
from transformers import AutoImageProcessor, SegformerForSemanticSegmentation

from segmentation import build_overlay, map_ade20k_to_floodnet, summarize_mask

MODEL_ID = "nvidia/segformer-b0-finetuned-ade-512-512"
DEVICE = "cuda"

processor = AutoImageProcessor.from_pretrained(MODEL_ID)
model = SegformerForSemanticSegmentation.from_pretrained(MODEL_ID).to(DEVICE)
model.eval()


@spaces.GPU(duration=90)
def analyze_image(image):
    if image is None:
        raise gr.Error("Upload an image to run segmentation.")

    image = image.convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    inputs = {key: value.to(DEVICE) for key, value in inputs.items()}

    with torch.inference_mode():
        logits = model(**inputs).logits
        logits = functional.interpolate(
            logits,
            size=(512, 512),
            mode="bilinear",
            align_corners=False,
        )
        ade_mask = logits.argmax(dim=1)[0].cpu().numpy()

    floodnet_mask = map_ade20k_to_floodnet(ade_mask)
    return (
        build_overlay(image, floodnet_mask),
        summarize_mask(floodnet_mask),
        (
            f"Model: {MODEL_ID}\n"
            "This is an ADE20K-pretrained baseline, not the fine-tuned FloodNet "
            "checkpoint. FloodNet-style class labels are approximate mappings. "
            "Results are a demo and not operational guidance."
        ),
    )


demo = gr.Interface(
    fn=analyze_image,
    inputs=gr.Image(label="Upload an aerial flood image", type="pil"),
    outputs=[
        gr.Image(label="Segmentation overlay", type="pil"),
        gr.JSON(label="Class pixel counts"),
        gr.Textbox(label="Model and limitations", lines=4),
    ],
    title="FloodSense Segmentation Trial",
    description=(
        "Experimental image segmentation on Hugging Face ZeroGPU. "
        "The result is not ground truth or emergency-response advice."
    ),
    api_name="analyze",
)


if __name__ == "__main__":
    demo.launch()
