---
title: FloodSense Segmentation Trial
emoji: 🌊
colorFrom: blue
colorTo: cyan
sdk: gradio
sdk_version: 6.30.0
python_version: "3.12"
app_file: app.py
short_description: Experimental aerial flood image segmentation demo
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
hf auth login
hf auth whoami
hf repos create <username>/<space-name> --type space --space-sdk gradio \
  --flavor zero-a10g --public
git remote add hf-space https://huggingface.co/spaces/<username>/<space-name>
git subtree split --prefix=hf_space -b hf-space-deploy-updated
git push hf-space hf-space-deploy-updated:main
```

If `git remote add` reports that `hf-space` already exists, update it with
`git remote set-url hf-space https://huggingface.co/spaces/<username>/<space-name>`.
The public Space exposes its source code and demo. Do not add secrets, private
data, or production credentials. Visitors may need their own Hugging Face
accounts and available ZeroGPU quota to run inference.

The Space uses the platform-managed Gradio, `spaces`, and PyTorch packages.
Its separate requirements file includes the ZeroGPU-compatible torchvision
version without changing the main project's dependencies.
