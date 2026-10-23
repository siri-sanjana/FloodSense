export const FLOODNET_SAMPLES = {
  '10169': {
    id: '10169',
    title: 'FloodNet sample 10169 — Homes beside open ground',
    scene: 'Aerial view of homes, vegetation, roads, and an open field.',
    image: '/samples/10169.jpg',
    mask: '/samples/10169_mask.png',
  },
  '10815': {
    id: '10815',
    title: 'FloodNet sample 10815 — Homes, roads, and dense trees',
    scene: 'Aerial view of residential buildings, paved roads, and dense tree cover.',
    image: '/samples/10815.jpg',
    mask: '/samples/10815_mask.png',
  },
  '6423': {
    id: '6423',
    title: 'FloodNet sample 6423 — Road junction and residential blocks',
    scene: 'Aerial view of homes near a road junction, trees, and open green space.',
    image: '/samples/6423.jpg',
    mask: '/samples/6423_mask.png',
  },
} as const;

export type FloodNetSampleId = keyof typeof FLOODNET_SAMPLES;

export const FLOODNET_DATASET_DESCRIPTION =
  'FloodNet is a research dataset of high-resolution aerial imagery for post-flood scene understanding, with pixel-level semantic annotations. These sample IDs identify dataset images; geographic locations are not provided here. Scene captions describe visible content and are not geolocation claims.';

export const FLOODNET_CLASS_NAMES = [
  'Background',
  'Building - flooded',
  'Building - non-flooded',
  'Road - flooded',
  'Road - non-flooded',
  'Water',
  'Tree',
  'Vehicle',
  'Pool',
  'Grass',
] as const;

export async function loadFloodNetSampleImage(sampleId: FloodNetSampleId): Promise<File> {
  const sample = FLOODNET_SAMPLES[sampleId];
  const response = await fetch(sample.image);
  if (!response.ok) {
    throw new Error(`Could not load FloodNet sample ${sampleId} (${response.status}).`);
  }

  const image = await response.blob();
  return new File([image], `floodnet-${sampleId}.jpg`, {
    type: image.type || 'image/jpeg',
  });
}
