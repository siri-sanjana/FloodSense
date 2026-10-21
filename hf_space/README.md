---
title: FloodSense Segmentation Trial
emoji: 🌊
colorFrom: blue
colorTo: cyan
sdk: gradio
python_version: "3.12"
app_file: app.py
startup_duration_timeout: 30m
---

# FloodSense segmentation trial

This is an isolated Hugging Face Gradio Space prototype. It does not change the
main FloodSense Flask backend or the Vercel frontend.

The prototype runs the public SegFormer-B0 ADE20K checkpoint and maps selected
ADE20K classes to FloodNet-style labels. It is **not** the project's fine-tuned
FloodNet checkpoint, so segmentation quality and class semantics differ from
the trained model. The checkpoint is not included in the Git repository.

This first deployment trial supports image segmentation and a visualization
only. It does not include the existing Flask REST API, depth estimation, RAG,
Groq report generation, Supabase integration, or conversational image Q&A.
Uploaded images are processed for inference and are not intentionally saved by
the app.

## Rollback

The application work is on the `hf-spaces-poc` branch. The pre-trial project
state is preserved at commit `47a2861` on the local
`floodsense-pre-hf-spaces` branch. The production `main` branch is not modified
by this prototype.

## Deploy as a separate Space

Create a **Gradio** Space and select **ZeroGPU** hardware if the account is
eligible. Hugging Face currently limits free ZeroGPU Space hosting to personal
accounts in good standing with a verified email and an account at least 30 days
old. To publish this directory as the Space repository root, from the
FloodSense checkout run:

```bash
git subtree split --prefix=hf_space -b hf-space-deploy
git remote add hf-space https://huggingface.co/spaces/<username>/<space-name>
git push hf-space hf-space-deploy:main
```

If `git remote add` reports that `hf-space` already exists, update it with
`git remote set-url hf-space https://huggingface.co/spaces/<username>/<space-name>`.
The Space is public by default; do not add secrets or private data to it.

The Space requires ZeroGPU-compatible PyTorch. Its separate requirements file
pins PyTorch 2.8 and torchvision 0.23, without changing the main project's
dependencies.
